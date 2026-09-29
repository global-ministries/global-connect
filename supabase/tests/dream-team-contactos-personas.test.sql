-- T1 (odd/tasks/dream-team-servidores-rediseno.md) — RED→GREEN for
-- public.dream_team_contactos_personas(uuid[]): phone + tiene_cuenta of the
-- people the caller reaches by tree, nothing for anyone else, never auth_id.
--
-- Run against STAGING inside BEGIN…ROLLBACK; fixtures live under the
-- c1000000-... namespace. The MCP connection is `postgres` (BYPASSRLS), so
-- every authorization assertion runs under SET LOCAL ROLE authenticated with
-- request.jwt.claim.sub set to the fixture auth id.
--
-- Identities:
--   director A (…21) dream_team.direct on branch A       -> sees A's people
--   director B (…23) dream_team.direct on branch B       -> sees B's people only
--   member     (…25) no capability at all                -> sees nobody
--   global     (…27) dream_team.org.manage, scope NULL   -> sees everyone
-- People: pA1 (…31, with account), pA2 (…33, no account), pA3 (…35, in a CHILD
-- node of A: proves the tree walk), pB1 (…37, branch B).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_cp_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_cp_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_cp_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rows(p_case text, p_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') s' INTO v_n;
  IF v_n IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || p_expected || ' row(s), got ' || v_n);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_cp_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
  RAISE NOTICE 'all cases ok';
END;
$$;

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ CP Rama A',     'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('c1000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ CP Rama A hija', 'c1000000-0000-4000-8000-000000000001', true),
  ('c1000000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ CP Rama B',     'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  ('c1000000-0000-4000-8000-000000000011', 'c1000000-0000-4000-8000-000000000001', 'Voluntario', true),
  ('c1000000-0000-4000-8000-000000000012', 'c1000000-0000-4000-8000-000000000002', 'Voluntario', true),
  ('c1000000-0000-4000-8000-000000000013', 'c1000000-0000-4000-8000-000000000003', 'Voluntario', true);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('c1000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 'cp-dir-a@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('c1000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 'cp-dir-b@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('c1000000-0000-4000-8000-000000000024', 'authenticated', 'authenticated', 'cp-member@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('c1000000-0000-4000-8000-000000000026', 'authenticated', 'authenticated', 'cp-global@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('c1000000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'cp-pa1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, telefono, estado_civil, genero) VALUES
  ('c1000000-0000-4000-8000-000000000021', 'c1000000-0000-4000-8000-000000000020', 'CP', 'DirectorA', 'cp-dir-a@example.test', NULL, 'Soltero', 'Otro'),
  ('c1000000-0000-4000-8000-000000000023', 'c1000000-0000-4000-8000-000000000022', 'CP', 'DirectorB', 'cp-dir-b@example.test', NULL, 'Soltero', 'Otro'),
  ('c1000000-0000-4000-8000-000000000025', 'c1000000-0000-4000-8000-000000000024', 'CP', 'Member',    'cp-member@example.test', NULL, 'Soltero', 'Otro'),
  ('c1000000-0000-4000-8000-000000000027', 'c1000000-0000-4000-8000-000000000026', 'CP', 'Global',    'cp-global@example.test', NULL, 'Soltero', 'Otro'),
  ('c1000000-0000-4000-8000-000000000031', 'c1000000-0000-4000-8000-000000000030', 'CP', 'PersonaA1', 'cp-pa1@example.test', '0424-555-1111', 'Soltero', 'Otro'),
  ('c1000000-0000-4000-8000-000000000033', NULL, 'CP', 'PersonaA2', NULL, '04125552222', 'Soltero', 'Otro'),
  ('c1000000-0000-4000-8000-000000000035', NULL, 'CP', 'PersonaA3', NULL, NULL, 'Soltero', 'Otro'),
  ('c1000000-0000-4000-8000-000000000037', NULL, 'CP', 'PersonaB1', NULL, '04145553333', 'Soltero', 'Otro');

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES
  ('c1000000-0000-4000-8000-000000000041', 'c1000000-0000-4000-8000-000000000031', 'c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000011', 'activo'),
  ('c1000000-0000-4000-8000-000000000042', 'c1000000-0000-4000-8000-000000000033', 'c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000011', 'activo'),
  ('c1000000-0000-4000-8000-000000000043', 'c1000000-0000-4000-8000-000000000035', 'c1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000012', 'activo'),
  ('c1000000-0000-4000-8000-000000000044', 'c1000000-0000-4000-8000-000000000037', 'c1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000013', 'activo');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('c1000000-0000-4000-8000-000000000021', 'dream_team.direct',     'dream_team', 'equipo',     'c1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000023', 'dream_team.direct',     'dream_team', 'equipo',     'c1000000-0000-4000-8000-000000000003'),
  ('c1000000-0000-4000-8000-000000000027', 'dream_team.org.manage', 'dream_team', 'experience', NULL);

-- ── director A: A's people (including the child node), with phone/account ──

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('c1000000-0000-4000-8000-000000000020');

SELECT pg_temp.assert_rows('director A asking for A and B gets exactly A (3 rows)',
  $$SELECT * FROM public.dream_team_contactos_personas(ARRAY[
      'c1000000-0000-4000-8000-000000000031','c1000000-0000-4000-8000-000000000033',
      'c1000000-0000-4000-8000-000000000035','c1000000-0000-4000-8000-000000000037']::uuid[])$$, 3);
SELECT pg_temp.assert_rows('director A: pA1 has phone normalized by the trigger and an account',
  $$SELECT * FROM public.dream_team_contactos_personas(ARRAY['c1000000-0000-4000-8000-000000000031']::uuid[])
     WHERE telefono = '04245551111' AND tiene_cuenta$$, 1);
SELECT pg_temp.assert_rows('director A: pA2 has phone and NO account',
  $$SELECT * FROM public.dream_team_contactos_personas(ARRAY['c1000000-0000-4000-8000-000000000033']::uuid[])
     WHERE telefono = '04125552222' AND NOT tiene_cuenta$$, 1);
SELECT pg_temp.assert_rows('director A: pA3 (child node) has no phone and no account',
  $$SELECT * FROM public.dream_team_contactos_personas(ARRAY['c1000000-0000-4000-8000-000000000035']::uuid[])
     WHERE telefono IS NULL AND NOT tiene_cuenta$$, 1);
SELECT pg_temp.assert_rows('director A does not get B''s person',
  $$SELECT * FROM public.dream_team_contactos_personas(ARRAY['c1000000-0000-4000-8000-000000000037']::uuid[])$$, 0);
RESET ROLE;

-- ── director B asking for A's ids gets nothing ──

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('c1000000-0000-4000-8000-000000000022');
SELECT pg_temp.assert_rows('director B asking for A''s ids gets 0 rows',
  $$SELECT * FROM public.dream_team_contactos_personas(ARRAY[
      'c1000000-0000-4000-8000-000000000031','c1000000-0000-4000-8000-000000000033',
      'c1000000-0000-4000-8000-000000000035']::uuid[])$$, 0);
SELECT pg_temp.assert_rows('director B gets B''s own person',
  $$SELECT * FROM public.dream_team_contactos_personas(ARRAY['c1000000-0000-4000-8000-000000000037']::uuid[])$$, 1);
RESET ROLE;

-- ── member without capability ──

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('c1000000-0000-4000-8000-000000000024');
SELECT pg_temp.assert_rows('member with no capability gets 0 rows',
  $$SELECT * FROM public.dream_team_contactos_personas(ARRAY[
      'c1000000-0000-4000-8000-000000000031','c1000000-0000-4000-8000-000000000033',
      'c1000000-0000-4000-8000-000000000035','c1000000-0000-4000-8000-000000000037']::uuid[])$$, 0);
RESET ROLE;

-- ── global org manager ──

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('c1000000-0000-4000-8000-000000000026');
SELECT pg_temp.assert_rows('global org manager gets all 4',
  $$SELECT * FROM public.dream_team_contactos_personas(ARRAY[
      'c1000000-0000-4000-8000-000000000031','c1000000-0000-4000-8000-000000000033',
      'c1000000-0000-4000-8000-000000000035','c1000000-0000-4000-8000-000000000037']::uuid[])$$, 4);
RESET ROLE;

-- ── shape and grants ──

SELECT pg_temp.assert_rows('shape: OUT columns are exactly id, telefono, tiene_cuenta (never auth_id)',
  $$SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.dream_team_contactos_personas(uuid[])'::regprocedure
       AND p.proargnames = ARRAY['p_persona_ids','id','telefono','tiene_cuenta']$$, 1);
SELECT pg_temp.assert_rows('structural: no anon in proacl',
  $$SELECT 1 FROM pg_proc p WHERE p.oid = 'public.dream_team_contactos_personas(uuid[])'::regprocedure
     AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: authenticated can execute',
  $$SELECT 1 FROM pg_proc p WHERE p.oid = 'public.dream_team_contactos_personas(uuid[])'::regprocedure
     AND p.proacl::text LIKE '%authenticated=X%'$$, 1);
SELECT pg_temp.assert_rows('structural: security definer with pinned search_path',
  $$SELECT 1 FROM pg_proc p WHERE p.oid = 'public.dream_team_contactos_personas(uuid[])'::regprocedure
     AND p.prosecdef AND p.proconfig::text LIKE '%search_path=public%'$$, 1);

SELECT pg_temp.report();

ROLLBACK;
