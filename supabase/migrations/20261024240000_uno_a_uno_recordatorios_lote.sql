-- 1:1 reminders in batches, one email per person (feature "uno-a-uno", T5.2).
--
-- What: uno_a_uno_recordatorios_reclamar(p_limite) becomes
-- uno_a_uno_recordatorios_reclamar(p_personas, p_tope_diario):
--   * it leases whole people, not rows: every due row of up to p_personas
--     emails (default 100, the Resend batch size), so the route sends ONE email
--     per person listing all their 1:1s of tomorrow;
--   * it keeps the reminders within p_tope_diario emails per UTC day (default
--     60; Resend's free plan allows 100 a day shared with every other email of
--     the app, so 40 stay free for password resets and invitations); what does
--     not fit waits for the next run;
--   * it also discards the rows whose 1:1 has already started.
-- It returns usuario_id as well.
--
-- Why: user request 2026-10-24: "no es necesario uno a uno cada 5 minutos ...
-- creo que sí podemos enviar varios juntos" and the decisions recorded in
-- odd/tasks/uno-a-uno.md (T5.2): one summary email per person, sent in a
-- batch at 7:00 with retries at 7:30, 8:00 and 8:30, and a 60/day cap.
--
-- Data safety: functions only; the queue table and its rows are unchanged.
--
-- Rollback: DROP FUNCTION public.uno_a_uno_recordatorios_reclamar(integer, integer);
--   re-run its definition from 20261024220000_uno_a_uno_recordatorios.sql.

drop function public.uno_a_uno_recordatorios_reclamar(integer);

create or replace function public.uno_a_uno_recordatorios_reclamar(
  p_personas integer default 100,
  p_tope_diario integer default 60
)
returns table (
  id uuid,
  uno_a_uno_id uuid,
  usuario_id uuid,
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
declare
  v_enviados_hoy integer;
  v_personas integer;
begin
  if p_personas is null or p_personas < 1 or p_personas > 100 then
    raise exception 'La cantidad de personas debe estar entre 1 y 100.' using errcode = '22023';
  end if;
  if p_tope_diario is null or p_tope_diario < 0 or p_tope_diario > 10000 then
    raise exception 'El tope diario debe estar entre 0 y 10000.' using errcode = '22023';
  end if;

  -- A 1:1 that was cancelled, moved or has already started is not reminded.
  update public.uno_a_uno_recordatorios r
     set estado = 'descartado',
         error = case when exists (select 1 from public.uno_a_uno o
                                    where o.id = r.uno_a_uno_id and o.estado = 'agendado' and o.fecha_hora = r.fecha_hora)
                      then 'El 1 a 1 ya pasó.'
                      else 'El 1 a 1 ya no está agendado a esa hora.' end
   where r.estado = 'pendiente'
     and r.disponible_en <= now()
     and (r.fecha_hora <= now()
          or not exists (select 1 from public.uno_a_uno o
                          where o.id = r.uno_a_uno_id and o.estado = 'agendado' and o.fecha_hora = r.fecha_hora));

  -- Emails already sent today (Resend's quota day is the UTC calendar day).
  select count(distinct r.email) into v_enviados_hoy
  from public.uno_a_uno_recordatorios r
  where r.estado = 'enviado'
    and (r.enviado_en at time zone 'UTC')::date = (now() at time zone 'UTC')::date;

  v_personas := least(p_personas, greatest(p_tope_diario - v_enviados_hoy, 0));
  if v_personas = 0 then
    return;
  end if;

  return query
  with candidatas as (
    select r.id, r.email, r.disponible_en
    from public.uno_a_uno_recordatorios r
    where r.estado = 'pendiente'
      and r.disponible_en <= now()
    for update skip locked
  ),
  elegidas as (
    select c.email
    from candidatas c
    group by c.email
    order by min(c.disponible_en), c.email
    limit v_personas
  ),
  tomados as (
    update public.uno_a_uno_recordatorios r
       set disponible_en = now() + interval '10 minutes',
           intentos = r.intentos + 1
      from candidatas c
      join elegidas e on e.email = c.email
     where r.id = c.id
    returning r.id, r.uno_a_uno_id, r.usuario_id, r.email, r.fecha_hora, r.intentos
  )
  select t.id,
         t.uno_a_uno_id,
         t.usuario_id,
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
  order by t.email, t.fecha_hora, t.id;
end;
$$;

comment on function public.uno_a_uno_recordatorios_reclamar(integer, integer) is
  'Leases every due reminder of up to p_personas people (one email each) within p_tope_diario emails per UTC day; discards those whose 1:1 changed or already started. Internal.';

revoke all on function public.uno_a_uno_recordatorios_reclamar(integer, integer) from public, anon, authenticated;
grant execute on function public.uno_a_uno_recordatorios_reclamar(integer, integer) to service_role;
