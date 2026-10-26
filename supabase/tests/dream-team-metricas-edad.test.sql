-- T1 of odd/tasks/ninos-pendientes-2.md (D10 of
-- odd/tasks/ninos-voluntarios-waumba.md) — age metrics of Dream Team
-- volunteers (20261026100000_dream_team_metricas_edad.sql).
--
-- Covers:
--   a. dream_team_rangos_edad buckets a person by age today: <12, 12–17,
--      18–25, 26+ and "sin fecha", with the boundaries 12, 17, 18, 25, 26
--      landing in the bucket that starts or ends with them.
--   b. It answers only for people the caller already reaches by tree: a
--      volunteer of an equipo outside the caller's subtree is not returned,
--      and a plain volunteer gets nobody.
--   c. Hardening: SECURITY DEFINER with a pinned search_path; EXECUTE for
--      authenticated only (not PUBLIC, not anon).
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 COORD (dream_team.coordinate on A);
-- 2–8 volunteers in A's sub-areas S1 and S2 with the birth dates under test;
-- 9 OUTSIDER (volunteer in O, outside A). Tree: R → A → S1, S2; R → O.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_me_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_me_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9300000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9301' WHEN 'us' THEN '9302'
                       WHEN 'eq' THEN '9304' WHEN 'ro' THEN '9305' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- "u3" for usuario 3, so a visible set reads as "u2:12_17,u3:menor_12".
CREATE OR REPLACE FUNCTION pg_temp.k(p_id uuid) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'u' || n FROM generate_series(1, 9) AS n WHERE pg_temp.id('us', n) = p_id;
$$;

-- Every volunteer id, as the screen would send them.
CREATE OR REPLACE FUNCTION pg_temp.todos() RETURNS uuid[] LANGUAGE sql IMMUTABLE AS $$
  SELECT array_agg(pg_temp.id('us', n) ORDER BY n) FROM generate_series(1, 9) AS n;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'me-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 9) AS n;

-- Birth dates relative to today, so each boundary is exact whatever day it runs.
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero, fecha_nacimiento)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Me', 'U' || n, 'me-' || n || '@example.test', 'Soltero', 'Otro',
       CASE n
         WHEN 2 THEN (public.ninos_hoy() - interval '12 years')::date                   -- exactly 12
         WHEN 3 THEN (public.ninos_hoy() - interval '12 years' + interval '1 day')::date -- 11, one day short of 12
         WHEN 4 THEN (public.ninos_hoy() - interval '18 years' + interval '1 day')::date -- 17, one day short of 18
         WHEN 5 THEN (public.ninos_hoy() - interval '18 years')::date                   -- exactly 18
         WHEN 6 THEN (public.ninos_hoy() - interval '26 years' + interval '1 day')::date -- 25, one day short of 26
         WHEN 7 THEN (public.ninos_hoy() - interval '26 years')::date                   -- exactly 26
         WHEN 8 THEN NULL                                                         -- no birth date
         WHEN 9 THEN (public.ninos_hoy() - interval '30 years')::date                   -- outsider
       END
  FROM generate_series(1, 9) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'experiencia', NULL, 'ZZ Me R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Me A', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'ZZ Me S1', true),
  (pg_temp.id('eq', 4), 'ninos', pg_temp.id('eq', 2), 'ZZ Me S2', true),
  (pg_temp.id('eq', 5), 'estudiantes', pg_temp.id('eq', 1), 'ZZ Me O', true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 2), 'Coordinador', true),
  (pg_temp.id('ro', 3), pg_temp.id('eq', 3), 'voluntario', true),
  (pg_temp.id('ro', 4), pg_temp.id('eq', 4), 'voluntario', true),
  (pg_temp.id('ro', 5), pg_temp.id('eq', 5), 'voluntario', true);

INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('us', n),
       pg_temp.id('eq', CASE WHEN n = 1 THEN 2 WHEN n IN (2, 3, 4, 5) THEN 3 WHEN n = 9 THEN 5 ELSE 4 END),
       pg_temp.id('ro', CASE WHEN n = 1 THEN 1 WHEN n IN (2, 3, 4, 5) THEN 3 WHEN n = 9 THEN 5 ELSE 4 END),
       'activo', now(), 'admin_asignacion'
  FROM generate_series(1, 9) AS n;

-- Exact grants: the coordinator of A, and a plain volunteer of S1.
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id = ANY (pg_temp.todos());
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 1), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 2), 'dream_team.serve', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text);

GRANT INSERT, SELECT ON t_me_failures TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.k(uuid), pg_temp.todos() TO authenticated, anon;

-- ── c. hardening (as postgres) ───────────────────────────────────────

SELECT pg_temp.assert_eq('c: SECURITY DEFINER with search_path pinned to public',
  $q$SELECT p.prosecdef::text || ':' || array_to_string(p.proconfig, ',')
       FROM pg_proc p WHERE p.oid = 'public.dream_team_rangos_edad(uuid[])'::regprocedure$q$,
  'true:search_path=public');
SELECT pg_temp.assert_eq('c: EXECUTE for authenticated, not anon, not PUBLIC',
  $q$SELECT has_function_privilege('authenticated', 'public.dream_team_rangos_edad(uuid[])', 'EXECUTE')::text
       || ',' || has_function_privilege('anon', 'public.dream_team_rangos_edad(uuid[])', 'EXECUTE')::text
       || ',' || coalesce((SELECT bool_or(a.grantee = 0)::text
                             FROM pg_proc p, aclexplode(p.proacl) a
                            WHERE p.oid = 'public.dream_team_rangos_edad(uuid[])'::regprocedure), 'default-acl')$q$,
  'true,false,false');

-- ── a. buckets and boundaries ────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

SELECT pg_temp.assert_eq('a+b: the coordinator gets every volunteer of A bucketed, never the outsider',
  $q$SELECT string_agg(pg_temp.k(x.id) || ':' || x.rango, ',' ORDER BY pg_temp.k(x.id))
       FROM public.dream_team_rangos_edad(pg_temp.todos()) x WHERE pg_temp.k(x.id) <> 'u1'$q$,
  'u2:12_17,u3:menor_12,u4:12_17,u5:18_25,u6:18_25,u7:26_mas,u8:sin_fecha');
SELECT pg_temp.assert_eq('a: the coordinator is counted in their own area too (no birth date)',
  $q$SELECT x.rango FROM public.dream_team_rangos_edad(ARRAY[pg_temp.id('us', 1)]) x$q$,
  'sin_fecha');
SELECT pg_temp.assert_eq('a: no birth date ever leaves the function (only id and rango)',
  $q$SELECT string_agg(attname, ',' ORDER BY attnum)
       FROM (SELECT unnest(p.proargnames) AS attname, generate_subscripts(p.proargnames, 1) AS attnum
               FROM pg_proc p WHERE p.oid = 'public.dream_team_rangos_edad(uuid[])'::regprocedure) a
      WHERE attname <> 'p_persona_ids'$q$,
  'id,rango');

-- ── b. scope ─────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('b: a volunteer outside the subtree is not returned',
  $q$SELECT count(*)::text FROM public.dream_team_rangos_edad(ARRAY[pg_temp.id('us', 9)])$q$,
  '0');

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('b: a plain volunteer gets nobody',
  $q$SELECT count(*)::text FROM public.dream_team_rangos_edad(pg_temp.todos())$q$,
  '0');

RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.assert_raises('c: anon cannot call it',
  $q$SELECT * FROM public.dream_team_rangos_edad(pg_temp.todos())$q$,
  '42501');
RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_me_failures;

ROLLBACK;
