-- 1:1 reminders: a queue drained in small batches (feature "uno-a-uno", T5).
--
-- What:
--   uno_a_uno_recordatorios                 the queue: one row per person of a
--                                           1:1 to remind (leader and dirigido)
--   uno_a_uno_recordatorios_encolar(p_ahora)  queues tomorrow's 1:1s (Caracas)
--   uno_a_uno_recordatorios_reclamar(p_limite) leases a batch to send
--   uno_a_uno_recordatorios_resultado(id, ok, error)  records each send
-- All service_role only: the job route (app/api/uno-a-uno/recordatorios)
-- calls them with the admin client.
--
-- Why: user decisions 2026-10-24 (odd/tasks/uno-a-uno.md, T5): remind the
-- leader and the person the day before, at 7:00 Caracas, "pero si hay muchos
-- recordatorios no enviarlos al mismo tiempo, debemos tener una cola".
--
-- Flow: at 7:00 Caracas encolar inserts a row per participant with an email
-- for every agendado 1:1 of tomorrow (Caracas date) not yet queued, and marks
-- the 1:1 (recordatorio_enviado_en). Every few minutes the route reclamar's a
-- batch (FOR UPDATE SKIP LOCKED, leased for 10 minutes so two runs never send
-- the same row), sends them one by one, and reports each with resultado: sent,
-- or retried later with a growing wait, up to 5 attempts. A row whose 1:1 is no
-- longer agendado at the queued time is discarded instead of sent; reprogramar
-- clears recordatorio_enviado_en, so the new time is queued again.
--
-- Data safety: a new table and new functions; nothing existing changes.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.uno_a_uno_recordatorios_resultado(uuid, boolean, text);
--   DROP FUNCTION IF EXISTS public.uno_a_uno_recordatorios_reclamar(integer);
--   DROP FUNCTION IF EXISTS public.uno_a_uno_recordatorios_encolar(timestamptz);
--   DROP TABLE IF EXISTS public.uno_a_uno_recordatorios;

-- ─── The queue ──────────────────────────────────────────────────────

create table public.uno_a_uno_recordatorios (
  id uuid primary key default gen_random_uuid(),
  uno_a_uno_id uuid not null references public.uno_a_uno(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  email text not null,
  -- The 1:1 time this reminder is for; a reprogrammed 1:1 gets a new row.
  fecha_hora timestamptz not null,
  estado text not null default 'pendiente'
    constraint uno_a_uno_recordatorios_estado_check
    check (estado in ('pendiente', 'enviado', 'fallido', 'descartado')),
  intentos integer not null default 0,
  disponible_en timestamptz not null default now(),
  enviado_en timestamptz,
  error text,
  creado_en timestamptz not null default now(),
  constraint uno_a_uno_recordatorios_unico unique (uno_a_uno_id, usuario_id, fecha_hora)
);

comment on table public.uno_a_uno_recordatorios is
  'Queue of 1:1 reminder emails, one row per person. Written and read only through the uno_a_uno_recordatorios_* functions.';

create index uno_a_uno_recordatorios_pendientes_idx
  on public.uno_a_uno_recordatorios (disponible_en)
  where estado = 'pendiente';
create index uno_a_uno_recordatorios_usuario_id_idx on public.uno_a_uno_recordatorios (usuario_id);

alter table public.uno_a_uno_recordatorios enable row level security;
revoke all on table public.uno_a_uno_recordatorios from public, anon, authenticated;
grant select, insert, update, delete on table public.uno_a_uno_recordatorios to service_role;

-- ─── encolar ────────────────────────────────────────────────────────
-- Queues every agendado 1:1 whose date in Caracas is the day after p_ahora's
-- (also in Caracas). Returns how many reminder rows were added.

create or replace function public.uno_a_uno_recordatorios_encolar(p_ahora timestamptz default now())
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_manana date := (p_ahora at time zone 'America/Caracas')::date + 1;
  v_insertados integer;
begin
  with objetivo as (
    select o.id, o.fecha_hora
    from public.uno_a_uno o
    where o.estado = 'agendado'
      and o.recordatorio_enviado_en is null
      and (o.fecha_hora at time zone 'America/Caracas')::date = v_manana
    for update of o
  ),
  marcados as (
    update public.uno_a_uno o
       set recordatorio_enviado_en = p_ahora
      from objetivo t
     where o.id = t.id
    returning o.id
  ),
  nuevos as (
    insert into public.uno_a_uno_recordatorios (uno_a_uno_id, usuario_id, email, fecha_hora, disponible_en) -- noqa: insert-into
    select t.id, p.usuario_id, btrim(u.email), t.fecha_hora, p_ahora
    from objetivo t
    join public.uno_a_uno_personas p on p.uno_a_uno_id = t.id
    join public.usuarios u on u.id = p.usuario_id
    where nullif(btrim(u.email), '') is not null
    on conflict (uno_a_uno_id, usuario_id, fecha_hora) do nothing
    returning 1
  )
  select count(*) into v_insertados from nuevos;

  return v_insertados;
end;
$$;

comment on function public.uno_a_uno_recordatorios_encolar(timestamptz) is
  'Queues a reminder per person with an email for every agendado 1:1 of tomorrow (America/Caracas). Internal: the reminder job calls it.';

revoke all on function public.uno_a_uno_recordatorios_encolar(timestamptz) from public, anon, authenticated;
grant execute on function public.uno_a_uno_recordatorios_encolar(timestamptz) to service_role;

-- ─── reclamar ───────────────────────────────────────────────────────
-- Leases up to p_limite due rows for 10 minutes and returns what the email
-- needs. Rows whose 1:1 is no longer agendado at the queued time are marked
-- descartado and not returned.

create or replace function public.uno_a_uno_recordatorios_reclamar(p_limite integer default 25)
returns table (
  id uuid,
  uno_a_uno_id uuid,
  email text,
  nombre text,
  lado text,
  fecha_hora timestamptz,
  lugar text,
  con_quien jsonb,
  intentos integer
)
language plpgsql
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
begin
  if p_limite is null or p_limite < 1 or p_limite > 100 then
    raise exception 'El límite debe estar entre 1 y 100.' using errcode = '22023';
  end if;

  update public.uno_a_uno_recordatorios r
     set estado = 'descartado', error = 'El 1 a 1 ya no está agendado a esa hora.'
   where r.estado = 'pendiente'
     and r.disponible_en <= now()
     and not exists (select 1 from public.uno_a_uno o
                      where o.id = r.uno_a_uno_id and o.estado = 'agendado' and o.fecha_hora = r.fecha_hora);

  return query
  with lote as (
    select r.id
    from public.uno_a_uno_recordatorios r
    where r.estado = 'pendiente'
      and r.disponible_en <= now()
    order by r.disponible_en, r.id
    limit p_limite
    for update skip locked
  ),
  tomados as (
    update public.uno_a_uno_recordatorios r
       set disponible_en = now() + interval '10 minutes',
           intentos = r.intentos + 1
      from lote l
     where r.id = l.id
    returning r.id, r.uno_a_uno_id, r.usuario_id, r.email, r.fecha_hora, r.intentos
  )
  select t.id,
         t.uno_a_uno_id,
         t.email,
         us.nombre,
         p.lado,
         t.fecha_hora,
         o.lugar,
         (select coalesce(jsonb_agg(jsonb_build_object('nombre', ou.nombre, 'apellido', ou.apellido)
                                    order by ou.nombre, ou.apellido), '[]'::jsonb)
            from public.uno_a_uno_personas op
            join public.usuarios ou on ou.id = op.usuario_id
           where op.uno_a_uno_id = t.uno_a_uno_id and op.lado <> p.lado),
         t.intentos
  from tomados t
  join public.usuarios us on us.id = t.usuario_id
  join public.uno_a_uno o on o.id = t.uno_a_uno_id
  join public.uno_a_uno_personas p on p.uno_a_uno_id = t.uno_a_uno_id and p.usuario_id = t.usuario_id
  order by t.fecha_hora, t.id;
end;
$$;

comment on function public.uno_a_uno_recordatorios_reclamar(integer) is
  'Leases up to p_limite due reminders for 10 minutes and returns what each email needs; discards those whose 1:1 changed. Internal.';

revoke all on function public.uno_a_uno_recordatorios_reclamar(integer) from public, anon, authenticated;
grant execute on function public.uno_a_uno_recordatorios_reclamar(integer) to service_role;

-- ─── resultado ──────────────────────────────────────────────────────
-- Records one send: enviado, or back to pendiente after 2^intentos minutes,
-- and fallido after the fifth attempt.

create or replace function public.uno_a_uno_recordatorios_resultado(p_id uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_ok then
    update public.uno_a_uno_recordatorios r
       set estado = 'enviado', enviado_en = now(), error = null
     where r.id = p_id;
  else
    update public.uno_a_uno_recordatorios r
       set estado = case when r.intentos >= 5 then 'fallido' else 'pendiente' end,
           disponible_en = now() + make_interval(mins => power(2, least(r.intentos, 6))::integer),
           error = left(coalesce(p_error, 'Error desconocido'), 500)
     where r.id = p_id;
  end if;
  if not found then
    raise exception 'No encontramos ese recordatorio.' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.uno_a_uno_recordatorios_resultado(uuid, boolean, text) is
  'Records the outcome of one reminder send (enviado, or retried with a growing wait; fallido after 5 attempts). Internal.';

revoke all on function public.uno_a_uno_recordatorios_resultado(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.uno_a_uno_recordatorios_resultado(uuid, boolean, text) to service_role;
