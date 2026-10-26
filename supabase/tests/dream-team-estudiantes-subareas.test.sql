-- Estudiantes load (odd/tasks/estudiantes-plan.md, T2, decisions Q1, Q2, Q4) —
-- Dirección de Estudiantes has a third child, The Living Room, and Transit,
-- Inside Out and The Living Room each hold the eight sub-areas with their roles
-- and explicit nivel
-- (migration 20261026130000_dream_team_estudiantes_subareas.sql).
--
-- Covers:
--   a. Dirección de Experiencia › Dirección de Estudiantes and its children
--      Transit, Inside Out and The Living Room each resolve to exactly one team.
--   b. Dirección de Estudiantes has exactly the children Inside Out, The Living
--      Room and Transit. The Living Room is active, with experiencia
--      'the_living_room' and the roles director (director) and coordinador
--      (coordinador), and no other. Transit and Inside Out keep coordinador,
--      lider and voluntario and gain director (director), and no other.
--   c. Each of Transit, Inside Out and The Living Room has exactly eight
--      children, all active, all with the experiencia of their parent
--      ('estudiantes', 'estudiantes', 'the_living_room'): Atención al Invitado,
--      Atención al Voluntario, Grupos de Chicas, Grupos de Chicos, Logística,
--      Producción, Recursos, Redes Sociales.
--   d. Grupos de Chicas and Grupos de Chicos hold exactly the active roles
--      aprendiz (voluntario), director de grupo (coordinador), entrenador
--      (lider) and lider (lider); the other six sub-areas hold exactly
--      coordinador (coordinador), entrenador (lider) and voluntario
--      (voluntario).
--   e. Re-running the migration body changes no row: the count and the full
--      rows of dream_team_equipos and dream_team_roles stay the same, inside
--      and outside the Dirección de Estudiantes subtree.
--   f. A first run on a fresh Dirección de Estudiantes (a fixture with
--      Transit and Inside Out as production has them, taking the real one's
--      place in the path) creates what b, c and d expect, leaves the
--      Dirección de Estudiantes roles as they were, and changes no equipo and
--      no role outside that subtree.
--   g. When Transit, or Dirección de Estudiantes itself, resolves to no team,
--      the migration body raises and writes nothing.
--
-- a–e read the real tree, so they fail until the migration is applied (RED)
-- and pass after it (GREEN). f and g check the body itself and pass either
-- way. The body is a verbatim copy of the migration's DO block, kept in
-- pg_temp.migration_body().
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept. The only
-- fixtures are the fresh trees of cases f and g, under this file's own
-- c5200000-... namespace. The MCP connection is `postgres`, so every statement
-- here runs as the table owner; no case depends on RLS. The last statement is a
-- SELECT of the failing cases (0 failing cases = all ok), because the MCP tool
-- returns only the last result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_es_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_es_snapshots (phase text, slice text, n bigint, h text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_es_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- Runs a query that returns one scalar and compares its text form.
CREATE OR REPLACE FUNCTION pg_temp.assert_eq(p_case text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  EXECUTE p_sql INTO v_actual;
  IF v_actual IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got ' || coalesce(v_actual, 'NULL'));
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- Verbatim copy of the DO block of
-- supabase/migrations/20261026130000_dream_team_estudiantes_subareas.sql.
CREATE OR REPLACE FUNCTION pg_temp.migration_body()
RETURNS text LANGUAGE sql IMMUTABLE AS $body$
SELECT $mig$
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
$mig$
$body$;

-- Dirección de Estudiantes, resolved by its path exactly as the migration does.
CREATE OR REPLACE FUNCTION pg_temp.estudiantes_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT n.id
    FROM public.dream_team_equipos d
    JOIN public.dream_team_equipos n ON n.parent_equipo_id = d.id AND n.label = 'Dirección de Estudiantes'
   WHERE d.parent_equipo_id IS NULL
     AND d.label = 'Dirección de Experiencia';
$$;

CREATE OR REPLACE FUNCTION pg_temp.child_id(p_parent uuid, p_label text)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT e.id FROM public.dream_team_equipos e
   WHERE e.parent_equipo_id = p_parent AND e.label = p_label;
$$;

CREATE OR REPLACE FUNCTION pg_temp.subtree(p_root uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
  WITH RECURSIVE s AS (
    SELECT e.id FROM public.dream_team_equipos e WHERE e.id = p_root
    UNION ALL
    SELECT e.id FROM public.dream_team_equipos e JOIN s ON e.parent_equipo_id = s.id
  )
  SELECT id FROM s;
$$;

-- Count and a hash of the full rows of equipos and roles, split by whether the
-- equipo lies inside the subtree of p_root.
CREATE OR REPLACE FUNCTION pg_temp.snapshot(p_root uuid)
RETURNS TABLE (slice text, n bigint, h text) LANGUAGE sql STABLE AS $$
  WITH sub AS (SELECT t.id FROM pg_temp.subtree(p_root) AS t(id))
  SELECT 'equipos ' || CASE WHEN e.id IN (SELECT id FROM sub) THEN 'inside' ELSE 'outside' END,
         count(*), md5(string_agg(e::text, '|' ORDER BY e.id))
    FROM public.dream_team_equipos e
   GROUP BY 1
  UNION ALL
  SELECT 'roles ' || CASE WHEN r.equipo_id IN (SELECT id FROM sub) THEN 'inside' ELSE 'outside' END,
         count(*), md5(string_agg(r::text, '|' ORDER BY r.id))
    FROM public.dream_team_roles r
   GROUP BY 1;
$$;

CREATE OR REPLACE FUNCTION pg_temp.take_snapshot(p_phase text, p_root uuid)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_es_snapshots (phase, slice, n, h)
  SELECT p_phase, s.slice, s.n, s.h FROM pg_temp.snapshot(p_root) s;
$$;

-- Compares the given slices of the snapshot taken in p_phase with the current
-- state: same count and same full rows.
CREATE OR REPLACE FUNCTION pg_temp.assert_unchanged(p_case text, p_phase text, p_root uuid, p_slices text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT s.slice, coalesce(b.n, 0) AS n_before, coalesce(a.n, 0) AS n_after,
           coalesce(b.h, '') = coalesce(a.h, '') AS same_rows
      FROM unnest(p_slices) AS s(slice)
      LEFT JOIN t_es_snapshots b ON b.phase = p_phase AND b.slice = s.slice
      LEFT JOIN pg_temp.snapshot(p_root) a ON a.slice = s.slice
  LOOP
    IF r.n_before <> r.n_after THEN
      PERFORM pg_temp.fail(p_case, r.slice || ' count went from ' || r.n_before || ' to ' || r.n_after);
    ELSIF NOT r.same_rows THEN
      PERFORM pg_temp.fail(p_case, r.slice || ' rows changed with the same count ' || r.n_after);
    END IF;
  END LOOP;
END;
$$;

-- The roles of one equipo as 'label:nivel', sorted, inactive ones marked.
CREATE OR REPLACE FUNCTION pg_temp.roles_of(p_equipo uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT string_agg(r.label || ':' || r.nivel || CASE WHEN r.activo THEN '' ELSE ' (inactive)' END,
                    ',' ORDER BY r.label COLLATE "C")
    FROM public.dream_team_roles r
   WHERE r.equipo_id = p_equipo;
$$;

-- Cases c and d for one of Transit, Inside Out or The Living Room.
CREATE OR REPLACE FUNCTION pg_temp.assert_area(p_prefix text, p_area uuid, p_name text, p_experiencia text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.assert_eq(p_prefix || 'c: ' || p_name || ' has exactly eight children',
    format($q$SELECT count(*) FROM public.dream_team_equipos WHERE parent_equipo_id = %L$q$, p_area),
    '8');
  PERFORM pg_temp.assert_eq(p_prefix || 'c: ' || p_name || ' children are the eight sub-areas, active, experiencia ' || p_experiencia,
    format($q$SELECT string_agg(label
                                || CASE WHEN activo THEN '' ELSE ' (inactive)' END
                                || CASE WHEN experiencia = %L THEN '' ELSE ' [' || experiencia || ']' END,
                                ',' ORDER BY label COLLATE "C")
                FROM public.dream_team_equipos WHERE parent_equipo_id = %L$q$, p_experiencia, p_area),
    'Atención al Invitado,Atención al Voluntario,Grupos de Chicas,Grupos de Chicos,Logística,Producción,Recursos,Redes Sociales');
  PERFORM pg_temp.assert_eq(p_prefix || 'd: ' || p_name || ' Grupos de Chicas roles',
    format($q$SELECT pg_temp.roles_of(pg_temp.child_id(%L, 'Grupos de Chicas'))$q$, p_area),
    'aprendiz:voluntario,director de grupo:coordinador,entrenador:lider,lider:lider');
  PERFORM pg_temp.assert_eq(p_prefix || 'd: ' || p_name || ' Grupos de Chicos roles',
    format($q$SELECT pg_temp.roles_of(pg_temp.child_id(%L, 'Grupos de Chicos'))$q$, p_area),
    'aprendiz:voluntario,director de grupo:coordinador,entrenador:lider,lider:lider');
  PERFORM pg_temp.assert_eq(p_prefix || 'd: ' || p_name || ' the other six sub-areas hold the same three roles',
    format($q$SELECT string_agg(DISTINCT coalesce(pg_temp.roles_of(e.id), '<none>'), ' ; ')
                FROM public.dream_team_equipos e
               WHERE e.parent_equipo_id = %L
                 AND e.label NOT IN ('Grupos de Chicas', 'Grupos de Chicos')$q$, p_area),
    'coordinador:coordinador,entrenador:lider,voluntario:voluntario');
  PERFORM pg_temp.assert_eq(p_prefix || 'd: ' || p_name || ' six sub-areas hold coordinador, entrenador, voluntario',
    format($q$SELECT count(*)
                FROM public.dream_team_equipos e
               WHERE e.parent_equipo_id = %L
                 AND e.label NOT IN ('Grupos de Chicas', 'Grupos de Chicos')
                 AND pg_temp.roles_of(e.id) = 'coordinador:coordinador,entrenador:lider,voluntario:voluntario'$q$, p_area),
    '6');
END;
$$;

-- Cases b, c and d for the Dirección de Estudiantes node p_estudiantes.
CREATE OR REPLACE FUNCTION pg_temp.assert_seeded(p_prefix text, p_estudiantes uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_transit uuid := pg_temp.child_id(p_estudiantes, 'Transit');
  v_inside_out uuid := pg_temp.child_id(p_estudiantes, 'Inside Out');
  v_living_room uuid := pg_temp.child_id(p_estudiantes, 'The Living Room');
BEGIN
  PERFORM pg_temp.assert_eq(p_prefix || 'b: Dirección de Estudiantes has Inside Out, The Living Room, Transit',
    format($q$SELECT string_agg(label, ',' ORDER BY label COLLATE "C")
                FROM public.dream_team_equipos WHERE parent_equipo_id = %L$q$, p_estudiantes),
    'Inside Out,The Living Room,Transit');
  PERFORM pg_temp.assert_eq(p_prefix || 'b: The Living Room is active with experiencia the_living_room',
    format($q$SELECT experiencia || CASE WHEN activo THEN '' ELSE ' (inactive)' END
                FROM public.dream_team_equipos WHERE id = %L$q$, v_living_room),
    'the_living_room');
  PERFORM pg_temp.assert_eq(p_prefix || 'b: The Living Room roles',
    format($q$SELECT pg_temp.roles_of(%L)$q$, v_living_room),
    'coordinador:coordinador,director:director');
  PERFORM pg_temp.assert_eq(p_prefix || 'b: Transit roles',
    format($q$SELECT pg_temp.roles_of(%L)$q$, v_transit),
    'coordinador:coordinador,director:director,lider:lider,voluntario:voluntario');
  PERFORM pg_temp.assert_eq(p_prefix || 'b: Inside Out roles',
    format($q$SELECT pg_temp.roles_of(%L)$q$, v_inside_out),
    'coordinador:coordinador,director:director,lider:lider,voluntario:voluntario');

  PERFORM pg_temp.assert_area(p_prefix, v_transit, 'Transit', 'estudiantes');
  PERFORM pg_temp.assert_area(p_prefix, v_inside_out, 'Inside Out', 'estudiantes');
  PERFORM pg_temp.assert_area(p_prefix, v_living_room, 'The Living Room', 'the_living_room');
END;
$$;

-- ── a–d. The real tree after the migration ─────────────────────────────

SELECT pg_temp.assert_eq('a: the Dirección de Estudiantes path resolves to exactly one team',
  $q$SELECT count(*) FROM (SELECT pg_temp.estudiantes_id() AS id) n WHERE n.id IS NOT NULL$q$,
  '1');

SELECT pg_temp.assert_eq('a: Transit, Inside Out and The Living Room each resolve to exactly one team',
  $q$SELECT string_agg(v.label || '=' || (SELECT count(*) FROM public.dream_team_equipos e
                                           WHERE e.parent_equipo_id = pg_temp.estudiantes_id()
                                             AND e.label = v.label),
                       ',' ORDER BY v.label COLLATE "C")
       FROM (VALUES ('Transit'), ('Inside Out'), ('The Living Room')) AS v(label)$q$,
  'Inside Out=1,The Living Room=1,Transit=1');

SELECT pg_temp.assert_seeded('', pg_temp.estudiantes_id());

-- ── e. Re-running the body changes no row ──────────────────────────────

SELECT pg_temp.take_snapshot('rerun', pg_temp.estudiantes_id());

DO $$
BEGIN
  EXECUTE pg_temp.migration_body();
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('e: re-running the migration body', 'raised ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

SELECT pg_temp.assert_unchanged('e: re-run is a no-op', 'rerun', pg_temp.estudiantes_id(),
  ARRAY['equipos inside', 'equipos outside', 'roles inside', 'roles outside']);

-- ── f. A first run on a fresh Dirección de Estudiantes ─────────────────
-- The real Dirección de Estudiantes steps out of the path and a fixture with
-- the production shape (roles director, coordinador; children Transit and
-- Inside Out with coordinador, lider, voluntario) takes its place.

UPDATE public.dream_team_equipos
   SET label = 'ZZ Dirección de Estudiantes moved aside by the test'
 WHERE id = pg_temp.estudiantes_id();

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT 'c5200000-0000-4000-8000-000000000001', 'estudiantes', d.id, 'Dirección de Estudiantes', true
  FROM public.dream_team_equipos d
 WHERE d.parent_equipo_id IS NULL
   AND d.label = 'Dirección de Experiencia';

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  ('c5200000-0000-4000-8000-000000000002', 'estudiantes', 'c5200000-0000-4000-8000-000000000001', 'Transit',    true),
  ('c5200000-0000-4000-8000-000000000003', 'estudiantes', 'c5200000-0000-4000-8000-000000000001', 'Inside Out', true);

INSERT INTO public.dream_team_roles (equipo_id, label, nivel, activo) VALUES
  ('c5200000-0000-4000-8000-000000000001', 'director',    'director',    true),
  ('c5200000-0000-4000-8000-000000000001', 'coordinador', 'coordinador', true),
  ('c5200000-0000-4000-8000-000000000002', 'coordinador', 'coordinador', true),
  ('c5200000-0000-4000-8000-000000000002', 'lider',       'lider',       true),
  ('c5200000-0000-4000-8000-000000000002', 'voluntario',  'voluntario',  true),
  ('c5200000-0000-4000-8000-000000000003', 'coordinador', 'coordinador', true),
  ('c5200000-0000-4000-8000-000000000003', 'lider',       'lider',       true),
  ('c5200000-0000-4000-8000-000000000003', 'voluntario',  'voluntario',  true);

SELECT pg_temp.assert_eq('f: the path now resolves to the fresh fixture',
  $q$SELECT pg_temp.estudiantes_id()::text$q$,
  'c5200000-0000-4000-8000-000000000001');

SELECT pg_temp.take_snapshot('first run', 'c5200000-0000-4000-8000-000000000001');

DO $$
BEGIN
  EXECUTE pg_temp.migration_body();
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('f: first run of the migration body', 'raised ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

SELECT pg_temp.assert_seeded('f (first run) ', 'c5200000-0000-4000-8000-000000000001');

SELECT pg_temp.assert_eq('f: Dirección de Estudiantes keeps exactly its roles',
  $q$SELECT pg_temp.roles_of('c5200000-0000-4000-8000-000000000001')$q$,
  'coordinador:coordinador,director:director');

SELECT pg_temp.assert_unchanged('f: first run touches nothing outside the Dirección de Estudiantes subtree', 'first run',
  'c5200000-0000-4000-8000-000000000001', ARRAY['equipos outside', 'roles outside']);

-- 1 The Living Room + 3 × 8 sub-areas.
SELECT pg_temp.assert_eq('f: the first run adds 25 equipos inside the subtree',
  $q$SELECT (a.n - b.n)::text
       FROM pg_temp.snapshot('c5200000-0000-4000-8000-000000000001') a
       JOIN t_es_snapshots b ON b.phase = 'first run' AND b.slice = a.slice
      WHERE a.slice = 'equipos inside'$q$,
  '25');

-- 2 director + 2 The Living Room + 3 × (2 × 4 + 6 × 3).
SELECT pg_temp.assert_eq('f: the first run adds 82 roles inside the subtree',
  $q$SELECT (a.n - b.n)::text
       FROM pg_temp.snapshot('c5200000-0000-4000-8000-000000000001') a
       JOIN t_es_snapshots b ON b.phase = 'first run' AND b.slice = a.slice
      WHERE a.slice = 'roles inside'$q$,
  '82');

-- ── g. A missing path: the body raises and writes nothing ──────────────
-- A second fixture without Transit takes the path.

UPDATE public.dream_team_equipos
   SET label = 'ZZ fixture moved aside by the test'
 WHERE id = 'c5200000-0000-4000-8000-000000000001';

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT 'c5200000-0000-4000-8000-000000000010', 'estudiantes', d.id, 'Dirección de Estudiantes', true
  FROM public.dream_team_equipos d
 WHERE d.parent_equipo_id IS NULL
   AND d.label = 'Dirección de Experiencia';

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  ('c5200000-0000-4000-8000-000000000011', 'estudiantes', 'c5200000-0000-4000-8000-000000000010', 'Inside Out', true);

SELECT pg_temp.take_snapshot('missing transit', 'c5200000-0000-4000-8000-000000000010');

DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    EXECUTE pg_temp.migration_body();
    RAISE EXCEPTION 'the migration body did not raise';
  EXCEPTION
    WHEN OTHERS THEN
      v_error := SQLERRM;
  END;
  IF v_error IS DISTINCT FROM
     'Dirección de Experiencia › Dirección de Estudiantes › Transit resolves to 0 teams, expected exactly 1' THEN
    PERFORM pg_temp.fail('g: the body raises when Transit resolves to no team', 'got ' || coalesce(v_error, 'NULL'));
  END IF;
END;
$$;

SELECT pg_temp.assert_unchanged('g: a missing Transit writes nothing', 'missing transit',
  'c5200000-0000-4000-8000-000000000010',
  ARRAY['equipos inside', 'equipos outside', 'roles inside', 'roles outside']);

DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    UPDATE public.dream_team_equipos
       SET label = 'ZZ second fixture moved aside by the test'
     WHERE id = 'c5200000-0000-4000-8000-000000000010';
    EXECUTE pg_temp.migration_body();
    RAISE EXCEPTION 'the migration body did not raise';
  EXCEPTION
    WHEN OTHERS THEN
      v_error := SQLERRM;
  END;
  IF v_error IS DISTINCT FROM
     'Dirección de Experiencia › Dirección de Estudiantes resolves to 0 teams, expected exactly 1' THEN
    PERFORM pg_temp.fail('g: the body raises when Dirección de Estudiantes resolves to no team', 'got ' || coalesce(v_error, 'NULL'));
  END IF;
END;
$$;

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_es_failures;

ROLLBACK;
