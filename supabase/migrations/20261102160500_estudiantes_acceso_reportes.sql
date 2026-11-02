-- Estudiantes — a `reportes` menu fact (follow-up of C6d, odd/tasks/estudiantes-fase-b.md S19, L53).
--
-- What: estudiantes_acceso() gains `reportes`: the caller has sub-área level
-- >= 2 on some small-group sub-área of Transit, Inside Out or The Living Room
-- in a campus they see. The menu shows "Reportes" with it.
--
-- Why: the menu used `vivo || gestiona`, and `vivo` leaves out The Living
-- Room (it has no live view), so an entrenador with level 2 only in The Living
-- Room did not see "Reportes" although estudiantes_reporte_* answers them.
--
-- How: re-created from its latest definition
-- (20261101120000_estudiantes_lideres_historial.sql; md5 024eb84f in staging
-- and production when this was written); only the `reportes` key and the
-- comment change.
--
-- Blast radius: one read-only function; the existing keys keep their values.
--
-- Rollback: re-run the estudiantes_acceso() block of
-- 20261101120000_estudiantes_lideres_historial.sql.

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
                    where gl.grupo_id = g.id and gl.hasta is null and sv.estado = 'activo' and sv.equipo_id = g.subarea_id
                      and u.auth_id = auth.uid()) as lider
      from public.estudiantes_grupos g
     where g.activo
  )
  select jsonb_build_object(
    'grupos', (select count(*) from grupos where nivel >= 1),
    'lidera', exists (select 1 from grupos where lider and nivel >= 1),
    'vivo', exists (select 1 from subareas where experiencia = 'estudiantes' and nivel >= 2),
    'gestiona', exists (select 1 from subareas where nivel >= 3),
    'reportes', exists (select 1 from subareas where nivel >= 2))
   where auth.uid() is not null
$$;

comment on function public.estudiantes_acceso() is
  'The caller''s Estudiantes menu facts: grupos (active groups they see), lidera (they lead one), vivo (live view of '
  'some Transit / Inside Out ámbito, sub-área level >= 2), gestiona (level 3 somewhere) and reportes (sub-área level '
  '>= 2 in any ámbito, The Living Room included: /estudiantes/reportes). NULL without a session.';

revoke all on function public.estudiantes_acceso() from public, anon;
grant execute on function public.estudiantes_acceso() to authenticated, service_role;
