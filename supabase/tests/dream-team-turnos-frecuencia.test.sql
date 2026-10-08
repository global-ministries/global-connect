-- T10 (odd/tasks/ninos-voluntarios-waumba.md, D13) — service frequency.
--
-- Covers:
--   a. An assignment made without a frequency is semanal with no anchor.
--   b. quincenal needs an anchor Sunday; semanal takes no anchor.
--   c. Whoever edits the servicio changes the frequency of its assignment.
--   d. A plain volunteer, or a director of another node, cannot change it.
--   e. An UPDATE cannot move the assignment to another shift (column grant).
--   f. dream_team_turno_sirve_en: even weeks from the anchor serve, odd do not;
--      semanal always serves.
--   g. anon cannot execute dream_team_turno_sirve_en.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases (0 failing cases = all ok).
--
-- Identities (usuario n = auth n): 1 MGR org.manage NULL scope; 2 DIR
-- dream_team.direct on N; 3 VOL dream_team.serve on S, servicio in S;
-- 4 P1 servicio in S; 6 OUT dream_team.direct on E. All in campus Z1.
-- Tree: R (root) → N → S; R → E. Campus Z1: T1 dom 9, T2 dom 11.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_fr_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_fr_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9000000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '8001' WHEN 'us' THEN '8002' WHEN 'ca' THEN '8003'
                       WHEN 'eq' THEN '8004' WHEN 'ro' THEN '8005' WHEN 'tu' THEN '8006'
                       WHEN 'se' THEN '8007' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'fr-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 6) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Fr', 'U' || n, 'fr-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 6) AS n;

INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 1), 'ZZ Fr Campus 1', 'ZZFR1');

INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES
  (pg_temp.id('us', 3), pg_temp.id('ca', 1), true),
  (pg_temp.id('us', 4), pg_temp.id('ca', 1), true);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'experiencia', NULL, 'ZZ Fr R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Fr N', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'ZZ Fr S', true),
  (pg_temp.id('eq', 4), 'estudiantes', pg_temp.id('eq', 1), 'ZZ Fr E', true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 1), 'dream_team.org.manage', 'dream_team', 'experience', NULL),
  (pg_temp.id('us', 2), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 3), 'dream_team.serve', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text),
  (pg_temp.id('us', 6), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 4)::text);

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES
  (pg_temp.id('se', 3), pg_temp.id('us', 3), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo'),
  (pg_temp.id('se', 4), pg_temp.id('us', 4), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo');

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'Domingo 9:00', 0, '09:00', 1),
  (pg_temp.id('tu', 2), pg_temp.id('ca', 1), 'Domingo 11:00', 0, '11:00', 2);

GRANT INSERT, SELECT ON t_fr_failures TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_ok(text, text), pg_temp.assert_raises(text, text, text),
  pg_temp.as_persona(int), pg_temp.id(text, int) TO authenticated;

SET LOCAL ROLE authenticated;

-- ── a/b. default and shape ───────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_ok('a: the director assigns T1 to P1 with no frequency',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES (pg_temp.id('se', 4), pg_temp.id('tu', 1))$q$);
SELECT pg_temp.assert_eq('a: the new assignment is semanal with no anchor',
  $q$SELECT frecuencia || '/' || coalesce(fecha_ancla::text, 'null') FROM public.dream_team_servicio_turnos
      WHERE servicio_id = pg_temp.id('se', 4) AND turno_id = pg_temp.id('tu', 1)$q$,
  'semanal/null');
SELECT pg_temp.assert_raises('b: quincenal without an anchor is rejected',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id, frecuencia) VALUES
       (pg_temp.id('se', 3), pg_temp.id('tu', 1), 'quincenal')$q$,
  '23514');
SELECT pg_temp.assert_raises('b: a Monday anchor is rejected',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id, frecuencia, fecha_ancla) VALUES
       (pg_temp.id('se', 3), pg_temp.id('tu', 1), 'quincenal', '2026-10-05')$q$,
  '23514');
SELECT pg_temp.assert_raises('b: semanal with an anchor is rejected',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id, frecuencia, fecha_ancla) VALUES
       (pg_temp.id('se', 3), pg_temp.id('tu', 1), 'semanal', '2026-10-04')$q$,
  '23514');
SELECT pg_temp.assert_raises('b: an unknown frequency is rejected',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id, frecuencia) VALUES
       (pg_temp.id('se', 3), pg_temp.id('tu', 1), 'mensual')$q$,
  '23514');
SELECT pg_temp.assert_ok('b: quincenal with a Sunday anchor is accepted',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id, frecuencia, fecha_ancla) VALUES
       (pg_temp.id('se', 3), pg_temp.id('tu', 2), 'quincenal', '2026-10-04')$q$);

-- ── c/d/e. who changes the frequency ─────────────────────────────────

SELECT pg_temp.assert_eq('c: the director makes P1 biweekly',
  $q$WITH u AS (UPDATE public.dream_team_servicio_turnos SET frecuencia = 'quincenal', fecha_ancla = '2026-10-11'
                 WHERE servicio_id = pg_temp.id('se', 4) AND turno_id = pg_temp.id('tu', 1) RETURNING 1)
     SELECT count(*)::text FROM u$q$,
  '1');
SELECT pg_temp.assert_raises('e: an UPDATE cannot move the assignment to another shift',
  $q$UPDATE public.dream_team_servicio_turnos SET turno_id = pg_temp.id('tu', 2) WHERE servicio_id = pg_temp.id('se', 4)$q$,
  '42501');

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('d: a plain volunteer cannot change a frequency',
  $q$WITH u AS (UPDATE public.dream_team_servicio_turnos SET frecuencia = 'semanal', fecha_ancla = NULL
                 WHERE servicio_id = pg_temp.id('se', 4) RETURNING 1)
     SELECT count(*)::text FROM u$q$,
  '0');

SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('d: a director of another node cannot change a frequency',
  $q$WITH u AS (UPDATE public.dream_team_servicio_turnos SET frecuencia = 'semanal', fecha_ancla = NULL
                 WHERE servicio_id = pg_temp.id('se', 4) RETURNING 1)
     SELECT count(*)::text FROM u$q$,
  '0');

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c: P1 stays biweekly from 2026-10-11',
  $q$SELECT frecuencia || '/' || fecha_ancla::text FROM public.dream_team_servicio_turnos
      WHERE servicio_id = pg_temp.id('se', 4) AND turno_id = pg_temp.id('tu', 1)$q$,
  'quincenal/2026-10-11');

-- ── f. which Sundays a biweekly volunteer serves ─────────────────────

SELECT pg_temp.assert_eq('f: anchor 2026-10-04 serves on 09-20, 10-04, 10-18 and not on 09-27, 10-11',
  $q$SELECT string_agg(d::text || '=' || public.dream_team_turno_sirve_en('quincenal', '2026-10-04', d)::text, ',' ORDER BY d)
       FROM unnest(ARRAY['2026-09-20','2026-09-27','2026-10-04','2026-10-11','2026-10-18']::date[]) AS d$q$,
  '2026-09-20=true,2026-09-27=false,2026-10-04=true,2026-10-11=false,2026-10-18=true');
SELECT pg_temp.assert_eq('f: a year boundary keeps the parity (12 and 13 weeks)',
  $q$SELECT public.dream_team_turno_sirve_en('quincenal', '2026-10-04', '2026-12-27')::text || ','
         || public.dream_team_turno_sirve_en('quincenal', '2026-10-04', '2027-01-03')::text$q$,
  'true,false');
SELECT pg_temp.assert_eq('f: semanal always serves',
  $q$SELECT public.dream_team_turno_sirve_en('semanal', NULL, '2026-10-11')::text$q$,
  'true');

-- ── g. grants ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('g: anon cannot execute dream_team_turno_sirve_en',
  $q$SELECT has_function_privilege('anon', 'public.dream_team_turno_sirve_en(text, date, date)', 'EXECUTE')::text$q$,
  'false');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_fr_failures;

ROLLBACK;
