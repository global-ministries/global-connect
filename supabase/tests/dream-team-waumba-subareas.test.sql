-- T2 (odd/tasks/ninos-voluntarios-waumba.md, decision D1) — Waumba Land has its
-- ten sub-areas, each with the roles coordinador, entrenador and voluntario,
-- and Waumba Land itself has entrenador
-- (migration 20261003161000_dream_team_waumba_subareas.sql).
--
-- Covers:
--   a. Dirección de Experiencia › Dirección de Niños › Waumba Land resolves
--      to exactly one team.
--   b. Waumba Land has exactly ten children, all active, all with experiencia
--      'ninos', labelled Anfitriones, Atención al Voluntario, Desmontaje,
--      Líderes, Maternal, Montaje, Producción, Recursos, Social Media and
--      Waumbaland Plus.
--   c. Every sub-area has exactly three roles, all active: coordinador,
--      entrenador, voluntario.
--   d. Waumba Land has the active roles coordinador, entrenador, lider and
--      voluntario, and no other.
--   e. Re-running the migration body changes no row: the count and the full
--      rows of dream_team_equipos and dream_team_roles stay the same, inside
--      and outside the Waumba Land subtree.
--   f. A first run on a fresh Waumba Land (a fixture that takes the real
--      one's place in the path) creates what a, b, c and d expect, and changes
--      no equipo and no role outside that Waumba Land subtree.
--   g. When the path resolves to no team, the migration body raises.
--
-- a–e read the real tree, so they fail until the migration is applied (RED)
-- and pass after it (GREEN). f and g check the body itself and pass either
-- way. The body is a verbatim copy of the migration's DO block, kept in
-- pg_temp.migration_body().
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept. The only
-- fixture is the fresh Waumba Land of case f, under this file's own
-- c5000000-... namespace. The MCP connection is `postgres`, so every statement
-- here runs as the table owner; no case depends on RLS. The last statement is a
-- SELECT of the failing cases (0 failing cases = all ok), because the MCP tool
-- returns only the last result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_wl_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_wl_snapshots (phase text, slice text, n bigint, h text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_wl_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
-- supabase/migrations/20261003161000_dream_team_waumba_subareas.sql.
CREATE OR REPLACE FUNCTION pg_temp.migration_body()
RETURNS text LANGUAGE sql IMMUTABLE AS $body$
SELECT $mig$
do $$
declare
  v_subareas constant text[] := array[
    'Anfitriones',
    'Líderes',
    'Maternal',
    'Waumbaland Plus',
    'Producción',
    'Recursos',
    'Montaje',
    'Desmontaje',
    'Atención al Voluntario',
    'Social Media'
  ];
  v_matches int;
  v_waumba uuid;
begin
  select count(*), (array_agg(w.id))[1]
    into v_matches, v_waumba
  from public.dream_team_equipos d
  join public.dream_team_equipos n
    on n.parent_equipo_id = d.id and n.label = 'Dirección de Niños'
  join public.dream_team_equipos w
    on w.parent_equipo_id = n.id and w.label = 'Waumba Land'
  where d.parent_equipo_id is null
    and d.label = 'Dirección de Experiencia';

  if v_matches <> 1 then
    raise exception 'Dirección de Experiencia › Dirección de Niños › Waumba Land resolves to % teams, expected exactly 1',
      v_matches;
  end if;

  -- ── Sub-areas ──────────────────────────────────────────────────────────
  insert into public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
  select 'ninos', v_waumba, v.label, true
  from unnest(v_subareas) as v(label)
  where not exists (
    select 1 from public.dream_team_equipos e
    where e.parent_equipo_id = v_waumba and e.label = v.label
  );

  -- ── Roles of each sub-area ─────────────────────────────────────────────
  insert into public.dream_team_roles (equipo_id, label, activo)
  select e.id, r.label, true
  from public.dream_team_equipos e
  cross join (values ('coordinador'), ('entrenador'), ('voluntario')) as r(label)
  where e.parent_equipo_id = v_waumba
    and e.label = any (v_subareas)
    and not exists (
      select 1 from public.dream_team_roles x
      where x.equipo_id = e.id and x.label = r.label
    );

  -- ── Waumba Land adds entrenador ────────────────────────────────────────
  insert into public.dream_team_roles (equipo_id, label, activo)
  select v_waumba, 'entrenador', true
  where not exists (
    select 1 from public.dream_team_roles x
    where x.equipo_id = v_waumba and x.label = 'entrenador'
  );
end
$$;
$mig$
$body$;

-- Waumba Land, resolved by its path exactly as the migration does.
CREATE OR REPLACE FUNCTION pg_temp.waumba_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT w.id
    FROM public.dream_team_equipos d
    JOIN public.dream_team_equipos n ON n.parent_equipo_id = d.id AND n.label = 'Dirección de Niños'
    JOIN public.dream_team_equipos w ON w.parent_equipo_id = n.id AND w.label = 'Waumba Land'
   WHERE d.parent_equipo_id IS NULL
     AND d.label = 'Dirección de Experiencia';
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
  INSERT INTO t_wl_snapshots (phase, slice, n, h)
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
      LEFT JOIN t_wl_snapshots b ON b.phase = p_phase AND b.slice = s.slice
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

-- Cases b, c and d for the Waumba Land node p_waumba.
CREATE OR REPLACE FUNCTION pg_temp.assert_seeded(p_prefix text, p_waumba uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.assert_eq(p_prefix || 'b: Waumba Land has exactly ten children',
    format($q$SELECT count(*) FROM public.dream_team_equipos WHERE parent_equipo_id = %L$q$, p_waumba),
    '10');
  PERFORM pg_temp.assert_eq(p_prefix || 'b: the children are the ten sub-areas, active, experiencia ninos',
    format($q$SELECT string_agg(label
                                || CASE WHEN activo THEN '' ELSE ' (inactive)' END
                                || CASE WHEN experiencia = 'ninos' THEN '' ELSE ' [' || experiencia || ']' END,
                                ',' ORDER BY label COLLATE "C")
                FROM public.dream_team_equipos WHERE parent_equipo_id = %L$q$, p_waumba),
    'Anfitriones,Atención al Voluntario,Desmontaje,Líderes,Maternal,Montaje,Producción,Recursos,Social Media,Waumbaland Plus');
  PERFORM pg_temp.assert_eq(p_prefix || 'c: every sub-area has the same three active roles',
    format($q$SELECT string_agg(DISTINCT coalesce(s.roles, '<none>') || ' / ' || s.n_roles, ' ; ')
                FROM (SELECT e.id,
                             string_agg(r.label || CASE WHEN r.activo THEN '' ELSE ' (inactive)' END,
                                        ',' ORDER BY r.label COLLATE "C") AS roles,
                             count(r.id) AS n_roles
                        FROM public.dream_team_equipos e
                        LEFT JOIN public.dream_team_roles r ON r.equipo_id = e.id
                       WHERE e.parent_equipo_id = %L
                       GROUP BY e.id) s$q$, p_waumba),
    'coordinador,entrenador,voluntario / 3');
  PERFORM pg_temp.assert_eq(p_prefix || 'c: ten sub-areas hold exactly coordinador, entrenador, voluntario',
    format($q$SELECT count(*)
                FROM (SELECT e.id,
                             string_agg(r.label, ',' ORDER BY r.label COLLATE "C") FILTER (WHERE r.activo) AS roles,
                             count(r.id) AS n_roles
                        FROM public.dream_team_equipos e
                        LEFT JOIN public.dream_team_roles r ON r.equipo_id = e.id
                       WHERE e.parent_equipo_id = %L
                       GROUP BY e.id) s
               WHERE s.roles = 'coordinador,entrenador,voluntario' AND s.n_roles = 3$q$, p_waumba),
    '10');
  PERFORM pg_temp.assert_eq(p_prefix || 'd: Waumba Land has coordinador, entrenador, lider, voluntario',
    format($q$SELECT string_agg(label || CASE WHEN activo THEN '' ELSE ' (inactive)' END,
                                ',' ORDER BY label COLLATE "C")
                FROM public.dream_team_roles WHERE equipo_id = %L$q$, p_waumba),
    'coordinador,entrenador,lider,voluntario');
END;
$$;

-- ── a–d. The real tree after the migration ─────────────────────────────

SELECT pg_temp.assert_eq('a: the Waumba Land path resolves to exactly one team',
  $q$SELECT count(*) FROM (SELECT pg_temp.waumba_id() AS id) w WHERE w.id IS NOT NULL$q$,
  '1');

SELECT pg_temp.assert_seeded('', pg_temp.waumba_id());

-- ── e. Re-running the body changes no row ──────────────────────────────

SELECT pg_temp.take_snapshot('rerun', pg_temp.waumba_id());

DO $$
BEGIN
  EXECUTE pg_temp.migration_body();
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('e: re-running the migration body', 'raised ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

SELECT pg_temp.assert_unchanged('e: re-run is a no-op', 'rerun', pg_temp.waumba_id(),
  ARRAY['equipos inside', 'equipos outside', 'roles inside', 'roles outside']);

-- ── f. A first run on a fresh Waumba Land ──────────────────────────────
-- The real Waumba Land steps out of the path and a fixture with the seed's
-- roles takes its place.

UPDATE public.dream_team_equipos
   SET label = 'ZZ Waumba Land moved aside by the test'
 WHERE id = pg_temp.waumba_id();

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT 'c5000000-0000-4000-8000-000000000001', 'ninos', n.id, 'Waumba Land', true
  FROM public.dream_team_equipos d
  JOIN public.dream_team_equipos n ON n.parent_equipo_id = d.id AND n.label = 'Dirección de Niños'
 WHERE d.parent_equipo_id IS NULL
   AND d.label = 'Dirección de Experiencia';

INSERT INTO public.dream_team_roles (equipo_id, label, activo) VALUES
  ('c5000000-0000-4000-8000-000000000001', 'coordinador', true),
  ('c5000000-0000-4000-8000-000000000001', 'lider',       true),
  ('c5000000-0000-4000-8000-000000000001', 'voluntario',  true);

SELECT pg_temp.assert_eq('f: the path now resolves to the fresh fixture',
  $q$SELECT pg_temp.waumba_id()::text$q$,
  'c5000000-0000-4000-8000-000000000001');

SELECT pg_temp.take_snapshot('first run', 'c5000000-0000-4000-8000-000000000001');

DO $$
BEGIN
  EXECUTE pg_temp.migration_body();
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('f: first run of the migration body', 'raised ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

SELECT pg_temp.assert_seeded('f (first run) ', 'c5000000-0000-4000-8000-000000000001');

SELECT pg_temp.assert_unchanged('f: first run touches nothing outside the Waumba Land subtree', 'first run',
  'c5000000-0000-4000-8000-000000000001', ARRAY['equipos outside', 'roles outside']);

SELECT pg_temp.assert_eq('f: the first run adds ten equipos inside the subtree',
  $q$SELECT (a.n - b.n)::text
       FROM pg_temp.snapshot('c5000000-0000-4000-8000-000000000001') a
       JOIN t_wl_snapshots b ON b.phase = 'first run' AND b.slice = a.slice
      WHERE a.slice = 'equipos inside'$q$,
  '10');

SELECT pg_temp.assert_eq('f: the first run adds 31 roles inside the subtree',
  $q$SELECT (a.n - b.n)::text
       FROM pg_temp.snapshot('c5000000-0000-4000-8000-000000000001') a
       JOIN t_wl_snapshots b ON b.phase = 'first run' AND b.slice = a.slice
      WHERE a.slice = 'roles inside'$q$,
  '31');

-- ── g. No Waumba Land at the path: the body raises ─────────────────────

DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    UPDATE public.dream_team_equipos
       SET label = 'ZZ fixture moved aside by the test'
     WHERE id = 'c5000000-0000-4000-8000-000000000001';
    EXECUTE pg_temp.migration_body();
    RAISE EXCEPTION 'the migration body did not raise';
  EXCEPTION
    WHEN OTHERS THEN
      v_error := SQLERRM;
  END;
  IF v_error IS DISTINCT FROM
     'Dirección de Experiencia › Dirección de Niños › Waumba Land resolves to 0 teams, expected exactly 1' THEN
    PERFORM pg_temp.fail('g: the body raises when the path resolves to no team', 'got ' || coalesce(v_error, 'NULL'));
  END IF;
END;
$$;

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_wl_failures;

ROLLBACK;
