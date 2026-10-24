-- G1 (odd/tasks/ninos-cobertura.md) — pending pre-registrations use a
-- rolling 7-day window (20261012130000_ninos_cobertura_pendientes.sql).
--
-- Covers:
--   a. A pending row from 6 days ago is listed (whatever the weekday).
--   b. A pending row from 7 days and 1 minute ago is not listed.
--   c. A random user lists nothing; anon cannot execute.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION, 2 RANDOM.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_cp_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_cp_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_cp_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9700000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9701' WHEN 'us' THEN '9702' WHEN 'eq' THEN '9704'
                       WHEN 'ro' THEN '9705' WHEN 'sa' THEN '9706' WHEN 'pr' THEN '9707' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_cp_ctx WHERE k = p_k;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_cp_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto';

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'cp-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 2) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Cp', 'U' || n, 'cp-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 2) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Cp R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Cp W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 2) n);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'upstreet', 'ZZ Cp S1', 20, 1, 1, -100);

INSERT INTO public.ninos_preregistros (id, campus_id, payload, created_at) VALUES
  (pg_temp.id('pr', 1), pg_temp.ctx('campus')::uuid, '{"padre":{},"hijos":[{}]}', now() - interval '6 days'),
  (pg_temp.id('pr', 2), pg_temp.ctx('campus')::uuid, '{"padre":{},"hijos":[{}]}', now() - interval '7 days 1 minute'),
  (pg_temp.id('pr', 3), pg_temp.ctx('campus')::uuid, '{"padre":{},"hijos":[{}]}', now());

GRANT INSERT, SELECT, UPDATE ON t_cp_failures, t_cp_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text) TO authenticated, anon;

-- ── a/b. rolling window ──────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('a: a pending row from 6 days ago is listed',
  $q$SELECT count(*)::text FROM public.ninos_preregistros_pendientes() WHERE id = pg_temp.id('pr', 1)$q$, '1');
SELECT pg_temp.assert_eq('a: a pending row from now is listed',
  $q$SELECT count(*)::text FROM public.ninos_preregistros_pendientes() WHERE id = pg_temp.id('pr', 3)$q$, '1');
SELECT pg_temp.assert_eq('b: a pending row older than 7 days is not listed',
  $q$SELECT count(*)::text FROM public.ninos_preregistros_pendientes() WHERE id = pg_temp.id('pr', 2)$q$, '0');

-- ── c. others ────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('c: a random user lists nothing of this campus',
  $q$SELECT count(*)::text FROM public.ninos_preregistros_pendientes()
      WHERE id IN (pg_temp.id('pr', 1), pg_temp.id('pr', 3))$q$, '0');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('c: anon cannot execute ninos_preregistros_pendientes',
  $q$SELECT * FROM public.ninos_preregistros_pendientes()$q$, '42501');
RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_cp_failures;

ROLLBACK;
