-- Estudiantes, Phase B — C6b4 reading the school years of a ficha
-- (odd/tasks/estudiantes-fase-b.md, C6b4; S16, L41).
--
-- What:
--   estudiantes_ficha(persona) returns jsonb
--     { persona_id, campus_id, anio_actual, anio_final, egresado, puede_editar,
--       escala: [{ numero, etiqueta, ambito }] }
--   for a person who is an active member of an active Transit / Inside Out
--   group (a group with año) that the caller sees at level >= 1 (leader,
--   entrenador, director de grupo or higher, pastor of the campus, admin; the
--   campus rule of estudiantes_nivel_grupo applies). It is what the "Año
--   escolar" editor of the person detail needs before calling the existing
--   estudiantes_ficha_guardar (20261029100100), which this migration does not
--   touch.
--     - campus_id and escala are the ficha's campus (the one its years are
--       checked against); without a ficha, the campus of that group.
--     - anio_actual / anio_final are NULL without a ficha.
--     - egresado: the ficha has egresado_at (S13).
--     - puede_editar: not egresado and the campus has a scale.
--
-- Errors (code as the message): sin_autoridad (42501) when not signed in or
-- the person is in no active group the caller sees; anio_no_aplica (22023)
-- when the only such groups are of The Living Room, which has no school year.
--
-- Why: S16 — whoever sees a Transit / Inside Out group fixes the año actual
-- and the año final of a member (loading errors). The leader list does not
-- return the año final nor the scale for an existing member.
--
-- How: the same authority as estudiantes_ficha_guardar (active membership in
-- an active group with estudiantes_nivel_grupo >= 1), restricted to groups
-- with año. Runs with definer rights and an empty search_path; EXECUTE only for
-- authenticated (and service_role).
--
-- Blast radius: one new read-only function. No table, row, policy or existing
-- function changes.
--
-- Rollback:
--   drop function if exists public.estudiantes_ficha(uuid);

create or replace function public.estudiantes_ficha(p_persona_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_yo uuid := public.ninos_usuario_actual();
  v_campus uuid;
  v_ficha public.estudiantes_fichas%rowtype;
  v_escala jsonb;
begin
  if v_yo is null then
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;

  select g.campus_id into v_campus
    from public.estudiantes_grupo_miembros m
    join public.estudiantes_grupos g on g.id = m.grupo_id
   where m.persona_id = p_persona_id and m.activo and g.activo
     and g.anio is not null
     and public.estudiantes_nivel_grupo(g.id) >= 1
   order by g.created_at, g.id
   limit 1;

  if v_campus is null then
    if exists (
      select 1
        from public.estudiantes_grupo_miembros m
        join public.estudiantes_grupos g on g.id = m.grupo_id
       where m.persona_id = p_persona_id and m.activo and g.activo
         and g.anio is null
         and public.estudiantes_nivel_grupo(g.id) >= 1
    ) then
      raise exception 'anio_no_aplica' using errcode = '22023';
    end if;
    raise exception 'sin_autoridad' using errcode = '42501';
  end if;

  select f.* into v_ficha from public.estudiantes_fichas f where f.persona_id = p_persona_id;
  v_campus := coalesce(v_ficha.campus_id, v_campus);

  select coalesce(jsonb_agg(jsonb_build_object('numero', e.numero, 'etiqueta', e.etiqueta, 'ambito', a.label)
                            order by e.numero), '[]'::jsonb)
    into v_escala
    from public.estudiantes_escala e
    join public.dream_team_equipos a on a.id = e.ambito_id
   where e.campus_id = v_campus;

  return jsonb_build_object(
    'persona_id', p_persona_id,
    'campus_id', v_campus,
    'anio_actual', v_ficha.anio_actual,
    'anio_final', v_ficha.anio_final,
    'egresado', v_ficha.egresado_at is not null,
    'puede_editar', v_ficha.egresado_at is null and jsonb_array_length(v_escala) > 0,
    'escala', v_escala
  );
end;
$$;

comment on function public.estudiantes_ficha(uuid) is
  'School years of a person who is an active member of a Transit / Inside Out group the caller sees (level >= 1), '
  'with the campus scale, for the "Año escolar" editor (S16). Errors: sin_autoridad, anio_no_aplica.';

revoke all on function public.estudiantes_ficha(uuid) from public, anon;
grant execute on function public.estudiantes_ficha(uuid) to authenticated, service_role;
