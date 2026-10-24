-- 1:1 model: who leads whom, and scheduling / recording a 1:1.
--
-- What: two new tables (uno_a_uno, uno_a_uno_personas) and the functions that
-- are the only way to read or write them:
--   uno_a_uno_dirigidos_de(usuario)   internal rule, service_role only
--   uno_a_uno_crear(...)              internal insert, service_role only
--   mis_dirigidos()                   the people the caller leads
--   uno_a_uno_agendar / uno_a_uno_registrar_sin_agenda / uno_a_uno_registrar /
--   uno_a_uno_reprogramar / uno_a_uno_cancelar   the state changes
--   mis_uno_a_uno()                   the caller's 1:1s
--
-- Why: task T3 of the 1:1 redesign (feature "uno-a-uno"). Anybody who leads
-- somebody schedules a 1:1 with them, gets a reminder (T5) and records it
-- afterwards. The pastoral module this replaces never closed that loop.
--
-- Who leads whom (one rule, uno_a_uno_dirigidos_de). The leader unit is the
-- person plus their spouse (talleres_conyuge_unico): a couple leads together.
--   GDV: a current Líder of a current group → that group's current Colíderes
--        and Miembros (never the other Líderes; a Colíder leads nobody).
--        Current group = activo, not eliminado, aprobado, season activa.
--        Current member = no fecha_salida and estado activo (or null).
--   Director de etapa (segmento_lideres director_etapa) → the current Líderes
--        of the current groups linked in director_etapa_grupos.
--   Director general → the directores de etapa of the segment: every one with
--        alcance 'segmento', only the ones marked in dg_directores_etapa for
--        that director general with alcance 'directores'.
--   Dream Team (servicio activo in an equipo activo): inside an equipo a higher
--        nivel leads a lower one (director > coordinador > lider > voluntario;
--        a voluntario leads nobody); the head of an equipo (its active
--        servicios with the highest nivel, at least lider) leads the head of
--        each active direct sub-equipo.
--   Never oneself nor one's own spouse.
--
-- Access: RLS is on with no policy and anon / authenticated hold no privilege
-- on the tables; every read and write goes through the definer functions
-- below. Only the leader side (including the leader's spouse) acts on a 1:1;
-- the dirigido side reads it without resumen and nota_privada. Closing an
-- existing 1:1 does not re-check the rule (the relationship may have ended).
--
-- Data safety: additive only. New tables and new functions; no existing table,
-- function, policy or row is changed. usuarios deletes are never blocked:
-- creado_por becomes null and the person's rows in uno_a_uno_personas go with
-- them (merging duplicate usuarios deletes rows).
--
-- Rollback (run in this order):
--   DROP FUNCTION IF EXISTS public.mis_uno_a_uno(timestamptz, timestamptz);
--   DROP FUNCTION IF EXISTS public.uno_a_uno_cancelar(uuid, text);
--   DROP FUNCTION IF EXISTS public.uno_a_uno_reprogramar(uuid, timestamptz);
--   DROP FUNCTION IF EXISTS public.uno_a_uno_registrar(uuid, text, text, timestamptz);
--   DROP FUNCTION IF EXISTS public.uno_a_uno_registrar_sin_agenda(uuid, timestamptz, text, text, text);
--   DROP FUNCTION IF EXISTS public.uno_a_uno_agendar(uuid, timestamptz, text);
--   DROP FUNCTION IF EXISTS public.mis_dirigidos();
--   DROP FUNCTION IF EXISTS public.uno_a_uno_crear(uuid, uuid, text, timestamptz, text, text, text);
--   DROP FUNCTION IF EXISTS public.uno_a_uno_dirigidos_de(uuid);
--   DROP TABLE IF EXISTS public.uno_a_uno_personas;
--   DROP TABLE IF EXISTS public.uno_a_uno;

-- ─── Tables ─────────────────────────────────────────────────────────

create table public.uno_a_uno (
  id uuid primary key default gen_random_uuid(),
  estado text not null default 'agendado'
    constraint uno_a_uno_estado_check check (estado in ('agendado', 'realizado', 'cancelado')),
  -- The scheduled time while agendado; when it happened once realizado.
  fecha_hora timestamptz not null,
  lugar text,
  resumen text,
  nota_privada text,
  motivo_cancelacion text,
  creado_por uuid references public.usuarios(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  realizado_en timestamptz,
  cancelado_en timestamptz,
  -- Set by the reminder job (T5); reprogramar clears it.
  recordatorio_enviado_en timestamptz,
  constraint uno_a_uno_realizado_check check (estado <> 'realizado' or realizado_en is not null),
  constraint uno_a_uno_cancelado_check check (estado <> 'cancelado' or cancelado_en is not null)
);

comment on table public.uno_a_uno is
  'A 1:1 between a leader and someone they lead. Read and written only through the uno_a_uno_* functions.';

-- The reminder job looks for agendado rows by date.
create index uno_a_uno_estado_fecha_hora_idx on public.uno_a_uno (estado, fecha_hora);
create index uno_a_uno_creado_por_idx on public.uno_a_uno (creado_por);

create table public.uno_a_uno_personas (
  uno_a_uno_id uuid not null references public.uno_a_uno(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  lado text not null
    constraint uno_a_uno_personas_lado_check check (lado in ('lider', 'dirigido')),
  primary key (uno_a_uno_id, usuario_id)
);

comment on table public.uno_a_uno_personas is
  'Who takes part in a 1:1 and on which side. Couples take part together.';

create index uno_a_uno_personas_usuario_id_idx on public.uno_a_uno_personas (usuario_id);

alter table public.uno_a_uno enable row level security;
alter table public.uno_a_uno_personas enable row level security;

revoke all on table public.uno_a_uno from public, anon, authenticated;
revoke all on table public.uno_a_uno_personas from public, anon, authenticated;
grant select, insert, update, delete on table public.uno_a_uno to service_role;
grant select, insert, update, delete on table public.uno_a_uno_personas to service_role;

-- ─── The rule: who a usuario leads ──────────────────────────────────

create or replace function public.uno_a_uno_dirigidos_de(p_usuario uuid)
returns table (usuario_id uuid, contextos text[])
language sql
stable security definer
set search_path to 'public'
as $$
  with unidad as (
    select x.id
    from (values (p_usuario), (public.talleres_conyuge_unico(p_usuario))) as x(id)
    where x.id is not null
  ),
  grupos_vigentes as (
    select g.id, g.nombre
    from public.grupos g
    join public.temporadas t on t.id = g.temporada_id
    where g.activo
      and not g.eliminado
      and g.estado_aprobacion = 'aprobado'
      and t.activa
  ),
  miembros_vigentes as (
    select gm.grupo_id, gm.usuario_id, gm.rol
    from public.grupo_miembros gm
    where gm.fecha_salida is null
      and coalesce(gm.estado, 'activo') = 'activo'
  ),
  gdv as (
    select m.usuario_id, 'GDV: ' || g.nombre as contexto
    from miembros_vigentes l
    join unidad u on u.id = l.usuario_id
    join grupos_vigentes g on g.id = l.grupo_id
    join miembros_vigentes m on m.grupo_id = l.grupo_id
    where l.rol = 'Líder'
      and m.rol in ('Colíder', 'Miembro')
  ),
  director_etapa as (
    select m.usuario_id, 'Director de etapa: ' || s.nombre as contexto
    from public.segmento_lideres sl
    join unidad u on u.id = sl.usuario_id
    join public.segmentos s on s.id = sl.segmento_id
    join public.director_etapa_grupos deg on deg.director_etapa_id = sl.id
    join grupos_vigentes g on g.id = deg.grupo_id
    join miembros_vigentes m on m.grupo_id = g.id
    where sl.tipo_lider = 'director_etapa'
      and m.rol = 'Líder'
  ),
  director_general as (
    select sl.usuario_id, 'Director general: ' || s.nombre as contexto
    from public.director_general_segmentos dgs
    join unidad u on u.id = dgs.usuario_id
    join public.segmentos s on s.id = dgs.segmento_id
    join public.segmento_lideres sl
      on sl.segmento_id = dgs.segmento_id
     and sl.tipo_lider = 'director_etapa'
    where dgs.alcance = 'segmento'
       or (dgs.alcance = 'directores'
           and exists (select 1
                       from public.dg_directores_etapa dde
                       where dde.dg_usuario_id = dgs.usuario_id
                         and dde.segmento_lider_id = sl.id))
  ),
  -- Active servicios in active equipos with the rank of their nivel.
  dt_niveles as (
    select sv.persona_id, sv.equipo_id, e.parent_equipo_id, e.label as equipo_label,
           case r.nivel
             when 'director' then 4
             when 'coordinador' then 3
             when 'lider' then 2
             else 1
           end as rango
    from public.dream_team_servicios sv
    join public.dream_team_equipos e on e.id = sv.equipo_id
    join public.dream_team_roles r on r.id = sv.rol_id
    where sv.estado = 'activo'
      and e.activo
  ),
  dt_servicios as (
    select n.*, max(n.rango) over (partition by n.equipo_id) as rango_max
    from dt_niveles n
  ),
  -- The head of an equipo: its servicios with the highest rank.
  dt_cabezas as (
    select s.persona_id, s.equipo_id, s.parent_equipo_id, s.equipo_label, s.rango
    from dt_servicios s
    where s.rango = s.rango_max
  ),
  dt_mismo_equipo as (
    select o.persona_id as usuario_id, 'Dream Team: ' || l.equipo_label as contexto
    from dt_servicios l
    join unidad u on u.id = l.persona_id
    join dt_servicios o on o.equipo_id = l.equipo_id and o.rango < l.rango
    where l.rango >= 2
  ),
  dt_sub_equipos as (
    select hc.persona_id as usuario_id, 'Dream Team: ' || hc.equipo_label as contexto
    from dt_cabezas hp
    join unidad u on u.id = hp.persona_id
    join dt_cabezas hc on hc.parent_equipo_id = hp.equipo_id
    where hp.rango >= 2
  ),
  todos as (
    select usuario_id, contexto from gdv
    union all
    select usuario_id, contexto from director_etapa
    union all
    select usuario_id, contexto from director_general
    union all
    select usuario_id, contexto from dt_mismo_equipo
    union all
    select usuario_id, contexto from dt_sub_equipos
  )
  select t.usuario_id, array_agg(distinct t.contexto order by t.contexto)
  from todos t
  where t.usuario_id not in (select id from unidad)
  group by t.usuario_id;
$$;

comment on function public.uno_a_uno_dirigidos_de(uuid) is
  'Who a usuario (with their spouse) leads, one row per person with every context. Internal: the 1:1 functions call it.';

revoke all on function public.uno_a_uno_dirigidos_de(uuid) from public, anon, authenticated;
grant execute on function public.uno_a_uno_dirigidos_de(uuid) to service_role;

-- ─── Internal insert ────────────────────────────────────────────────
-- Checks the rule and inserts a 1:1 with both couples. The callers validate
-- their own input first.

create or replace function public.uno_a_uno_crear(
  p_lider uuid,
  p_dirigido uuid,
  p_estado text,
  p_fecha_hora timestamptz,
  p_lugar text,
  p_resumen text,
  p_nota_privada text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_lider_conyuge uuid;
  v_dirigido_conyuge uuid;
begin
  if p_dirigido is null
     or not exists (select 1 from public.uno_a_uno_dirigidos_de(p_lider) d where d.usuario_id = p_dirigido) then
    raise exception 'No lideras a esta persona.' using errcode = '42501';
  end if;

  insert into public.uno_a_uno (estado, fecha_hora, lugar, resumen, nota_privada, creado_por, realizado_en) -- noqa: insert-into
  values (p_estado, p_fecha_hora, nullif(btrim(p_lugar), ''), p_resumen, nullif(btrim(p_nota_privada), ''), p_lider,
          case when p_estado = 'realizado' then now() end)
  returning id into v_id;

  v_lider_conyuge := public.talleres_conyuge_unico(p_lider);
  v_dirigido_conyuge := public.talleres_conyuge_unico(p_dirigido);

  insert into public.uno_a_uno_personas (uno_a_uno_id, usuario_id, lado)
  select v_id, x.usuario_id, x.lado
  from (values (p_lider, 'lider'),
               (v_lider_conyuge, 'lider'),
               (p_dirigido, 'dirigido'),
               (v_dirigido_conyuge, 'dirigido')) as x(usuario_id, lado)
  where x.usuario_id is not null
    -- A person on the leader side never shows up again as a dirigido.
    and (x.lado = 'lider' or x.usuario_id not in (p_lider, coalesce(v_lider_conyuge, p_lider)))
  on conflict (uno_a_uno_id, usuario_id) do nothing;

  return v_id;
end;
$$;

revoke all on function public.uno_a_uno_crear(uuid, uuid, text, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.uno_a_uno_crear(uuid, uuid, text, timestamptz, text, text, text) to service_role;

-- ─── mis_dirigidos ──────────────────────────────────────────────────

create or replace function public.mis_dirigidos()
returns table (usuario_id uuid, nombre text, apellido text, conyuge_id uuid, contextos text[])
language sql
stable security definer
set search_path to 'public'
as $$
  select d.usuario_id, u.nombre, u.apellido, public.talleres_conyuge_unico(d.usuario_id), d.contextos
  from public.uno_a_uno_dirigidos_de((select public.get_my_internal_id())) d
  join public.usuarios u on u.id = d.usuario_id
  order by u.nombre, u.apellido, d.usuario_id;
$$;

comment on function public.mis_dirigidos() is
  'The people the caller (with their spouse) leads, with their spouse and why.';

revoke all on function public.mis_dirigidos() from public, anon;
grant execute on function public.mis_dirigidos() to authenticated, service_role;

-- ─── agendar ────────────────────────────────────────────────────────

create or replace function public.uno_a_uno_agendar(
  p_dirigido_id uuid,
  p_fecha_hora timestamptz,
  p_lugar text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller uuid := public.get_my_internal_id();
begin
  if v_caller is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;
  if p_fecha_hora is null or p_fecha_hora <= now() then
    raise exception 'La fecha del 1 a 1 debe ser futura.' using errcode = '22023';
  end if;

  return public.uno_a_uno_crear(v_caller, p_dirigido_id, 'agendado', p_fecha_hora, p_lugar, null, null);
end;
$$;

revoke all on function public.uno_a_uno_agendar(uuid, timestamptz, text) from public, anon;
grant execute on function public.uno_a_uno_agendar(uuid, timestamptz, text) to authenticated, service_role;

-- ─── registrar sin agenda ───────────────────────────────────────────

create or replace function public.uno_a_uno_registrar_sin_agenda(
  p_dirigido_id uuid,
  p_fecha_hora timestamptz,
  p_resumen text,
  p_nota_privada text default null,
  p_lugar text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller uuid := public.get_my_internal_id();
begin
  if v_caller is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;
  if p_fecha_hora is null or p_fecha_hora > now() then
    raise exception 'La fecha de un 1 a 1 realizado no puede ser futura.' using errcode = '22023';
  end if;
  if nullif(btrim(p_resumen), '') is null then
    raise exception 'El resumen es obligatorio.' using errcode = '22023';
  end if;

  return public.uno_a_uno_crear(v_caller, p_dirigido_id, 'realizado', p_fecha_hora, p_lugar,
                                btrim(p_resumen), p_nota_privada);
end;
$$;

revoke all on function public.uno_a_uno_registrar_sin_agenda(uuid, timestamptz, text, text, text) from public, anon;
grant execute on function public.uno_a_uno_registrar_sin_agenda(uuid, timestamptz, text, text, text) to authenticated, service_role;

-- ─── registrar ──────────────────────────────────────────────────────

create or replace function public.uno_a_uno_registrar(
  p_id uuid,
  p_resumen text,
  p_nota_privada text default null,
  p_fecha_hora timestamptz default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller uuid := public.get_my_internal_id();
  v_estado text;
begin
  if v_caller is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;

  select u.estado into v_estado from public.uno_a_uno u where u.id = p_id for update;
  if not found then
    raise exception 'No encontramos este 1 a 1.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.uno_a_uno_personas p
                 where p.uno_a_uno_id = p_id and p.usuario_id = v_caller and p.lado = 'lider') then
    raise exception 'Solo quien lidera este 1 a 1 puede cambiarlo.' using errcode = '42501';
  end if;
  if v_estado <> 'agendado' then
    raise exception 'Este 1 a 1 ya no está agendado.' using errcode = '22023';
  end if;
  if p_fecha_hora > now() then
    raise exception 'La fecha de un 1 a 1 realizado no puede ser futura.' using errcode = '22023';
  end if;
  if nullif(btrim(p_resumen), '') is null then
    raise exception 'El resumen es obligatorio.' using errcode = '22023';
  end if;

  -- Recorded before its scheduled time: it happened by now.
  update public.uno_a_uno u
     set estado = 'realizado',
         resumen = btrim(p_resumen),
         nota_privada = nullif(btrim(p_nota_privada), ''),
         fecha_hora = coalesce(p_fecha_hora, least(u.fecha_hora, now())),
         realizado_en = now(),
         actualizado_en = now()
   where u.id = p_id;
end;
$$;

revoke all on function public.uno_a_uno_registrar(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.uno_a_uno_registrar(uuid, text, text, timestamptz) to authenticated, service_role;

-- ─── reprogramar ────────────────────────────────────────────────────

create or replace function public.uno_a_uno_reprogramar(p_id uuid, p_fecha_hora timestamptz)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller uuid := public.get_my_internal_id();
  v_estado text;
begin
  if v_caller is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;

  select u.estado into v_estado from public.uno_a_uno u where u.id = p_id for update;
  if not found then
    raise exception 'No encontramos este 1 a 1.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.uno_a_uno_personas p
                 where p.uno_a_uno_id = p_id and p.usuario_id = v_caller and p.lado = 'lider') then
    raise exception 'Solo quien lidera este 1 a 1 puede cambiarlo.' using errcode = '42501';
  end if;
  if v_estado <> 'agendado' then
    raise exception 'Este 1 a 1 ya no está agendado.' using errcode = '22023';
  end if;
  if p_fecha_hora is null or p_fecha_hora <= now() then
    raise exception 'La fecha del 1 a 1 debe ser futura.' using errcode = '22023';
  end if;

  -- A new date needs a new reminder.
  update public.uno_a_uno u
     set fecha_hora = p_fecha_hora,
         recordatorio_enviado_en = null,
         actualizado_en = now()
   where u.id = p_id;
end;
$$;

revoke all on function public.uno_a_uno_reprogramar(uuid, timestamptz) from public, anon;
grant execute on function public.uno_a_uno_reprogramar(uuid, timestamptz) to authenticated, service_role;

-- ─── cancelar ───────────────────────────────────────────────────────

create or replace function public.uno_a_uno_cancelar(p_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller uuid := public.get_my_internal_id();
  v_estado text;
begin
  if v_caller is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;

  select u.estado into v_estado from public.uno_a_uno u where u.id = p_id for update;
  if not found then
    raise exception 'No encontramos este 1 a 1.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.uno_a_uno_personas p
                 where p.uno_a_uno_id = p_id and p.usuario_id = v_caller and p.lado = 'lider') then
    raise exception 'Solo quien lidera este 1 a 1 puede cambiarlo.' using errcode = '42501';
  end if;
  if v_estado <> 'agendado' then
    raise exception 'Este 1 a 1 ya no está agendado.' using errcode = '22023';
  end if;

  update public.uno_a_uno u
     set estado = 'cancelado',
         motivo_cancelacion = nullif(btrim(p_motivo), ''),
         cancelado_en = now(),
         actualizado_en = now()
   where u.id = p_id;
end;
$$;

revoke all on function public.uno_a_uno_cancelar(uuid, text) from public, anon;
grant execute on function public.uno_a_uno_cancelar(uuid, text) to authenticated, service_role;

-- ─── mis_uno_a_uno ──────────────────────────────────────────────────
-- The caller's 1:1s from either side, optionally within [p_desde, p_hasta)
-- on fecha_hora. resumen and nota_privada only reach the leader side.

create or replace function public.mis_uno_a_uno(
  p_desde timestamptz default null,
  p_hasta timestamptz default null
)
returns table (
  id uuid,
  estado text,
  fecha_hora timestamptz,
  lugar text,
  mi_lado text,
  lideres jsonb,
  dirigidos jsonb,
  resumen text,
  nota_privada text,
  motivo_cancelacion text,
  realizado_en timestamptz,
  cancelado_en timestamptz
)
language sql
stable security definer
set search_path to 'public'
as $$
  select o.id,
         o.estado,
         o.fecha_hora,
         o.lugar,
         yo.lado,
         (select coalesce(jsonb_agg(jsonb_build_object('id', us.id, 'nombre', us.nombre, 'apellido', us.apellido)
                                    order by us.nombre, us.apellido), '[]'::jsonb)
            from public.uno_a_uno_personas p
            join public.usuarios us on us.id = p.usuario_id
           where p.uno_a_uno_id = o.id and p.lado = 'lider'),
         (select coalesce(jsonb_agg(jsonb_build_object('id', us.id, 'nombre', us.nombre, 'apellido', us.apellido)
                                    order by us.nombre, us.apellido), '[]'::jsonb)
            from public.uno_a_uno_personas p
            join public.usuarios us on us.id = p.usuario_id
           where p.uno_a_uno_id = o.id and p.lado = 'dirigido'),
         case when yo.lado = 'lider' then o.resumen end,
         case when yo.lado = 'lider' then o.nota_privada end,
         o.motivo_cancelacion,
         o.realizado_en,
         o.cancelado_en
  from public.uno_a_uno_personas yo
  join public.uno_a_uno o on o.id = yo.uno_a_uno_id
  where yo.usuario_id = (select public.get_my_internal_id())
    and (p_desde is null or o.fecha_hora >= p_desde)
    and (p_hasta is null or o.fecha_hora < p_hasta)
  order by o.fecha_hora, o.id;
$$;

comment on function public.mis_uno_a_uno(timestamptz, timestamptz) is
  'The caller''s 1:1s from either side; resumen and nota_privada only for the leader side.';

revoke all on function public.mis_uno_a_uno(timestamptz, timestamptz) from public, anon;
grant execute on function public.mis_uno_a_uno(timestamptz, timestamptz) to authenticated, service_role;
