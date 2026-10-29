-- Section 5 of 20261029200000_usuarios_alcance_campus.sql — a new person keeps
-- a campus. The deferred trigger usuarios_campus_por_defecto runs at commit;
-- this suite fires it early with SET CONSTRAINTS … IMMEDIATE after each step,
-- because the trigger reads the session identity when it fires.
--
-- Covers:
--   1. A person created by somebody with a main campus gets that campus.
--   2. A creating function that writes usuario_campus itself keeps its campus.
--   3. A creator with no campus, with several campuses in the database: none.
--   4. No session (import, service_role), several campuses: none.
--   5. Nothing is added before the trigger fires.
--   6. authenticated cannot execute the trigger function.
-- The single-campus branch (no creator campus and exactly one campus) cannot be
-- isolated on staging, which has real campuses; staging itself has one campus.
--
-- Run against STAGING inside BEGIN…ROLLBACK; fixtures live under e5000000-...
-- and nombre 'ZZ Cd'. The last statement is a SELECT of the failing cases.

BEGIN;
SET LOCAL search_path TO pg_temp, public;
CREATE TEMP TABLE t_f (c text) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION pg_temp.eq(p_case text, p_actual text, p_expected text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_f SELECT p_case || ': expected ' || coalesce(p_expected, 'NULL') || ', got ' || coalesce(p_actual, 'NULL')
   WHERE p_actual IS DISTINCT FROM p_expected;
$$;
CREATE OR REPLACE FUNCTION pg_temp.campus_de(p uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(c.codigo || ':' || uc.es_campus_principal, ','), '')
    FROM public.usuario_campus uc JOIN public.campus c ON c.id = uc.campus_id
   WHERE uc.usuario_id = p;
$$;

INSERT INTO public.campus (id, nombre, codigo) VALUES
  ('e5000000-0000-4000-8000-0000000000ca', 'ZZ Cd A', 'ZZCDA'),
  ('e5000000-0000-4000-8000-0000000000cb', 'ZZ Cd B', 'ZZCDB');
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e5000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'zzcd-pas@example.test', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('e5000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'zzcd-nc@example.test', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
-- PAS has main campus A; SINC has no campus.
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, auth_id) VALUES
  ('e5000000-0000-4000-8000-000000000001', 'ZZ Cd', 'PAS', 'Otro', 'Soltero', 'e5000000-0000-4000-8000-000000000101'),
  ('e5000000-0000-4000-8000-000000000002', 'ZZ Cd', 'SINC', 'Otro', 'Soltero', 'e5000000-0000-4000-8000-000000000102');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES
  ('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-0000000000ca', true);
-- The fixture callers above are done (SINC stays without campus: there are
-- several campuses and no session yet).
SET CONSTRAINTS usuarios_campus_por_defecto IMMEDIATE;
SET CONSTRAINTS usuarios_campus_por_defecto DEFERRED;

-- 1 and 2, as PAS.
SELECT set_config('request.jwt.claims', '', true),
       set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000101', true),
       set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil) VALUES
  ('e5000000-0000-4000-8000-000000000011', 'ZZ Cd', 'N1', 'Otro', 'Soltero');
SELECT pg_temp.eq('nothing is added before the trigger fires', pg_temp.campus_de('e5000000-0000-4000-8000-000000000011'), '');
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil) VALUES
  ('e5000000-0000-4000-8000-000000000012', 'ZZ Cd', 'N2', 'Otro', 'Soltero');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES
  ('e5000000-0000-4000-8000-000000000012', 'e5000000-0000-4000-8000-0000000000cb', true);
SET CONSTRAINTS usuarios_campus_por_defecto IMMEDIATE;
SET CONSTRAINTS usuarios_campus_por_defecto DEFERRED;
SELECT pg_temp.eq('a new person gets the creator''s main campus', pg_temp.campus_de('e5000000-0000-4000-8000-000000000011'), 'ZZCDA:true');
SELECT pg_temp.eq('a campus written by the creating function is kept alone', pg_temp.campus_de('e5000000-0000-4000-8000-000000000012'), 'ZZCDB:true');

-- 3, as SINC.
SELECT set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000102', true);
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil) VALUES
  ('e5000000-0000-4000-8000-000000000013', 'ZZ Cd', 'N3', 'Otro', 'Soltero');
SET CONSTRAINTS usuarios_campus_por_defecto IMMEDIATE;
SET CONSTRAINTS usuarios_campus_por_defecto DEFERRED;
SELECT pg_temp.eq('a creator with no campus and several campuses adds none', pg_temp.campus_de('e5000000-0000-4000-8000-000000000013'), '');

-- 4, service_role with no session.
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'service_role', true);
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil) VALUES
  ('e5000000-0000-4000-8000-000000000014', 'ZZ Cd', 'N4', 'Otro', 'Soltero');
SET CONSTRAINTS usuarios_campus_por_defecto IMMEDIATE;
SELECT pg_temp.eq('no session and several campuses adds none', pg_temp.campus_de('e5000000-0000-4000-8000-000000000014'), '');

-- 6.
SELECT pg_temp.eq('authenticated cannot execute the trigger function',
  has_function_privilege('authenticated', 'public.usuarios_asignar_campus_por_defecto()', 'execute')::text, 'false');

SELECT count(*) AS failing_cases, coalesce(string_agg(c, E'\n'), 'all cases ok') AS detail FROM t_f;
ROLLBACK;
