-- noqa: insert-into
-- Estudiantes, Phase B — C5 volunteer attendance of Transit, Inside Out and
-- The Living Room (odd/tasks/estudiantes-fase-b.md, S1, S2, S4, C5).
--
-- What (definer functions, search_path ''):
--   1. estudiantes_voluntarios_rosters (turno, fecha) and
--      estudiantes_voluntarios_roster_servicios: the expected Estudiantes
--      volunteers of a past date, frozen once (the Niños V7 rule with tables
--      of its own). RLS on, no policies, no privileges for anon or
--      authenticated.
--   2. Internal helpers (no EXECUTE for PUBLIC, anon or authenticated):
--        estudiantes_voluntarios_equipos()        every active equipo in the
--          subtree of an ámbito (an active estudiantes / the_living_room node
--          with a Grupos de Chicas / Chicos sub-área: Transit, Inside Out, The
--          Living Room), with its nearest ámbito.
--        estudiantes_voluntarios_marcables(campus) the (campus, ámbito,
--          equipo) the caller may mark: the campus is visible to them
--          (estudiantes_campus_visible) and they are the system admin or a
--          pastor (of that campus), hold dream_team.org.manage, .direct,
--          .director.coordinate or .coordinate on the equipo or an ancestor,
--          or have it in dream_team_equipos_registrables() (the Atención al
--          Voluntario coordinator of the ámbito), or serve as director de
--          grupo in that very sub-área (decided by the user, L35). NULL =
--          every campus.
--        estudiantes_voluntarios_participa()  the (ámbito, turno) pairs where
--          some active servicio of the ámbito is assigned to the turno.
--        estudiantes_voluntarios_del_turno_vivo(turno, fecha) the live roster:
--          the active servicios of the equipos that serve the turno in its
--          campus (dream_team_turnos_del_equipo) in an ámbito that takes part
--          in it (participa), whose principal campus is that campus or
--          unknown. `esperado`: weekly turno → assigned and due
--          that date (dream_team_turno_sirve_en); dated turno → chosen for
--          that planned date (dream_team_turno_fecha_servidores); both only
--          from the servicio's start. `sin_turno`: no turno assignment at all.
--        estudiantes_voluntarios_congelar(turno, fecha) freezes the expected
--          roster of an active turno's past date that the turno happens on
--          (dream_team_turno_activo_en), not before
--          estudiantes_voluntarios_congelado_desde() = 2026-10-25; never
--          overwrites a snapshot.
--        estudiantes_voluntarios_del_turno(turno, fecha) the live roster with
--          a frozen date's `esperado` and ámbito / equipo, plus the frozen
--          servicios no longer in the live roster.
--        estudiantes_voluntarios_congelar_pendientes() the hourly freeze of
--          the last 14 days, scheduled with pg_cron where it exists.
--   3. For authenticated:
--        estudiantes_puede_marcar_voluntarios()  menu and page flag.
--        estudiantes_voluntarios_turnos()  the active turnos served by the
--          equipos the caller may mark whose ámbito takes part in them, with
--          their tipo and, for a dated turno, its planned dates up to today
--          (newest first, at most 12).
--        estudiantes_voluntarios_planilla(turno, fecha)  the roster of the
--          servicios the caller may mark with the current marks; same shape
--          as ninos_voluntarios_planilla ('areas' are the ámbitos) plus tipo.
--        estudiantes_voluntarios_marcar(turno, fecha, servicio_ids, estado,
--          solo_sin_marcar)  upsert of the marks in dream_team_asistencias
--          (estado NULL deletes them), as ninos_voluntarios_marcar.
--        estudiantes_reporte_voluntarios(desde, hasta, campus, turno)  per
--          service and per volunteer, as ninos_reporte_voluntarios.
--
-- Errors: 'sin_autoridad' (42501) without a session, when the caller may mark
-- nobody in the turno's campus or a servicio outside their scope; 22023 for
-- 'turno_invalido' (unknown or inactive), 'fecha_invalida' (NULL or a day the
-- turno does not happen: not its weekday, or not a planned date of a dated
-- turno; marking also refuses future dates and dates more than 14 days before
-- ninos_hoy()), 'estado_invalido', 'servicio_invalido' (not in the roster),
-- 'demasiados_servicios' (more than 300 ids) and 'rango_invalido' (report).
--
-- How (participa): a node that lists no weekly turno serves every weekly
-- turno of its campus (dream_team_turnos_del_equipo), so The Living Room
-- would otherwise show up on the Transit and Inside Out Sundays with all its
-- volunteers "sin turno". An ámbito takes part in a turno once one of its
-- volunteers is assigned to it; until then the turno is not offered and its
-- roster leaves the ámbito out.
--
-- Why: S1/S2 ask for the attendance of the Estudiantes volunteers. Their
-- Sundays are the weekly turnos of Transit and Inside Out; The Living Room
-- serves on the planned dates of its dated turno (tlr-calendario-servicios),
-- which the Niños functions refuse (they validate dow = dia_semana and only
-- read tipo = 'semanal'). The Niños functions are not touched: their roots
-- (the areas with rooms), their frozen-roster tables (keyed by turno and
-- fecha, and the campus turnos are shared by every area) and their behaviour
-- stay exactly as they are; this file adds parallel functions over the shared
-- dream_team_asistencias. A servicio belongs to one equipo, so a Niños mark
-- and an Estudiantes mark never share a row, and each side only reads the
-- servicios of its own equipos.
--
-- Blast radius: two new empty tables, thirteen new functions, one pg_cron job
-- where pg_cron is installed. No existing table, function, policy or row
-- changes; dream_team_asistencias gains rows only through
-- estudiantes_voluntarios_marcar.
--
-- Rollback:
--   select cron.unschedule('estudiantes_voluntarios_congelar');  -- where pg_cron exists
--   drop function if exists public.estudiantes_reporte_voluntarios(date, date, uuid, uuid);
--   drop function if exists public.estudiantes_voluntarios_marcar(uuid, date, uuid[], text, boolean);
--   drop function if exists public.estudiantes_voluntarios_planilla(uuid, date);
--   drop function if exists public.estudiantes_voluntarios_turnos();
--   drop function if exists public.estudiantes_puede_marcar_voluntarios();
--   drop function if exists public.estudiantes_voluntarios_congelar_pendientes();
--   drop function if exists public.estudiantes_voluntarios_del_turno(uuid, date);
--   drop function if exists public.estudiantes_voluntarios_congelar(uuid, date);
--   drop function if exists public.estudiantes_voluntarios_del_turno_vivo(uuid, date);
--   drop function if exists public.estudiantes_voluntarios_participa();
--   drop function if exists public.estudiantes_voluntarios_marcables(uuid);
--   drop function if exists public.estudiantes_voluntarios_equipos();
--   drop function if exists public.estudiantes_voluntarios_congelado_desde();
--   drop table if exists public.estudiantes_voluntarios_roster_servicios;
--   drop table if exists public.estudiantes_voluntarios_rosters;
--   then delete the Estudiantes marks if they must go too:
--   delete from public.dream_team_asistencias a
--    where a.servicio_id in (select s.id from public.dream_team_servicios s
--                             where s.equipo_id in (select q.equipo_id from <the ámbito subtrees>));

-- ── 1. frozen rosters ────────────────────────────────────────────────

create table if not exists public.estudiantes_voluntarios_rosters (
  turno_id uuid not null references public.dream_team_turnos(id) on delete cascade,
  fecha date not null,
  congelado_at timestamptz not null default now(),
  primary key (turno_id, fecha)
);

create table if not exists public.estudiantes_voluntarios_roster_servicios (
  turno_id uuid not null,
  fecha date not null,
  servicio_id uuid not null references public.dream_team_servicios(id) on delete cascade,
  ambito_id uuid not null,
  equipo_id uuid not null,
  primary key (turno_id, fecha, servicio_id),
  foreign key (turno_id, fecha) references public.estudiantes_voluntarios_rosters (turno_id, fecha) on delete cascade
);
create index if not exists estudiantes_voluntarios_roster_servicios_servicio_idx
  on public.estudiantes_voluntarios_roster_servicios (servicio_id);

comment on table public.estudiantes_voluntarios_rosters is
  'Turno and fecha whose expected Estudiantes volunteer roster is frozen. Written only by estudiantes_voluntarios_congelar.';
comment on table public.estudiantes_voluntarios_roster_servicios is
  'Frozen expected Estudiantes volunteers per turno and fecha, with their ámbito and equipo that day.';

alter table public.estudiantes_voluntarios_rosters enable row level security;
alter table public.estudiantes_voluntarios_roster_servicios enable row level security;
revoke all on public.estudiantes_voluntarios_rosters from public, anon, authenticated;
revoke all on public.estudiantes_voluntarios_roster_servicios from public, anon, authenticated;
grant select, insert, update, delete on public.estudiantes_voluntarios_rosters,
  public.estudiantes_voluntarios_roster_servicios to service_role;

-- ── 2. internal helpers ──────────────────────────────────────────────

create or replace function public.estudiantes_voluntarios_congelado_desde()
returns date
language sql
immutable
set search_path to ''
as $$
  select date '2026-10-25'
$$;

revoke all on function public.estudiantes_voluntarios_congelado_desde() from public, anon, authenticated;
grant execute on function public.estudiantes_voluntarios_congelado_desde() to service_role;

-- The ámbitos are the nodes the live view and the menu already use
-- (estudiantes_acceso, estudiantes_vivo_opciones): an active estudiantes /
-- the_living_room node with a small-group sub-área.
create or replace function public.estudiantes_voluntarios_equipos()
returns table (ambito_id uuid, equipo_id uuid)
language sql
stable
security definer
set search_path to ''
as $$
  with recursive ambitos as (
    select a.id
      from public.dream_team_equipos a
     where a.activo
       and a.experiencia in ('estudiantes', 'the_living_room')
       and exists (select 1 from public.dream_team_equipos s
                    where s.parent_equipo_id = a.id and s.activo
                      and public.estudiantes_es_subarea_grupos(s.label))
  ), arbol as (
    select a.id as ambito_id, a.id as equipo_id, 0 as profundidad
      from ambitos a
    union all
    select ar.ambito_id, h.id, ar.profundidad + 1
      from public.dream_team_equipos h
      join arbol ar on h.parent_equipo_id = ar.equipo_id
     where h.activo and ar.profundidad < 16
  )
  -- An equipo under two ámbitos (nested) belongs to the nearest one.
  select distinct on (ar.equipo_id) ar.ambito_id, ar.equipo_id
    from arbol ar
   order by ar.equipo_id, ar.profundidad
$$;

revoke all on function public.estudiantes_voluntarios_equipos() from public, anon, authenticated;
grant execute on function public.estudiantes_voluntarios_equipos() to service_role;

create or replace function public.estudiantes_voluntarios_marcables(p_campus_id uuid)
returns table (campus_id uuid, ambito_id uuid, equipo_id uuid)
language sql
stable
security definer
set search_path to ''
as $$
  with campus_visibles as (
    select c.id
      from public.campus c
     where c.activo
       and (p_campus_id is null or c.id = p_campus_id)
       and public.estudiantes_campus_visible(c.id)
  ), sistema as (
    -- The admin sees every campus, a pastor everything of their campus (L20, L21).
    select public.estudiantes_tiene_rol_sistema('admin') or public.estudiantes_tiene_rol_sistema('pastor') as si
  ), registrables as (
    select r.equipo_id from public.dream_team_equipos_registrables() r
  ), equipos as (
    select q.ambito_id, q.equipo_id
      from public.estudiantes_voluntarios_equipos() q
      cross join sistema s
     where s.si
        or q.equipo_id in (select r.equipo_id from registrables r)
        or public.auth_has_dream_team_capability_in_tree('dream_team.org.manage', q.equipo_id)
        or public.auth_has_dream_team_capability_in_tree('dream_team.direct', q.equipo_id)
        or public.auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', q.equipo_id)
        or public.auth_has_dream_team_capability_in_tree('dream_team.coordinate', q.equipo_id)
        -- A director de grupo marks the volunteers of their own sub-área.
        or exists (select 1
                     from public.dream_team_servicios sv
                     join public.dream_team_roles r on r.id = sv.rol_id
                    where sv.persona_id = (select public.ninos_usuario_actual())
                      and sv.equipo_id = q.equipo_id
                      and sv.estado = 'activo'
                      and public.dream_team_normalizar_etiqueta(r.label) = 'director de grupo')
  )
  select c.id, e.ambito_id, e.equipo_id
    from campus_visibles c
    cross join equipos e
   where (select public.ninos_usuario_actual()) is not null
$$;

revoke all on function public.estudiantes_voluntarios_marcables(uuid) from public, anon, authenticated;
grant execute on function public.estudiantes_voluntarios_marcables(uuid) to service_role;

create or replace function public.estudiantes_voluntarios_participa()
returns table (ambito_id uuid, turno_id uuid)
language sql
stable
security definer
set search_path to ''
as $$
  select distinct q.ambito_id, st.turno_id
    from public.estudiantes_voluntarios_equipos() q
    join public.dream_team_servicios sv on sv.equipo_id = q.equipo_id and sv.estado = 'activo'
    join public.dream_team_servicio_turnos st on st.servicio_id = sv.id
$$;

revoke all on function public.estudiantes_voluntarios_participa() from public, anon, authenticated;
grant execute on function public.estudiantes_voluntarios_participa() to service_role;

create or replace function public.estudiantes_voluntarios_del_turno_vivo(p_turno_id uuid, p_fecha date)
returns table (servicio_id uuid, ambito_id uuid, equipo_id uuid, esperado boolean, sin_turno boolean)
language sql
stable
security definer
set search_path to ''
as $$
  with turno as (
    select t.id, t.campus_id, t.tipo from public.dream_team_turnos t where t.id = p_turno_id
  ), eq as (
    -- The equipos that serve the turno in its campus, in an ámbito taking part in it.
    select q.ambito_id, q.equipo_id
      from public.estudiantes_voluntarios_equipos() q
      cross join turno t
     where exists (select 1 from public.estudiantes_voluntarios_participa() p
                    where p.ambito_id = q.ambito_id and p.turno_id = t.id)
       and exists (select 1 from public.dream_team_turnos_del_equipo(q.equipo_id, t.campus_id) as x(turno_id)
                    where x.turno_id = t.id)
  )
  select sv.id, eq.ambito_id, eq.equipo_id,
         (case t.tipo
            when 'fechas' then exists (
              select 1
                from public.dream_team_turno_fecha_servidores fs
                join public.dream_team_turno_fechas f on f.id = fs.turno_fecha_id
               where f.turno_id = t.id and f.fecha = p_fecha and fs.servicio_id = sv.id)
            else exists (
              select 1 from public.dream_team_servicio_turnos st
               where st.servicio_id = sv.id and st.turno_id = t.id
                 and public.dream_team_turno_sirve_en(st.frecuencia, st.fecha_ancla, p_fecha))
          end)
           and (sv.fecha_inicio at time zone 'America/Caracas')::date <= p_fecha,
         not exists (select 1 from public.dream_team_servicio_turnos st where st.servicio_id = sv.id)
    from turno t
    cross join eq
    join public.dream_team_servicios sv on sv.equipo_id = eq.equipo_id and sv.estado = 'activo'
   where not exists (select 1 from public.usuario_campus uc
                      where uc.usuario_id = sv.persona_id and uc.es_campus_principal
                        and uc.campus_id <> t.campus_id)
$$;

revoke all on function public.estudiantes_voluntarios_del_turno_vivo(uuid, date) from public, anon, authenticated;
grant execute on function public.estudiantes_voluntarios_del_turno_vivo(uuid, date) to service_role;

create or replace function public.estudiantes_voluntarios_congelar(p_turno_id uuid, p_fecha date)
returns boolean
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_nuevos integer;
begin
  if p_fecha is null or p_fecha >= public.ninos_hoy()
     or p_fecha < public.estudiantes_voluntarios_congelado_desde()
     or not public.dream_team_turno_activo_en(p_turno_id, p_fecha) then
    return false;
  end if;
  -- The header row claims the date: a concurrent caller waits and then skips.
  insert into public.estudiantes_voluntarios_rosters (turno_id, fecha) values (p_turno_id, p_fecha)
  on conflict (turno_id, fecha) do nothing;
  get diagnostics v_nuevos = row_count;
  if v_nuevos = 0 then
    return false;
  end if;
  insert into public.estudiantes_voluntarios_roster_servicios (turno_id, fecha, servicio_id, ambito_id, equipo_id)
  select p_turno_id, p_fecha, r.servicio_id, r.ambito_id, r.equipo_id
    from public.estudiantes_voluntarios_del_turno_vivo(p_turno_id, p_fecha) r
   where r.esperado
  on conflict (turno_id, fecha, servicio_id) do nothing;
  return true;
end;
$$;

revoke all on function public.estudiantes_voluntarios_congelar(uuid, date) from public, anon, authenticated;
grant execute on function public.estudiantes_voluntarios_congelar(uuid, date) to service_role;

create or replace function public.estudiantes_voluntarios_del_turno(p_turno_id uuid, p_fecha date)
returns table (servicio_id uuid, ambito_id uuid, equipo_id uuid, esperado boolean, sin_turno boolean)
language sql
stable
security definer
set search_path to ''
as $$
  with vivo as (
    select v.* from public.estudiantes_voluntarios_del_turno_vivo(p_turno_id, p_fecha) v
  ), congelado as (
    select z.servicio_id, z.ambito_id, z.equipo_id
      from public.estudiantes_voluntarios_roster_servicios z
     where z.turno_id = p_turno_id and z.fecha = p_fecha
  ), hay as (
    select exists (select 1 from public.estudiantes_voluntarios_rosters c
                    where c.turno_id = p_turno_id and c.fecha = p_fecha) as congelada
  )
  select v.servicio_id, coalesce(z.ambito_id, v.ambito_id), coalesce(z.equipo_id, v.equipo_id),
         case when h.congelada then z.servicio_id is not null else v.esperado end, v.sin_turno
    from vivo v
    cross join hay h
    left join congelado z on z.servicio_id = v.servicio_id
  union all
  -- Expected that day but no longer in the live roster (moved or inactive).
  select z.servicio_id, z.ambito_id, z.equipo_id, true, false
    from congelado z
   where not exists (select 1 from vivo v where v.servicio_id = z.servicio_id)
$$;

revoke all on function public.estudiantes_voluntarios_del_turno(uuid, date) from public, anon, authenticated;
grant execute on function public.estudiantes_voluntarios_del_turno(uuid, date) to service_role;

-- ── 3. menu flag and services ────────────────────────────────────────

create or replace function public.estudiantes_puede_marcar_voluntarios()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (select 1 from public.estudiantes_voluntarios_marcables(null))
$$;

comment on function public.estudiantes_puede_marcar_voluntarios() is
  'Whether the caller may mark some Transit, Inside Out or The Living Room volunteer in a campus they see.';

revoke all on function public.estudiantes_puede_marcar_voluntarios() from public, anon;
grant execute on function public.estudiantes_puede_marcar_voluntarios() to authenticated, service_role;

create or replace function public.estudiantes_voluntarios_turnos()
returns table (
  id uuid,
  nombre text,
  hora time,
  orden integer,
  dia_semana smallint,
  campus_id uuid,
  campus text,
  tipo text,
  fechas date[]
)
language sql
stable
security definer
set search_path to ''
as $$
  with participa as (
    select p.ambito_id, p.turno_id from public.estudiantes_voluntarios_participa() p
  ), servidos as (
    select distinct x.turno_id
      from public.estudiantes_voluntarios_marcables(null) m
      cross join lateral public.dream_team_turnos_del_equipo(m.equipo_id, m.campus_id) as x(turno_id)
     where exists (select 1 from participa p where p.ambito_id = m.ambito_id and p.turno_id = x.turno_id)
  )
  select t.id, t.nombre, t.hora, t.orden, t.dia_semana, t.campus_id, c.nombre, t.tipo,
         case when t.tipo = 'fechas' then
           coalesce((select array_agg(f.fecha order by f.fecha desc)
                       from (select tf.fecha
                               from public.dream_team_turno_fechas tf
                              where tf.turno_id = t.id and tf.fecha <= public.ninos_hoy()
                              order by tf.fecha desc
                              limit 12) f), array[]::date[])
         else array[]::date[] end
    from servidos s
    join public.dream_team_turnos t on t.id = s.turno_id
    join public.campus c on c.id = t.campus_id
   order by c.nombre, t.orden, t.hora
$$;

comment on function public.estudiantes_voluntarios_turnos() is
  'Active turnos served by the Estudiantes equipos the caller may mark, with tipo and, for a dated turno, its '
  'planned dates up to today (newest first, at most 12).';

revoke all on function public.estudiantes_voluntarios_turnos() from public, anon;
grant execute on function public.estudiantes_voluntarios_turnos() to authenticated, service_role;

-- ── 4. roster ────────────────────────────────────────────────────────

create or replace function public.estudiantes_voluntarios_planilla(p_turno_id uuid, p_fecha date)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_turno public.dream_team_turnos%rowtype;
  v_hoy date := public.ninos_hoy();
  v_equipos uuid[];
  v_areas_json jsonb;
  v_voluntarios jsonb;
begin
  if public.ninos_usuario_actual() is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  select t.* into v_turno from public.dream_team_turnos t where t.id = p_turno_id and t.activo;
  if not found then
    raise exception 'turno_invalido' using errcode = '22023';
  end if;
  if not public.dream_team_turno_activo_en(p_turno_id, p_fecha) then
    raise exception 'fecha_invalida' using errcode = '22023';
  end if;

  select coalesce(array_agg(m.equipo_id), array[]::uuid[])
    into v_equipos
    from public.estudiantes_voluntarios_marcables(v_turno.campus_id) m;
  if cardinality(v_equipos) = 0 then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  perform public.estudiantes_voluntarios_congelar(p_turno_id, p_fecha);

  with filas as (
    select r.*
      from public.estudiantes_voluntarios_del_turno(p_turno_id, p_fecha) r
     where r.equipo_id = any (v_equipos)
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.label) order by a.label), '[]'::jsonb)
       from public.dream_team_equipos a
      where a.id in (select f.ambito_id from filas f)),
    (select coalesce(jsonb_agg(jsonb_build_object(
              'servicio_id', f.servicio_id, 'nombre', u.nombre, 'apellido', u.apellido,
              'area_id', f.ambito_id, 'area', ea.label, 'equipo_id', f.equipo_id, 'equipo', e.label,
              'rol', ro.label, 'esperado', f.esperado, 'sin_turno', f.sin_turno, 'estado', a.estado)
            order by ea.label, e.label, u.nombre, u.apellido), '[]'::jsonb)
       from filas f
       join public.dream_team_servicios sv on sv.id = f.servicio_id
       join public.usuarios u on u.id = sv.persona_id
       join public.dream_team_equipos e on e.id = f.equipo_id
       join public.dream_team_equipos ea on ea.id = f.ambito_id
       join public.dream_team_roles ro on ro.id = sv.rol_id
       left join public.dream_team_asistencias a
         on a.servicio_id = f.servicio_id and a.turno_id = p_turno_id and a.fecha = p_fecha)
    into v_areas_json, v_voluntarios;

  return jsonb_build_object(
    'turno_id', v_turno.id, 'turno', v_turno.nombre, 'tipo', v_turno.tipo, 'dia_semana', v_turno.dia_semana,
    'fecha', p_fecha, 'hoy', v_hoy, 'editable', p_fecha between v_hoy - 14 and v_hoy,
    'areas', v_areas_json, 'voluntarios', v_voluntarios);
end;
$$;

comment on function public.estudiantes_voluntarios_planilla(uuid, date) is
  'Roster of the Estudiantes volunteers the caller may mark on a turno and fecha, with the current marks; areas = '
  'the ámbitos. Errors: sin_autoridad, turno_invalido, fecha_invalida.';

revoke all on function public.estudiantes_voluntarios_planilla(uuid, date) from public, anon;
grant execute on function public.estudiantes_voluntarios_planilla(uuid, date) to authenticated, service_role;

-- ── 5. marking ───────────────────────────────────────────────────────

create or replace function public.estudiantes_voluntarios_marcar(
  p_turno_id uuid,
  p_fecha date,
  p_servicio_ids uuid[],
  p_estado text,
  p_solo_sin_marcar boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_actor uuid := public.ninos_usuario_actual();
  v_turno public.dream_team_turnos%rowtype;
  v_hoy date := public.ninos_hoy();
  v_ids uuid[];
  v_servicios uuid[];
  v_equipos uuid[];
  v_esperados boolean[];
  v_cambiados integer := 0;
begin
  if v_actor is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if p_estado is not null and p_estado not in ('presente', 'justificado', 'ausente') then
    raise exception 'estado_invalido' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), array[]::uuid[]) into v_ids
    from unnest(p_servicio_ids) as x where x is not null;
  if cardinality(v_ids) > 300 then
    raise exception 'demasiados_servicios' using errcode = '22023';
  end if;
  select t.* into v_turno from public.dream_team_turnos t where t.id = p_turno_id and t.activo;
  if not found then
    raise exception 'turno_invalido' using errcode = '22023';
  end if;
  if p_fecha is null or p_fecha > v_hoy or p_fecha < v_hoy - 14
     or not public.dream_team_turno_activo_en(p_turno_id, p_fecha) then
    raise exception 'fecha_invalida' using errcode = '22023';
  end if;
  if cardinality(v_ids) = 0 then
    return jsonb_build_object('estado', p_estado, 'servicios', 0, 'cambiados', 0);
  end if;

  -- The roster rows of the ids, read once: every id must be in the roster of
  -- this turno, in an equipo the caller may mark.
  select coalesce(array_agg(r.servicio_id), array[]::uuid[]), coalesce(array_agg(r.equipo_id), array[]::uuid[]),
         coalesce(array_agg(r.esperado), array[]::boolean[])
    into v_servicios, v_equipos, v_esperados
    from public.estudiantes_voluntarios_del_turno(p_turno_id, p_fecha) r
   where r.servicio_id = any (v_ids);
  if cardinality(v_servicios) < cardinality(v_ids) then
    raise exception 'servicio_invalido' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_equipos) as e(equipo_id)
              where not exists (select 1 from public.estudiantes_voluntarios_marcables(v_turno.campus_id) m
                                 where m.equipo_id = e.equipo_id)) then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  -- Only an authorized caller freezes a past date; the frozen roster then
  -- decides `esperado` (a snapshot is a subset of the live roster read above).
  if public.estudiantes_voluntarios_congelar(p_turno_id, p_fecha) then
    select coalesce(array_agg(r.servicio_id), array[]::uuid[]), coalesce(array_agg(r.equipo_id), array[]::uuid[]),
           coalesce(array_agg(r.esperado), array[]::boolean[])
      into v_servicios, v_equipos, v_esperados
      from public.estudiantes_voluntarios_del_turno(p_turno_id, p_fecha) r
     where r.servicio_id = any (v_ids);
  end if;

  if p_estado is null then
    delete from public.dream_team_asistencias a
     where a.turno_id = p_turno_id and a.fecha = p_fecha and a.servicio_id = any (v_servicios);
    get diagnostics v_cambiados = row_count;
  elsif p_solo_sin_marcar then
    insert into public.dream_team_asistencias (servicio_id, turno_id, fecha, estado, esperado, marcado_por)
    select x.servicio_id, p_turno_id, p_fecha, p_estado, x.esperado, v_actor
      from unnest(v_servicios, v_esperados) as x(servicio_id, esperado)
    on conflict (servicio_id, turno_id, fecha) do nothing;
    get diagnostics v_cambiados = row_count;
  else
    -- Re-marking the same estado is a no-op: the first marker and time stay.
    insert into public.dream_team_asistencias as a (servicio_id, turno_id, fecha, estado, esperado, marcado_por)
    select x.servicio_id, p_turno_id, p_fecha, p_estado, x.esperado, v_actor
      from unnest(v_servicios, v_esperados) as x(servicio_id, esperado)
    on conflict (servicio_id, turno_id, fecha) do update
       set estado = excluded.estado, esperado = excluded.esperado,
           marcado_por = excluded.marcado_por, marcado_at = now()
     where a.estado is distinct from excluded.estado or a.esperado is distinct from excluded.esperado;
    get diagnostics v_cambiados = row_count;
  end if;

  return jsonb_build_object('estado', p_estado, 'servicios', cardinality(v_ids), 'cambiados', v_cambiados);
end;
$$;

comment on function public.estudiantes_voluntarios_marcar(uuid, date, uuid[], text, boolean) is
  'Marks Estudiantes volunteers Presente / Avisó / Faltó (estado NULL clears) on a day the turno happens, today or up '
  'to 14 days back. Errors: sin_autoridad, estado_invalido, demasiados_servicios, turno_invalido, fecha_invalida, '
  'servicio_invalido.';

revoke all on function public.estudiantes_voluntarios_marcar(uuid, date, uuid[], text, boolean) from public, anon;
grant execute on function public.estudiantes_voluntarios_marcar(uuid, date, uuid[], text, boolean) to authenticated, service_role;

-- ── 6. report ────────────────────────────────────────────────────────

create or replace function public.estudiantes_reporte_voluntarios(
  p_desde date,
  p_hasta date,
  p_campus_id uuid default null,
  p_turno_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_hasta date;
begin
  if public.ninos_usuario_actual() is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta - p_desde > 366 then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;
  if not public.estudiantes_puede_marcar_voluntarios() then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  v_hasta := least(p_hasta, public.ninos_hoy());

  -- Past dates nobody opened are frozen here too (the scheduler may be absent).
  perform public.estudiantes_voluntarios_congelar(t.id, d::date)
     from public.dream_team_turnos t
     cross join generate_series(greatest(p_desde, public.estudiantes_voluntarios_congelado_desde()), v_hasta - 1,
                                interval '1 day') as d
    where t.activo
      and (p_turno_id is null or t.id = p_turno_id)
      and t.campus_id in (select m.campus_id from public.estudiantes_voluntarios_marcables(p_campus_id) m)
      and t.id in (select p.turno_id from public.estudiantes_voluntarios_participa() p)
      and public.dream_team_turno_activo_en(t.id, d::date)
      and not exists (select 1 from public.estudiantes_voluntarios_rosters c
                       where c.turno_id = t.id and c.fecha = d::date);

  return (
    with eq as (
      select m.campus_id, m.ambito_id, m.equipo_id
        from public.estudiantes_voluntarios_marcables(p_campus_id) m
    ), fechas as (
      -- The days each turno happened: its weekday, or a planned date.
      select t.id as turno_id, d::date as fecha
        from public.dream_team_turnos t
        cross join generate_series(p_desde, v_hasta, interval '1 day') as d
       where t.campus_id in (select eq.campus_id from eq)
         and (p_turno_id is null or t.id = p_turno_id)
         and case t.tipo
               when 'semanal' then extract(dow from d)::int = t.dia_semana
               else exists (select 1 from public.dream_team_turno_fechas f
                             where f.turno_id = t.id and f.fecha = d::date)
             end
    ), roster as (
      -- Unmarked expected volunteers only exist on active turnos.
      select f.turno_id, f.fecha, r.servicio_id, r.equipo_id
        from fechas f
        join public.dream_team_turnos t on t.id = f.turno_id and t.activo
        cross join lateral public.estudiantes_voluntarios_del_turno(f.turno_id, f.fecha) r
       where r.esperado and r.equipo_id in (select eq.equipo_id from eq)
    ), marcas as (
      select a.turno_id, a.fecha, a.servicio_id, a.esperado, a.estado
        from public.dream_team_asistencias a
        join fechas f on f.turno_id = a.turno_id and f.fecha = a.fecha
    ), unidas as (
      select coalesce(m.turno_id, r.turno_id) as turno_id, coalesce(m.fecha, r.fecha) as fecha,
             coalesce(m.servicio_id, r.servicio_id) as servicio_id,
             coalesce(m.esperado, true) as esperado, m.estado, r.equipo_id
        from marcas m
        full join roster r on r.turno_id = m.turno_id and r.fecha = m.fecha and r.servicio_id = m.servicio_id
    ), filas as (
      select u.turno_id, u.fecha, u.servicio_id, eq.ambito_id, eq.equipo_id, u.esperado, u.estado, t.orden as turno_orden
        from unidas u
        join public.dream_team_turnos t on t.id = u.turno_id
        join public.dream_team_servicios sv on sv.id = u.servicio_id
        -- A frozen volunteer stays in the equipo they had that day.
        join eq on eq.campus_id = t.campus_id and eq.equipo_id = coalesce(u.equipo_id, sv.equipo_id)
    ), por_servicio as (
      select x.fecha, x.turno_id, x.ambito_id, x.equipo_id,
             count(*) filter (where x.esperado)::int as esperados,
             count(*) filter (where x.estado = 'presente')::int as presentes,
             count(*) filter (where x.estado = 'justificado')::int as avisos,
             count(*) filter (where x.estado = 'ausente')::int as faltas,
             count(*) filter (where x.estado is null)::int as sin_marcar,
             count(*) filter (where x.estado = 'presente' and not x.esperado)::int as extras
        from filas x
       group by x.fecha, x.turno_id, x.ambito_id, x.equipo_id
    ), esperadas as (
      -- Expected services per volunteer, newest first; the streak is the run
      -- of Faltó from the newest one.
      select x.servicio_id, x.estado,
             row_number() over (partition by x.servicio_id order by x.fecha desc, x.turno_orden desc) as n
        from filas x
       where x.esperado
    ), racha as (
      select e.servicio_id,
             coalesce(min(e.n) filter (where e.estado is distinct from 'ausente'), max(e.n) + 1) - 1 as seguidas
        from esperadas e
       group by e.servicio_id
    ), por_voluntario as (
      select x.servicio_id, x.ambito_id, x.equipo_id,
             count(*) filter (where x.esperado)::int as esperados,
             count(*) filter (where x.estado = 'presente')::int as presentes,
             count(*) filter (where x.estado = 'justificado')::int as avisos,
             count(*) filter (where x.estado = 'ausente')::int as faltas,
             count(*) filter (where x.estado is null)::int as sin_marcar,
             count(*) filter (where x.estado = 'presente' and not x.esperado)::int as extras
        from filas x
       group by x.servicio_id, x.ambito_id, x.equipo_id
    )
    select jsonb_build_object(
      'desde', p_desde, 'hasta', p_hasta,
      'servicios', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'fecha', s.fecha, 'turno_id', s.turno_id, 'turno', t.nombre, 'turno_orden', t.orden,
                 'area_id', s.ambito_id, 'area', ea.label, 'equipo_id', s.equipo_id, 'equipo', e.label,
                 'esperados', s.esperados, 'presentes', s.presentes, 'avisos', s.avisos, 'faltas', s.faltas,
                 'sin_marcar', s.sin_marcar, 'extras', s.extras)
               order by s.fecha, t.orden, ea.label, e.label), '[]'::jsonb)
          from por_servicio s
          join public.dream_team_turnos t on t.id = s.turno_id
          join public.dream_team_equipos ea on ea.id = s.ambito_id
          join public.dream_team_equipos e on e.id = s.equipo_id),
      'voluntarios', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'servicio_id', k.servicio_id, 'nombre', btrim(u.nombre || ' ' || coalesce(u.apellido, '')),
                 'area', ea.label, 'equipo', e.label, 'rol', ro.label,
                 'esperados', k.esperados, 'presentes', k.presentes, 'avisos', k.avisos, 'faltas', k.faltas,
                 'sin_marcar', k.sin_marcar, 'extras', k.extras, 'faltas_seguidas', coalesce(r.seguidas, 0)::int)
               order by coalesce(r.seguidas, 0) desc, k.faltas desc, u.nombre, u.apellido), '[]'::jsonb)
          from por_voluntario k
          left join racha r on r.servicio_id = k.servicio_id
          join public.dream_team_servicios sv on sv.id = k.servicio_id
          join public.usuarios u on u.id = sv.persona_id
          join public.dream_team_roles ro on ro.id = sv.rol_id
          join public.dream_team_equipos e on e.id = k.equipo_id
          join public.dream_team_equipos ea on ea.id = k.ambito_id))
  );
end;
$$;

comment on function public.estudiantes_reporte_voluntarios(date, date, uuid, uuid) is
  'Estudiantes volunteer attendance per service and per volunteer in a range (at most 366 days, up to today), over '
  'the equipos the caller may mark; same shape as ninos_reporte_voluntarios (area = ámbito). Errors: sin_autoridad, '
  'rango_invalido.';

revoke all on function public.estudiantes_reporte_voluntarios(date, date, uuid, uuid) from public, anon;
grant execute on function public.estudiantes_reporte_voluntarios(date, date, uuid, uuid) to authenticated, service_role;

-- ── 7. scheduled freeze ──────────────────────────────────────────────

create or replace function public.estudiantes_voluntarios_congelar_pendientes()
returns integer
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_hoy date := public.ninos_hoy();
  v_congeladas integer;
begin
  with servidos as (
    select distinct p.turno_id from public.estudiantes_voluntarios_participa() p
  )
  select count(*) filter (where public.estudiantes_voluntarios_congelar(t.id, d::date))::int
    into v_congeladas
    from public.dream_team_turnos t
    join servidos s on s.turno_id = t.id
    cross join generate_series(greatest(v_hoy - 14, public.estudiantes_voluntarios_congelado_desde()), v_hoy - 1,
                               interval '1 day') as d
   where t.activo
     and public.dream_team_turno_activo_en(t.id, d::date)
     and not exists (select 1 from public.estudiantes_voluntarios_rosters c
                      where c.turno_id = t.id and c.fecha = d::date);
  return v_congeladas;
end;
$$;

revoke all on function public.estudiantes_voluntarios_congelar_pendientes() from public, anon, authenticated;
grant execute on function public.estudiantes_voluntarios_congelar_pendientes() to service_role;

-- Minute 20 of every hour, so a Sunday or a planned date nobody opens is
-- frozen right after it ends. A no-op where pg_cron is not installed
-- (staging); re-running replaces the job. The lazy freeze in planilla, marcar
-- and the report stays as the fallback.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'estudiantes_voluntarios_congelar') then
      perform cron.unschedule('estudiantes_voluntarios_congelar');
    end if;
    perform cron.schedule('estudiantes_voluntarios_congelar', '20 * * * *',
                          $cmd$select public.estudiantes_voluntarios_congelar_pendientes()$cmd$);
  end if;
end;
$$;
