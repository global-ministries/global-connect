-- Estudiantes, Phase B — C4 live view and the Estudiantes menu section
-- (odd/tasks/estudiantes-fase-b.md, C4; artboards 03 and 04 of
-- design/estudiantes-asistencia).
--
-- What (definer functions, search_path '', authority from
-- estudiantes_nivel_grupo / estudiantes_nivel_en_campus of 20261029100000):
--   estudiantes_acceso()                 the caller's menu facts, computed
--     once by the (auth) layout: grupos (active groups they see), lidera
--     (they lead an active group), vivo (live view of some Transit / Inside
--     Out ámbito in a campus they see: sub-área level >= 2) and gestiona
--     (group management somewhere: level 3).
--   estudiantes_vivo_opciones(dias)      the live views the caller may open
--     in the last `dias` days (default 14, 1..60), one row per ámbito, campus,
--     fecha and turno: the dates on which a turno that serves the ámbito
--     happens. Newest first within each ámbito and campus.
--
-- Why: the menu is built from server-fed flags (as Niños, hooks/useNinosAcceso)
-- and estudiantes_en_vivo needs a valid (ámbito, fecha, turno) the caller can
-- see; no existing function lists them.
--
-- Blast radius: two new read-only functions; no table, existing function,
-- policy or row changes.
--
-- Rollback:
--   drop function if exists public.estudiantes_acceso();
--   drop function if exists public.estudiantes_vivo_opciones(integer);

create or replace function public.estudiantes_acceso()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with mis_campus as (
    select c.id
      from public.campus c
     where c.activo and public.estudiantes_campus_visible(c.id)
  ),
  subareas as (
    select s.id, a.experiencia, m.id as campus_id,
           public.estudiantes_nivel_en_campus(s.id, m.id) as nivel
      from public.dream_team_equipos s
      join public.dream_team_equipos a on a.id = s.parent_equipo_id
      cross join mis_campus m
     where s.activo and a.activo
       and a.experiencia in ('estudiantes', 'the_living_room')
       and public.estudiantes_es_subarea_grupos(s.label)
  ),
  grupos as (
    select g.id, public.estudiantes_nivel_grupo(g.id) as nivel,
           exists (select 1
                     from public.estudiantes_grupo_lideres gl
                     join public.dream_team_servicios sv on sv.id = gl.servicio_id
                     join public.usuarios u on u.id = sv.persona_id
                    where gl.grupo_id = g.id and sv.estado = 'activo' and sv.equipo_id = g.subarea_id
                      and u.auth_id = auth.uid()) as lider
      from public.estudiantes_grupos g
     where g.activo
  )
  select jsonb_build_object(
    'grupos', (select count(*) from grupos where nivel >= 1),
    'lidera', exists (select 1 from grupos where lider and nivel >= 1),
    'vivo', exists (select 1 from subareas where experiencia = 'estudiantes' and nivel >= 2),
    'gestiona', exists (select 1 from subareas where nivel >= 3))
   where auth.uid() is not null
$$;

comment on function public.estudiantes_acceso() is
  'The caller''s Estudiantes menu facts: grupos (active groups they see), lidera (they lead one), vivo (live view of '
  'some Transit / Inside Out ámbito, sub-área level >= 2) and gestiona (level 3 somewhere). NULL without a session.';

revoke all on function public.estudiantes_acceso() from public, anon;
grant execute on function public.estudiantes_acceso() to authenticated, service_role;

create or replace function public.estudiantes_vivo_opciones(p_dias integer default 14)
returns table (
  ambito_id uuid,
  ambito text,
  campus_id uuid,
  campus text,
  fecha date,
  turno_id uuid,
  turno text,
  hora time
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_hoy date := public.ninos_hoy();
  v_desde date;
begin
  if public.ninos_usuario_actual() is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;
  v_desde := v_hoy - (least(greatest(coalesce(p_dias, 14), 1), 60) - 1);

  return query
  with ambitos as (
    select distinct a.id, a.label, c.id as campus_id, c.nombre as campus
      from public.dream_team_equipos a
      join public.dream_team_equipos s on s.parent_equipo_id = a.id
      cross join public.campus c
     where a.activo and s.activo and c.activo
       and a.experiencia = 'estudiantes'
       and public.estudiantes_es_subarea_grupos(s.label)
       and public.estudiantes_campus_visible(c.id)
       and public.estudiantes_nivel_en_campus(s.id, c.id) >= 2
  )
  select am.id, am.label, am.campus_id, am.campus, d::date, t.id, t.nombre,
         coalesce((select f.hora from public.dream_team_turno_fechas f
                    where f.turno_id = t.id and f.fecha = d::date), t.hora)
    from ambitos am
    cross join lateral public.dream_team_turnos_del_equipo(am.id, am.campus_id) as x(id)
    join public.dream_team_turnos t on t.id = x.id
    cross join generate_series(v_desde, v_hoy, interval '1 day') as d
   where public.dream_team_turno_activo_en(t.id, d::date)
   order by am.label, am.campus, d::date desc, t.orden, 8, t.id;
end;
$$;

comment on function public.estudiantes_vivo_opciones(integer) is
  'Live views the caller may open in the last p_dias days (default 14, 1..60): one row per Transit / Inside Out '
  'ámbito, campus, fecha and turno serving the ámbito, for ámbitos where the caller has sub-área level >= 2 in that '
  'campus. Newest first within each ámbito and campus. Errors: sin_autoridad.';

revoke all on function public.estudiantes_vivo_opciones(integer) from public, anon;
grant execute on function public.estudiantes_vivo_opciones(integer) to authenticated, service_role;
