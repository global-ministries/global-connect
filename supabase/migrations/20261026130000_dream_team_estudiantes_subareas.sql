-- noqa: insert-into
-- Dream Team: The Living Room and the eight sub-areas of Transit, Inside Out
-- and The Living Room, with their roles (Estudiantes load, T2 of
-- odd/tasks/estudiantes-plan.md, decisions Q1, Q2 and Q4).
--
-- What:
--   Dirección de Experiencia › Dirección de Estudiantes
--     ├ Transit           [estudiantes]      + director
--     ├ Inside Out        [estudiantes]      + director
--     └ The Living Room   [the_living_room]  director, coordinador   (new)
--   Each of the three gains eight active sub-areas with the experiencia of
--   their parent:
--     Grupos de Chicas · Grupos de Chicos · Producción · Redes Sociales
--     Logística · Atención al Invitado · Atención al Voluntario · Recursos
--   Grupos de Chicas / Chicos: director de grupo (coordinador), entrenador
--   (lider), lider (lider), aprendiz (voluntario).
--   The other six: coordinador (coordinador), entrenador (lider), voluntario
--   (voluntario).
--   Transit and Inside Out keep coordinador, lider and voluntario. Dirección
--   de Estudiantes keeps its roles and gains only the child The Living Room.
--
-- Why: the Estudiantes volunteer sheet organises Transit, Inside Out and The
-- Living Room (university students) in the same coordinations, and The Living
-- Room has no node yet. The labels follow the sheet; "Programador de Servicio"
-- loads as Producción. Every rol carries its nivel explicitly
-- (20261015100000_dream_team_nivel_rol.sql), because 'director de grupo' and
-- 'aprendiz' would otherwise fall to voluntario by label.
--
-- How: the same pattern as the UpStreet seed
-- (20261007100000_dream_team_upstreet_subareas.sql).
--   - Dirección de Estudiantes, Transit and Inside Out are resolved by their
--     full path from the root, never by uuid. If any of them does not resolve
--     to exactly one team, the migration raises before writing anything.
--   - Idempotent: every insert is guarded by WHERE NOT EXISTS on the keys of
--     dream_team_equipos_parent_label_uniq and dream_team_roles_equipo_label_uniq.
--   - Additive only: nothing is updated or deleted.
--
-- Blast radius: Dirección de Estudiantes gains one child (The Living Room);
-- Transit and Inside Out gain one role each; 25 equipos and 82 roles in all.
-- Every other node is untouched. No servicio, grant, requisito or turno is
-- created.
--
-- Rollback, only while no servicio points at the new rows (the roles of the
-- new equipos go with them, ON DELETE CASCADE):
--   delete from public.dream_team_equipos
--    where parent_equipo_id in ('<Transit id>', '<Inside Out id>', '<The Living Room id>')
--      and label in ('Grupos de Chicas', 'Grupos de Chicos', 'Producción',
--                    'Redes Sociales', 'Logística', 'Atención al Invitado',
--                    'Atención al Voluntario', 'Recursos');
--   delete from public.dream_team_equipos where id = '<The Living Room id>';
--   delete from public.dream_team_roles
--    where equipo_id in ('<Transit id>', '<Inside Out id>') and label = 'director';

do $$
declare
  v_subareas constant text[] := array[
    'Grupos de Chicas',
    'Grupos de Chicos',
    'Producción',
    'Redes Sociales',
    'Logística',
    'Atención al Invitado',
    'Atención al Voluntario',
    'Recursos'
  ];
  v_grupos constant text[] := array['Grupos de Chicas', 'Grupos de Chicos'];
  v_matches int;
  v_estudiantes uuid;
  v_transit uuid;
  v_inside_out uuid;
  v_living_room uuid;
begin
  select count(*), (array_agg(n.id))[1]
    into v_matches, v_estudiantes
  from public.dream_team_equipos d
  join public.dream_team_equipos n
    on n.parent_equipo_id = d.id and n.label = 'Dirección de Estudiantes'
  where d.parent_equipo_id is null
    and d.label = 'Dirección de Experiencia';

  if v_matches <> 1 then
    raise exception 'Dirección de Experiencia › Dirección de Estudiantes resolves to % teams, expected exactly 1',
      v_matches;
  end if;

  select count(*), (array_agg(t.id))[1]
    into v_matches, v_transit
  from public.dream_team_equipos t
  where t.parent_equipo_id = v_estudiantes and t.label = 'Transit';

  if v_matches <> 1 then
    raise exception 'Dirección de Experiencia › Dirección de Estudiantes › Transit resolves to % teams, expected exactly 1',
      v_matches;
  end if;

  select count(*), (array_agg(t.id))[1]
    into v_matches, v_inside_out
  from public.dream_team_equipos t
  where t.parent_equipo_id = v_estudiantes and t.label = 'Inside Out';

  if v_matches <> 1 then
    raise exception 'Dirección de Experiencia › Dirección de Estudiantes › Inside Out resolves to % teams, expected exactly 1',
      v_matches;
  end if;

  -- ── The Living Room ────────────────────────────────────────────────────
  insert into public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
  select 'the_living_room', v_estudiantes, 'The Living Room', true
  where not exists (
    select 1 from public.dream_team_equipos e
    where e.parent_equipo_id = v_estudiantes and e.label = 'The Living Room'
  );

  select e.id
    into v_living_room
  from public.dream_team_equipos e
  where e.parent_equipo_id = v_estudiantes and e.label = 'The Living Room';

  -- ── Transit and Inside Out add director; The Living Room's roles ───────
  insert into public.dream_team_roles (equipo_id, label, nivel, activo)
  select r.equipo_id, r.label, r.nivel, true
  from (values
    (v_transit,     'director',    'director'),
    (v_inside_out,  'director',    'director'),
    (v_living_room, 'director',    'director'),
    (v_living_room, 'coordinador', 'coordinador')
  ) as r(equipo_id, label, nivel)
  where not exists (
    select 1 from public.dream_team_roles x
    where x.equipo_id = r.equipo_id and x.label = r.label
  );

  -- ── Sub-areas, with the experiencia of their parent ────────────────────
  insert into public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
  select p.experiencia, p.id, v.label, true
  from public.dream_team_equipos p
  cross join unnest(v_subareas) as v(label)
  where p.id in (v_transit, v_inside_out, v_living_room)
    and not exists (
      select 1 from public.dream_team_equipos e
      where e.parent_equipo_id = p.id and e.label = v.label
    );

  -- ── Roles of each sub-area, with an explicit nivel ─────────────────────
  insert into public.dream_team_roles (equipo_id, label, nivel, activo)
  select e.id, r.label, r.nivel, true
  from public.dream_team_equipos e
  join (values
    (true,  'director de grupo', 'coordinador'),
    (true,  'entrenador',        'lider'),
    (true,  'lider',             'lider'),
    (true,  'aprendiz',          'voluntario'),
    (false, 'coordinador',       'coordinador'),
    (false, 'entrenador',        'lider'),
    (false, 'voluntario',        'voluntario')
  ) as r(grupo, label, nivel)
    on r.grupo = (e.label = any (v_grupos))
  where e.parent_equipo_id in (v_transit, v_inside_out, v_living_room)
    and e.label = any (v_subareas)
    and not exists (
      select 1 from public.dream_team_roles x
      where x.equipo_id = e.id and x.label = r.label
    );
end
$$;
