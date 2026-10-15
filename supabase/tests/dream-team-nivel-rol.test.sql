-- T1 (odd/tasks/uno-a-uno.md) — explicit authority level on Dream Team roles
-- (migration 20261015100000_dream_team_nivel_rol.sql).
--
-- Covers:
--   a. dream_team_roles.nivel is text, NOT NULL, with no default.
--   b. The check constraint dream_team_roles_nivel_check accepts the four
--      levels and rejects anything else (23514), including a capitalized one.
--   c. A rol inserted without a nivel takes the level of its label:
--      'Director' → director, ' Líder de grupo ' → lider, 'Productor' → voluntario.
--   d. A rol inserted with an explicit nivel keeps it, and renaming a rol never
--      changes its level.
--   e. dream_team_nivel_desde_label ignores case, accents and surrounding spaces,
--      puts coordinador before the lead set and leaves unknown labels at
--      voluntario; it is SECURITY INVOKER, executable by authenticated and
--      service_role, not by anon.
--   f. Every real rol carries the level its label maps to, and the six labels
--      in use map as: director → director, coordinador → coordinador,
--      entrenador / facilitador / lider → lider, voluntario → voluntario.
--   g. The backfill corrects a level that disagrees with the label, and
--      re-running it changes no row.
--
-- Everything reads the migrated schema, so every case fails until the migration
-- is applied (RED) and passes after it (GREEN). g runs the backfill itself, a
-- verbatim copy of the migration's UPDATE kept in pg_temp.backfill().
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept. Fixtures
-- live under this file's own c6100000-... namespace. The MCP connection is
-- `postgres`, so every statement runs as the table owner; no case depends on
-- RLS. The last statement is a SELECT of the failing cases (0 failing cases =
-- all ok), because the MCP tool returns only the last result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_nr_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_nr_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_ok(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected success, got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

-- The level a label maps to, written independently of the migration so cases e
-- and f check the function against the rule rather than against itself.
CREATE OR REPLACE FUNCTION pg_temp.nivel_esperado(p_label text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
           WHEN n = 'director' THEN 'director'
           WHEN n = 'coordinador' THEN 'coordinador'
           WHEN n IN ('lider', 'lider de grupo', 'facilitador', 'entrenador') THEN 'lider'
           ELSE 'voluntario'
         END
    FROM (SELECT translate(lower(btrim(p_label)), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc') AS n) s;
$$;

-- Verbatim copy of the backfill UPDATE of
-- supabase/migrations/20261015100000_dream_team_nivel_rol.sql; returns the rows it changed.
CREATE OR REPLACE FUNCTION pg_temp.backfill()
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_changed bigint;
BEGIN
  update public.dream_team_roles
     set nivel = public.dream_team_nivel_desde_label(label)
   where nivel is distinct from public.dream_team_nivel_desde_label(label);
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed;
END;
$$;

-- Level of one fixture rol.
CREATE OR REPLACE FUNCTION pg_temp.nivel_de(p_id uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT nivel FROM public.dream_team_roles WHERE id = p_id;
$$;

-- Two fixture teams: dream_team_roles_equipo_label_uniq allows a label once per
-- team, and case d reuses the labels of case c.
INSERT INTO public.dream_team_equipos (id, experiencia, label, activo)
VALUES ('c6100000-0000-4000-8000-000000000001', 'dps', 'ZZ nivel-rol fixture', true),
       ('c6100000-0000-4000-8000-000000000002', 'dps', 'ZZ nivel-rol fixture d', true);

-- ── a. the column ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: nivel is text not null with no default', $q$
  SELECT data_type || ' ' || is_nullable || ' ' || coalesce(column_default, 'no default')
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'dream_team_roles' AND column_name = 'nivel'
$q$, 'text NO no default');

-- ── b. the check constraint ──────────────────────────────────────────

SELECT pg_temp.assert_eq('b: the check constraint exists', $q$
  SELECT count(*)::text FROM pg_constraint
   WHERE conrelid = 'public.dream_team_roles'::regclass
     AND conname = 'dream_team_roles_nivel_check' AND contype = 'c'
$q$, '1');

SELECT pg_temp.assert_ok('b: every level is accepted', $q$
  INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel) VALUES
    ('c6100000-0000-4000-8000-0000000000b1', 'c6100000-0000-4000-8000-000000000001', 'ZZ b director', 'director'),
    ('c6100000-0000-4000-8000-0000000000b2', 'c6100000-0000-4000-8000-000000000001', 'ZZ b coordinador', 'coordinador'),
    ('c6100000-0000-4000-8000-0000000000b3', 'c6100000-0000-4000-8000-000000000001', 'ZZ b lider', 'lider'),
    ('c6100000-0000-4000-8000-0000000000b4', 'c6100000-0000-4000-8000-000000000001', 'ZZ b voluntario', 'voluntario')
$q$);

SELECT pg_temp.assert_raises('b: an unknown level is rejected', $q$
  INSERT INTO public.dream_team_roles (equipo_id, label, nivel)
  VALUES ('c6100000-0000-4000-8000-000000000001', 'ZZ b pastor', 'pastor')
$q$, '23514');

SELECT pg_temp.assert_raises('b: a capitalized level is rejected', $q$
  INSERT INTO public.dream_team_roles (equipo_id, label, nivel)
  VALUES ('c6100000-0000-4000-8000-000000000001', 'ZZ b Director', 'Director')
$q$, '23514');

SELECT pg_temp.assert_raises('b: an update to an unknown level is rejected', $q$
  UPDATE public.dream_team_roles SET nivel = 'admin' WHERE id = 'c6100000-0000-4000-8000-0000000000b1'
$q$, '23514');

-- ── c. insert without a nivel ────────────────────────────────────────

SELECT pg_temp.assert_eq('c: the insert trigger exists', $q$
  SELECT count(*)::text FROM pg_trigger
   WHERE tgrelid = 'public.dream_team_roles'::regclass
     AND tgname = 'dream_team_roles_nivel_desde_label' AND NOT tgisinternal
$q$, '1');

SELECT pg_temp.assert_ok('c: roles can be inserted without nivel', $q$
  INSERT INTO public.dream_team_roles (id, equipo_id, label) VALUES
    ('c6100000-0000-4000-8000-0000000000c1', 'c6100000-0000-4000-8000-000000000001', 'Director'),
    ('c6100000-0000-4000-8000-0000000000c2', 'c6100000-0000-4000-8000-000000000001', ' Líder de grupo '),
    ('c6100000-0000-4000-8000-0000000000c3', 'c6100000-0000-4000-8000-000000000001', 'Productor')
$q$);

SELECT pg_temp.assert_eq('c: Director without nivel is director', $q$
  SELECT pg_temp.nivel_de('c6100000-0000-4000-8000-0000000000c1')
$q$, 'director');

SELECT pg_temp.assert_eq('c: " Líder de grupo " without nivel is lider', $q$
  SELECT pg_temp.nivel_de('c6100000-0000-4000-8000-0000000000c2')
$q$, 'lider');

SELECT pg_temp.assert_eq('c: Productor without nivel is voluntario', $q$
  SELECT pg_temp.nivel_de('c6100000-0000-4000-8000-0000000000c3')
$q$, 'voluntario');

SELECT pg_temp.assert_raises('c: an explicit null nivel on update is still rejected', $q$
  UPDATE public.dream_team_roles SET nivel = NULL WHERE id = 'c6100000-0000-4000-8000-0000000000c1'
$q$, '23502');

-- ── d. an explicit nivel wins ────────────────────────────────────────

SELECT pg_temp.assert_ok('d: roles can be inserted with an explicit nivel', $q$
  INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel) VALUES
    ('c6100000-0000-4000-8000-0000000000d1', 'c6100000-0000-4000-8000-000000000002', 'Director', 'voluntario'),
    ('c6100000-0000-4000-8000-0000000000d2', 'c6100000-0000-4000-8000-000000000002', 'Productor', 'coordinador')
$q$);

SELECT pg_temp.assert_eq('d: Director inserted as voluntario keeps voluntario', $q$
  SELECT pg_temp.nivel_de('c6100000-0000-4000-8000-0000000000d1')
$q$, 'voluntario');

SELECT pg_temp.assert_eq('d: Productor inserted as coordinador keeps coordinador', $q$
  SELECT pg_temp.nivel_de('c6100000-0000-4000-8000-0000000000d2')
$q$, 'coordinador');

SELECT pg_temp.assert_ok('d: a rol can be renamed', $q$
  UPDATE public.dream_team_roles SET label = 'Entrenador' WHERE id = 'c6100000-0000-4000-8000-0000000000c3'
$q$);

SELECT pg_temp.assert_eq('d: renaming a rol keeps its level', $q$
  SELECT pg_temp.nivel_de('c6100000-0000-4000-8000-0000000000c3')
$q$, 'voluntario');

-- ── e. the classification function ───────────────────────────────────

SELECT pg_temp.assert_eq('e: the function classifies tricky labels', $q$
  SELECT string_agg(l || '=' || public.dream_team_nivel_desde_label(l), ',' ORDER BY o)
    FROM unnest(ARRAY['  DIRECTOR ', 'Coordinador', 'Líder de Grupo', 'LÍDER', 'Entrenador', 'Facilitador',
                      'Voluntario de Cámara', 'Operador de cámara', '']) WITH ORDINALITY AS t(l, o)
$q$, '  DIRECTOR =director,Coordinador=coordinador,Líder de Grupo=lider,LÍDER=lider,Entrenador=lider,'
     || 'Facilitador=lider,Voluntario de Cámara=voluntario,Operador de cámara=voluntario,=voluntario');

SELECT pg_temp.assert_eq('e: the function agrees with the rule on every real label', $q$
  SELECT count(*)::text FROM (SELECT DISTINCT label FROM public.dream_team_roles) r
   WHERE public.dream_team_nivel_desde_label(label) IS DISTINCT FROM pg_temp.nivel_esperado(label)
$q$, '0');

SELECT pg_temp.assert_eq('e: the function is security invoker', $q$
  SELECT prosecdef::text FROM pg_proc WHERE oid = 'public.dream_team_nivel_desde_label(text)'::regprocedure
$q$, 'false');

SELECT pg_temp.assert_eq('e: authenticated / service_role / anon can execute it', $q$
  SELECT has_function_privilege('authenticated', 'public.dream_team_nivel_desde_label(text)', 'EXECUTE')::text || '/'
      || has_function_privilege('service_role', 'public.dream_team_nivel_desde_label(text)', 'EXECUTE')::text || '/'
      || has_function_privilege('anon', 'public.dream_team_nivel_desde_label(text)', 'EXECUTE')::text
$q$, 'true/true/false');

-- ── f. the real roles (this file's fixtures excluded) ────────────────

SELECT pg_temp.assert_eq('f: every real rol carries the level of its label', $q$
  SELECT count(*)::text FROM public.dream_team_roles
   WHERE equipo_id NOT IN ('c6100000-0000-4000-8000-000000000001', 'c6100000-0000-4000-8000-000000000002')
     AND nivel IS DISTINCT FROM pg_temp.nivel_esperado(label)
$q$, '0');

SELECT pg_temp.assert_eq('f: the six labels in use map as expected', $q$
  SELECT string_agg(DISTINCT label || '=' || nivel, ',' ORDER BY label || '=' || nivel)
    FROM public.dream_team_roles
   WHERE equipo_id NOT IN ('c6100000-0000-4000-8000-000000000001', 'c6100000-0000-4000-8000-000000000002')
     AND label IN ('director', 'coordinador', 'entrenador', 'facilitador', 'lider', 'voluntario')
$q$, 'coordinador=coordinador,director=director,entrenador=lider,facilitador=lider,lider=lider,voluntario=voluntario');

-- ── g. the backfill ──────────────────────────────────────────────────
-- Runs over the whole table: it rewrites the explicit levels of d and the
-- renamed rol too, which is what the migration's one-time backfill did to the
-- rows that existed then.

SELECT pg_temp.assert_ok('g: the backfill fixtures are inserted', $q$
  INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel) VALUES
    ('c6100000-0000-4000-8000-0000000000e1', 'c6100000-0000-4000-8000-000000000001', 'Coordinador', 'lider'),
    ('c6100000-0000-4000-8000-0000000000e2', 'c6100000-0000-4000-8000-000000000001', 'Voluntario de Cámara', 'director')
$q$);

SELECT pg_temp.assert_ok('g: the backfill runs', $q$ SELECT pg_temp.backfill() $q$);

SELECT pg_temp.assert_eq('g: the backfill corrects levels that disagree with the label', $q$
  SELECT pg_temp.nivel_de('c6100000-0000-4000-8000-0000000000e1') || ','
      || pg_temp.nivel_de('c6100000-0000-4000-8000-0000000000e2')
$q$, 'coordinador,voluntario');

SELECT pg_temp.assert_eq('g: re-running the backfill changes no row', $q$
  SELECT pg_temp.backfill()::text
$q$, '0');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_nr_failures;

ROLLBACK;
