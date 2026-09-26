-- RED→GREEN for supabase/migrations/20260925150000_dream_team_servicio_
-- grants_cast_fix.sql — the uuid/text cast fix in
-- sync_talleres_grants_on_servicio_change() (the auto-grant/auto-revoke
-- trigger on public.dream_team_servicios). Run against STAGING inside
-- BEGIN…ROLLBACK — nothing here is kept; every fixture id lives under
-- this file's own ac000000-... namespace.
--
-- BUG UNDER TEST: the trigger's UPDATE branch (the "revoke prior
-- grants" step) and its DELETE branch both compared
--   g.scope_id = v_taller_old
-- where dream_team_capability_grants.scope_id is text and v_taller_old
-- is uuid, raising 42883: operator does not exist: text = uuid. The
-- INSERT-as-activo path (PERFORM assign_talleres_capabilities_for_role,
-- already ::text-cast by 20260822000002) never hits either branch, so
-- this stayed latent until the FIRST update/delete of an existing
-- dream_team_servicios row for a talleres_crecimiento equipo whose rol
-- is in talleres_role_capability_map.
--
-- Fixtures (all as postgres — the trigger is SECURITY DEFINER and is
-- what's under test; no role switch needed):
--   equipo       (ac...01) experiencia='talleres_crecimiento', parent NULL
--   rol director (ac...02) label='director'    on the equipo above
--   rol coord.   (ac...03) label='coordinador' on the equipo above
--   persona                an existing usuarios row with auth_id NOT
--                          NULL, resolved read-only (not inserted)
--   servicio     (ac...04) persona × equipo × rol director
--
-- Scenario (letters match the task's acceptance steps):
--   a) INSERT servicio, rol=director, estado=postulado   → 0 grants
--   b) UPDATE estado → activo                            → exactly the
--      map's director grants, scope_id = equipo::text,
--      source = 'role-auto-grant'
--   c) UPDATE estado → en_pausa                           → those
--      grants removed
--   d) UPDATE estado → activo (again)                     → granted
--      again, no duplicates (exact map count, not "at least")
--   e) UPDATE rol_id → coordinador (still activo)         → director
--      grants gone, coordinador grants present
--   f) DELETE the servicio                                → 0 grants
--
-- Every mutating statement on dream_team_servicios (the ones that fire
-- the trigger under test) runs through pg_temp.assert_no_error, whose
-- EXECUTE sits inside a PL/pgSQL EXCEPTION block — Postgres gives that
-- block an implicit savepoint, so a 42883 raised by the trigger is
-- caught and recorded as a failing case (with the exact SQLSTATE and
-- message) instead of aborting this whole BEGIN…ROLLBACK transaction,
-- which lets every later step still run and report.
--
-- pg_temp.report() raises on any recorded failure AND on an assertion
-- count that doesn't match the 13 assertions this file actually makes
-- — an empty failure list from a harness that silently ran zero
-- assertions is not a green run.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_dts_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_dts_assert_log (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_dts_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dts_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- Every assert_* helper below calls this first, unconditionally, so
-- t_dts_assert_log counts assertions ATTEMPTED, not assertions passed.
CREATE OR REPLACE FUNCTION pg_temp.log_assert(p_case text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dts_assert_log(case_name) VALUES (p_case);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_no_error(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.log_assert(p_case);
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rows(p_case text, p_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  PERFORM pg_temp.log_assert(p_case);
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') s' INTO v_n;
  IF v_n IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || p_expected || ' row(s), got ' || v_n);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- Asserts that the persona's role-auto-grant grants at (experience=
-- talleres_crecimiento, scope_id=p_scope, source=p_source) are EXACTLY
-- talleres_role_capability_map's rows for p_rol — same count (so a
-- re-grant never duplicates: the table's own UNIQUE constraint would
-- turn a real duplicate INSERT into an error, which this function also
-- catches) and the same capability_key set in both directions.
CREATE OR REPLACE FUNCTION pg_temp.assert_grants_match_map(p_case text, p_persona uuid, p_rol text, p_scope text, p_source text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual_count int;
  v_map_count    int;
  v_diff         int;
BEGIN
  PERFORM pg_temp.log_assert(p_case);

  SELECT count(*) INTO v_actual_count FROM public.dream_team_capability_grants
   WHERE persona_id = p_persona AND experience = 'talleres_crecimiento'
     AND source = p_source AND scope_id = p_scope;
  SELECT count(*) INTO v_map_count FROM public.talleres_role_capability_map WHERE rol = p_rol;

  IF v_actual_count IS DISTINCT FROM v_map_count THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || v_map_count || ' grant row(s) (talleres_role_capability_map count for rol ' || p_rol || '), got ' || v_actual_count);
  END IF;

  SELECT count(*) INTO v_diff FROM (
    SELECT capability_key FROM public.dream_team_capability_grants
     WHERE persona_id = p_persona AND experience = 'talleres_crecimiento'
       AND source = p_source AND scope_id = p_scope
    EXCEPT
    SELECT capability_key FROM public.talleres_role_capability_map WHERE rol = p_rol
  ) extra;
  IF v_diff > 0 THEN
    PERFORM pg_temp.fail(p_case, v_diff || ' grant(s) present but not in talleres_role_capability_map for rol ' || p_rol);
  END IF;

  SELECT count(*) INTO v_diff FROM (
    SELECT capability_key FROM public.talleres_role_capability_map WHERE rol = p_rol
    EXCEPT
    SELECT capability_key FROM public.dream_team_capability_grants
     WHERE persona_id = p_persona AND experience = 'talleres_crecimiento'
       AND source = p_source AND scope_id = p_scope
  ) missing;
  IF v_diff > 0 THEN
    PERFORM pg_temp.fail(p_case, v_diff || ' talleres_role_capability_map capability(ies) missing for rol ' || p_rol);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- Checks failures FIRST (so a real failure surfaces its exact case name
-- and verbatim SQLSTATE/message, e.g. the 42883 this file exists to
-- catch) and only THEN guards on the assertion count. Note that
-- pg_temp.assert_no_error's exception handler runs inside a PL/pgSQL
-- BEGIN…EXCEPTION block, which PostgreSQL gives an implicit savepoint:
-- when EXECUTE p_sql raises, the ROLLBACK TO that implicit savepoint
-- also undoes that call's own earlier log_assert() insert, so a run
-- with N real errors is expected to show (13 - N) in t_dts_assert_log,
-- each paired with its failure. The count guard exists for the OTHER
-- failure mode — a silently empty failure list from a harness that ran
-- zero (or fewer than 13) assertions is not a green run.
CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_expected_asserts constant int := 13;
  v_asserts_run      int;
  v_n                int;
  v_msg              text;
BEGIN
  SELECT count(*) INTO v_asserts_run FROM t_dts_assert_log;

  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_dts_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s) (% of % assertions logged):\n%', v_n, v_asserts_run, v_expected_asserts, v_msg;
  END IF;

  IF v_asserts_run IS DISTINCT FROM v_expected_asserts THEN
    RAISE EXCEPTION 'zero failing cases but harness ran % assertion(s), expected exactly % — an unexpected count means this run is not trustworthy', v_asserts_run, v_expected_asserts;
  END IF;

  RAISE NOTICE '% assertions run, all cases ok', v_asserts_run;
END;
$$;

-- ── fixtures (as postgres, before any assertion) ─────────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('ac000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ DTS Grants Cast Fix Equipo', NULL, true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  ('ac000000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-000000000001', 'director',    true),
  ('ac000000-0000-4000-8000-000000000003', 'ac000000-0000-4000-8000-000000000001', 'coordinador', true);

-- A real usuarios row with a non-null auth_id, resolved read-only —
-- this file never inserts into usuarios or auth.users.
INSERT INTO t_dts_fixture (key, id)
  SELECT 'persona', id FROM public.usuarios WHERE auth_id IS NOT NULL ORDER BY id LIMIT 1;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM t_dts_fixture WHERE key = 'persona') THEN
    RAISE EXCEPTION 'fixture precondition failed: no usuarios row with auth_id IS NOT NULL exists on this database';
  END IF;
END;
$guard$;

-- ══ step a — INSERT servicio, rol=director, estado=postulado → 0 grants ══

SELECT pg_temp.assert_no_error('step a: insert servicio (director, postulado)',
  $$INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES (
      'ac000000-0000-4000-8000-000000000004',
      (SELECT id FROM t_dts_fixture WHERE key = 'persona'),
      'ac000000-0000-4000-8000-000000000001',
      'ac000000-0000-4000-8000-000000000002',
      'postulado'
    )$$);

SELECT pg_temp.assert_rows('step a: zero talleres grants while postulado',
  $$SELECT 1 FROM public.dream_team_capability_grants
     WHERE persona_id = (SELECT id FROM t_dts_fixture WHERE key = 'persona')
       AND experience = 'talleres_crecimiento'
       AND scope_id = 'ac000000-0000-4000-8000-000000000001'
       AND source = 'role-auto-grant'$$, 0);

-- ══ step b — UPDATE estado → activo → exactly the map's director grants ══

SELECT pg_temp.assert_no_error('step b: update servicio postulado -> activo',
  $$UPDATE public.dream_team_servicios SET estado = 'activo' WHERE id = 'ac000000-0000-4000-8000-000000000004'$$);

SELECT pg_temp.assert_grants_match_map('step b: director grants match the map after activo',
  (SELECT id FROM t_dts_fixture WHERE key = 'persona'), 'director',
  'ac000000-0000-4000-8000-000000000001', 'role-auto-grant');

-- ══ step c — UPDATE estado → en_pausa → those grants removed ══

SELECT pg_temp.assert_no_error('step c: update servicio activo -> en_pausa',
  $$UPDATE public.dream_team_servicios SET estado = 'en_pausa' WHERE id = 'ac000000-0000-4000-8000-000000000004'$$);

SELECT pg_temp.assert_rows('step c: director grants removed after en_pausa',
  $$SELECT 1 FROM public.dream_team_capability_grants
     WHERE persona_id = (SELECT id FROM t_dts_fixture WHERE key = 'persona')
       AND experience = 'talleres_crecimiento'
       AND scope_id = 'ac000000-0000-4000-8000-000000000001'
       AND source = 'role-auto-grant'$$, 0);

-- ══ step d — UPDATE estado → activo again → granted again, no duplicates ══

SELECT pg_temp.assert_no_error('step d: update servicio en_pausa -> activo (again)',
  $$UPDATE public.dream_team_servicios SET estado = 'activo' WHERE id = 'ac000000-0000-4000-8000-000000000004'$$);

SELECT pg_temp.assert_grants_match_map('step d: director grants match the map again (no duplicates)',
  (SELECT id FROM t_dts_fixture WHERE key = 'persona'), 'director',
  'ac000000-0000-4000-8000-000000000001', 'role-auto-grant');

-- ══ step e — UPDATE rol_id → coordinador while activo → director grants
-- gone, coordinador grants present ══

SELECT pg_temp.assert_no_error('step e: update servicio rol director -> coordinador (still activo)',
  $$UPDATE public.dream_team_servicios SET rol_id = 'ac000000-0000-4000-8000-000000000003' WHERE id = 'ac000000-0000-4000-8000-000000000004'$$);

SELECT pg_temp.assert_rows('step e: director grants gone after rol change',
  $$SELECT 1 FROM public.dream_team_capability_grants
     WHERE persona_id = (SELECT id FROM t_dts_fixture WHERE key = 'persona')
       AND experience = 'talleres_crecimiento'
       AND scope_id = 'ac000000-0000-4000-8000-000000000001'
       AND source = 'role-auto-grant'
       AND capability_key IN (SELECT capability_key FROM public.talleres_role_capability_map WHERE rol = 'director')$$, 0);

SELECT pg_temp.assert_grants_match_map('step e: coordinador grants match the map',
  (SELECT id FROM t_dts_fixture WHERE key = 'persona'), 'coordinador',
  'ac000000-0000-4000-8000-000000000001', 'role-auto-grant');

-- ══ step f — DELETE the servicio → 0 grants ══

SELECT pg_temp.assert_no_error('step f: delete servicio',
  $$DELETE FROM public.dream_team_servicios WHERE id = 'ac000000-0000-4000-8000-000000000004'$$);

SELECT pg_temp.assert_rows('step f: zero talleres grants after delete',
  $$SELECT 1 FROM public.dream_team_capability_grants
     WHERE persona_id = (SELECT id FROM t_dts_fixture WHERE key = 'persona')
       AND experience = 'talleres_crecimiento'
       AND scope_id = 'ac000000-0000-4000-8000-000000000001'
       AND source = 'role-auto-grant'$$, 0);

SELECT pg_temp.report();

ROLLBACK;
