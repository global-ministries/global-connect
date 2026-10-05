-- T8 (odd/tasks/ninos-voluntarios-waumba.md, D12) — campus service shifts.
--
-- Covers:
--   a. Barquisimeto (campus 'BQT') has "Domingo 9:00" and "Domingo 11:00".
--   b. Any authenticated user reads the shifts; only dream_team.org.manage
--      creates or edits them.
--   c. dream_team_turnos_del_equipo(equipo, campus): with no restriction a
--      node serves every active shift of the campus; a restriction on a node is
--      inherited by its descendants; a descendant may narrow it; a restriction
--      for one campus does not touch another campus.
--   d. Only dream_team.org.manage in the tree restricts a node's shifts.
--   e. Whoever edits a servicio assigns it to one or more shifts; a plain
--      volunteer does not; a shift of another campus, an inactive shift or a
--      shift the node does not serve is rejected.
--   f. Reading the assignments follows the servicio's read policy.
--   g. anon cannot execute the helper function.
--   h. Narrowing a node's shifts removes the assignments that no longer fit in
--      the node and its descendants (a descendant with its own restriction is
--      judged by it); deactivating a shift removes its assignments.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases (0 failing cases = all ok).
--
-- Identities (usuario n = auth n): 1 MGR org.manage NULL scope; 2 DIR
-- dream_team.direct on N; 3 VOL dream_team.serve on S, servicio in S;
-- 4 P1 principal campus Z1, servicio in S; 5 P2 principal campus Z2, servicio
-- in S; 6 OUT dream_team.direct on E.
-- Tree: R (root) → N → S; R → E.  Campus Z1: T1 dom 9, T2 dom 11, T3 sáb 17,
-- T4 inactive. Campus Z2: T5.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_tu_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_tu_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

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

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f8000000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '8001' WHEN 'us' THEN '8002' WHEN 'ca' THEN '8003'
                       WHEN 'eq' THEN '8004' WHEN 'ro' THEN '8005' WHEN 'tu' THEN '8006'
                       WHEN 'se' THEN '8007' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- ── a. Barquisimeto's seeded shifts (before any fixture) ─────────────

SELECT pg_temp.assert_eq('a: BQT has Domingo 9:00 and Domingo 11:00',
  $q$SELECT string_agg(t.nombre || '/' || t.dia_semana || '/' || to_char(t.hora, 'HH24:MI'), ', ' ORDER BY t.orden)
       FROM public.dream_team_turnos t JOIN public.campus c ON c.id = t.campus_id
      WHERE c.codigo = 'BQT' AND t.activo$q$,
  'Domingo 9:00/0/09:00, Domingo 11:00/0/11:00');

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'tu-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 6) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Tu', 'U' || n, 'tu-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 6) AS n;

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Tu Campus 1', 'ZZTU1'),
  (pg_temp.id('ca', 2), 'ZZ Tu Campus 2', 'ZZTU2');

INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES
  (pg_temp.id('us', 3), pg_temp.id('ca', 1), true),
  (pg_temp.id('us', 4), pg_temp.id('ca', 1), true),
  (pg_temp.id('us', 5), pg_temp.id('ca', 1), false),
  (pg_temp.id('us', 5), pg_temp.id('ca', 2), true);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'experiencia', NULL, 'ZZ Tu R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Tu N', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'ZZ Tu S', true),
  (pg_temp.id('eq', 4), 'estudiantes', pg_temp.id('eq', 1), 'ZZ Tu E', true),
  (pg_temp.id('eq', 5), 'ninos', pg_temp.id('eq', 3), 'ZZ Tu S2', true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 5), 'voluntario', true);

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 1), 'dream_team.org.manage', 'dream_team', 'experience', NULL),
  (pg_temp.id('us', 2), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 3), 'dream_team.serve', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text),
  (pg_temp.id('us', 6), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 4)::text);

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES
  (pg_temp.id('se', 3), pg_temp.id('us', 3), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo'),
  (pg_temp.id('se', 4), pg_temp.id('us', 4), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo'),
  (pg_temp.id('se', 5), pg_temp.id('us', 5), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo'),
  (pg_temp.id('se', 6), pg_temp.id('us', 4), pg_temp.id('eq', 5), pg_temp.id('ro', 2), 'activo');

-- Table grants are explicit in the migration; the helpers need theirs here.
GRANT INSERT, SELECT ON t_tu_failures TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_ok(text, text), pg_temp.assert_raises(text, text, text),
  pg_temp.as_persona(int), pg_temp.id(text, int) TO authenticated;

-- ── b. the campus shift list ─────────────────────────────────────────

SET LOCAL ROLE authenticated;

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_ok('b: org.manage creates shifts',
  $q$INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo) VALUES
       (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'Domingo 9:00', 0, '09:00', 1, true),
       (pg_temp.id('tu', 2), pg_temp.id('ca', 1), 'Domingo 11:00', 0, '11:00', 2, true),
       (pg_temp.id('tu', 3), pg_temp.id('ca', 1), 'Sábado 17:00', 6, '17:00', 3, true),
       (pg_temp.id('tu', 4), pg_temp.id('ca', 1), 'Viejo', 3, '19:00', 4, false),
       (pg_temp.id('tu', 5), pg_temp.id('ca', 2), 'Domingo 10:00', 0, '10:00', 1, true)$q$);
SELECT pg_temp.assert_ok('b: org.manage edits a shift',
  $q$UPDATE public.dream_team_turnos SET orden = 3 WHERE id = pg_temp.id('tu', 3)$q$);

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('b: a director reads the shifts',
  $q$SELECT count(*)::text FROM public.dream_team_turnos WHERE campus_id IN (pg_temp.id('ca', 1), pg_temp.id('ca', 2))$q$,
  '5');
SELECT pg_temp.assert_raises('b: a director cannot create a shift',
  $q$INSERT INTO public.dream_team_turnos (campus_id, nombre, dia_semana, hora) VALUES
       (pg_temp.id('ca', 1), 'Intruso', 1, '08:00')$q$,
  '42501');
SELECT pg_temp.assert_eq('b: a director cannot edit a shift',
  $q$WITH u AS (UPDATE public.dream_team_turnos SET nombre = 'X' WHERE id = pg_temp.id('tu', 1) RETURNING 1)
     SELECT count(*)::text FROM u$q$,
  '0');

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('b: dia_semana stays within 0..6',
  $q$INSERT INTO public.dream_team_turnos (campus_id, nombre, dia_semana, hora) VALUES
       (pg_temp.id('ca', 1), 'Octavo día', 7, '08:00')$q$,
  '23514');

-- ── c/d. which shifts each node serves ───────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c: with no restriction S serves every active shift of Z1',
  $q$SELECT string_agg(t, ',' ORDER BY t) FROM (
       SELECT CASE x WHEN pg_temp.id('tu', 1) THEN 'T1' WHEN pg_temp.id('tu', 2) THEN 'T2'
                     WHEN pg_temp.id('tu', 3) THEN 'T3' ELSE 'T?' END AS t
         FROM public.dream_team_turnos_del_equipo(pg_temp.id('eq', 3), pg_temp.id('ca', 1)) AS x) y$q$,
  'T1,T2,T3');

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('d: a director cannot restrict a node',
  $q$INSERT INTO public.dream_team_equipo_turnos (equipo_id, turno_id) VALUES
       (pg_temp.id('eq', 2), pg_temp.id('tu', 1))$q$,
  '42501');

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_ok('d: org.manage restricts N to T1 and T2',
  $q$INSERT INTO public.dream_team_equipo_turnos (equipo_id, turno_id) VALUES
       (pg_temp.id('eq', 2), pg_temp.id('tu', 1)), (pg_temp.id('eq', 2), pg_temp.id('tu', 2))$q$);

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('c: S inherits the restriction of N',
  $q$SELECT count(*)::text || ':' || bool_and(x IN (pg_temp.id('tu', 1), pg_temp.id('tu', 2)))::text
       FROM public.dream_team_turnos_del_equipo(pg_temp.id('eq', 3), pg_temp.id('ca', 1)) AS x$q$,
  '2:true');
SELECT pg_temp.assert_eq('c: E, a sibling branch, still serves every shift',
  $q$SELECT count(*)::text FROM public.dream_team_turnos_del_equipo(pg_temp.id('eq', 4), pg_temp.id('ca', 1))$q$,
  '3');
SELECT pg_temp.assert_eq('c: the restriction of Z1 does not touch Z2',
  $q$SELECT string_agg(x::text, ',') FROM public.dream_team_turnos_del_equipo(pg_temp.id('eq', 3), pg_temp.id('ca', 2)) AS x$q$,
  pg_temp.id('tu', 5)::text);
SELECT pg_temp.assert_eq('d: a director reads the restriction of N',
  $q$SELECT count(*)::text FROM public.dream_team_equipo_turnos WHERE equipo_id = pg_temp.id('eq', 2)$q$,
  '2');

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_ok('c: S narrows to T2',
  $q$INSERT INTO public.dream_team_equipo_turnos (equipo_id, turno_id) VALUES (pg_temp.id('eq', 3), pg_temp.id('tu', 2))$q$);
SELECT pg_temp.assert_eq('c: S serves only T2 now',
  $q$SELECT string_agg(x::text, ',') FROM public.dream_team_turnos_del_equipo(pg_temp.id('eq', 3), pg_temp.id('ca', 1)) AS x$q$,
  pg_temp.id('tu', 2)::text);
SELECT pg_temp.assert_ok('c: S drops its own restriction',
  $q$DELETE FROM public.dream_team_equipo_turnos WHERE equipo_id = pg_temp.id('eq', 3)$q$);

-- ── e. assigning servicios to shifts ─────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_ok('e: a director assigns P1 to T1 and T2',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES
       (pg_temp.id('se', 4), pg_temp.id('tu', 1)), (pg_temp.id('se', 4), pg_temp.id('tu', 2))$q$);
SELECT pg_temp.assert_raises('e: a shift S does not serve is rejected',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES (pg_temp.id('se', 3), pg_temp.id('tu', 3))$q$,
  '23514');
SELECT pg_temp.assert_raises('e: an inactive shift is rejected',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES (pg_temp.id('se', 3), pg_temp.id('tu', 4))$q$,
  '23514');
SELECT pg_temp.assert_raises('e: a shift of another campus is rejected',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES (pg_temp.id('se', 5), pg_temp.id('tu', 1))$q$,
  '23514');
SELECT pg_temp.assert_ok('e: P2 goes to a shift of its principal campus Z2',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES (pg_temp.id('se', 5), pg_temp.id('tu', 5))$q$);
SELECT pg_temp.assert_ok('e: a director unassigns a shift',
  $q$DELETE FROM public.dream_team_servicio_turnos WHERE servicio_id = pg_temp.id('se', 4) AND turno_id = pg_temp.id('tu', 2)$q$);

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('e: a plain volunteer cannot assign',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES (pg_temp.id('se', 3), pg_temp.id('tu', 1))$q$,
  '42501');

SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_raises('e: a director of another branch cannot assign',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES (pg_temp.id('se', 3), pg_temp.id('tu', 1))$q$,
  '42501');
SELECT pg_temp.assert_eq('e: a director of another branch cannot unassign',
  $q$WITH d AS (DELETE FROM public.dream_team_servicio_turnos WHERE servicio_id = pg_temp.id('se', 4) RETURNING 1)
     SELECT count(*)::text FROM d$q$,
  '0');

-- ── f. reading assignments ───────────────────────────────────────────

SELECT pg_temp.assert_eq('f: another branch reads none of the assignments',
  $q$SELECT count(*)::text FROM public.dream_team_servicio_turnos WHERE servicio_id IN (pg_temp.id('se', 4), pg_temp.id('se', 5))$q$,
  '0');

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('f: the director reads the assignments of the branch',
  $q$SELECT count(*)::text FROM public.dream_team_servicio_turnos WHERE servicio_id IN (pg_temp.id('se', 4), pg_temp.id('se', 5))$q$,
  '2');

-- ── h. narrowing and deactivating prune the assignments ──────────────
-- State here: N restricted to T1, T2; S inherits; P1 (se4) on T1; P2 (se5)
-- on T5 of Z2.

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_ok('h: fixture assignments on T1 and T2',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES
       (pg_temp.id('se', 3), pg_temp.id('tu', 1)), (pg_temp.id('se', 3), pg_temp.id('tu', 2)),
       (pg_temp.id('se', 4), pg_temp.id('tu', 2)),
       (pg_temp.id('se', 6), pg_temp.id('tu', 1)), (pg_temp.id('se', 6), pg_temp.id('tu', 2))$q$);

SELECT pg_temp.assert_ok('h: S2 restricts itself to T2 and T3',
  $q$INSERT INTO public.dream_team_equipo_turnos (equipo_id, turno_id) VALUES
       (pg_temp.id('eq', 5), pg_temp.id('tu', 2)), (pg_temp.id('eq', 5), pg_temp.id('tu', 3))$q$);
SELECT pg_temp.assert_eq('h: the S2 servicio loses T1, which S2 no longer serves',
  $q$SELECT string_agg(turno_id::text, ',') FROM public.dream_team_servicio_turnos WHERE servicio_id = pg_temp.id('se', 6)$q$,
  pg_temp.id('tu', 2)::text);

SELECT pg_temp.assert_ok('h: N narrows to T1',
  $q$DELETE FROM public.dream_team_equipo_turnos WHERE equipo_id = pg_temp.id('eq', 2) AND turno_id = pg_temp.id('tu', 2)$q$);
SELECT pg_temp.assert_eq('h: servicios of S, which inherits N, keep only T1',
  $q$SELECT string_agg(servicio_id::text || '=' || turno_id::text, ',' ORDER BY servicio_id, turno_id)
       FROM public.dream_team_servicio_turnos
      WHERE servicio_id IN (pg_temp.id('se', 3), pg_temp.id('se', 4))$q$,
  pg_temp.id('se', 3)::text || '=' || pg_temp.id('tu', 1)::text || ',' ||
  pg_temp.id('se', 4)::text || '=' || pg_temp.id('tu', 1)::text);
SELECT pg_temp.assert_eq('h: S2 keeps T2 under its own restriction',
  $q$SELECT string_agg(turno_id::text, ',') FROM public.dream_team_servicio_turnos WHERE servicio_id = pg_temp.id('se', 6)$q$,
  pg_temp.id('tu', 2)::text);
SELECT pg_temp.assert_eq('h: a shift of another campus is untouched',
  $q$SELECT string_agg(turno_id::text, ',') FROM public.dream_team_servicio_turnos WHERE servicio_id = pg_temp.id('se', 5)$q$,
  pg_temp.id('tu', 5)::text);

SELECT pg_temp.assert_ok('h: org.manage deactivates T1',
  $q$UPDATE public.dream_team_turnos SET activo = false WHERE id = pg_temp.id('tu', 1)$q$);
SELECT pg_temp.assert_eq('h: a deactivated shift keeps no assignment',
  $q$SELECT count(*)::text FROM public.dream_team_servicio_turnos WHERE turno_id = pg_temp.id('tu', 1)$q$,
  '0');
SELECT pg_temp.assert_eq('h: other shifts keep theirs',
  $q$SELECT count(*)::text FROM public.dream_team_servicio_turnos
      WHERE servicio_id IN (pg_temp.id('se', 5), pg_temp.id('se', 6))$q$,
  '2');

RESET ROLE;

-- ── g. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('g: anon cannot execute the helper',
  $q$SELECT has_function_privilege('anon', 'public.dream_team_turnos_del_equipo(uuid, uuid)', 'EXECUTE')::text$q$,
  'false');
SELECT pg_temp.assert_eq('g: the assignment trigger function is not executable by authenticated',
  $q$SELECT has_function_privilege('authenticated', 'public.dream_team_servicio_turnos_validar()', 'EXECUTE')::text$q$,
  'false');
SELECT pg_temp.assert_eq('g: RLS is on for the three tables',
  $q$SELECT string_agg(relname || '=' || relrowsecurity, ',' ORDER BY relname) FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname IN ('dream_team_turnos', 'dream_team_equipo_turnos', 'dream_team_servicio_turnos')$q$,
  'dream_team_equipo_turnos=true,dream_team_servicio_turnos=true,dream_team_turnos=true');
SELECT pg_temp.assert_eq('g: the pruning trigger functions are not executable by authenticated',
  $q$SELECT (has_function_privilege('authenticated', 'public.dream_team_equipo_turnos_podar()', 'EXECUTE')
          OR has_function_privilege('authenticated', 'public.dream_team_turnos_podar_inactivo()', 'EXECUTE'))::text$q$,
  'false');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_tu_failures;

ROLLBACK;
