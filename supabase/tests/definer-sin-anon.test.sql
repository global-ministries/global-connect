-- T1 (odd/tasks/seguridad-definer-fase1-anon.md) - no definer function of the
-- public schema can be executed without a session, and nobody who had access
-- with a session loses it.
--
-- Covers:
--   a. No definer function (prosecdef, prokind = 'f') of public is executable by
--      anon and none keeps an ACL entry for PUBLIC. Checked twice: on the live
--      catalog as found (goes RED until the migration is applied) and again
--      after the migration block ran inside this transaction (guards the block
--      itself).
--   b. The set executable by authenticated and the set executable by
--      service_role are the same before and after the block (nobody gains or
--      loses anything but anon and PUBLIC).
--   c. Function bodies are untouched: md5 of every pg_get_functiondef is equal.
--   d. The block is idempotent: a second run leaves every proacl as it was.
--   e. Logged-out surface (role anon, no claims):
--        - select on configuracion_plataforma does not raise;
--        - the public certificate lookup of
--          app/api/public/verificar-certificado/[codigo] (same columns, same
--          filter) returns its row for a fixture certificate;
--        - calling a definer function raises 42501;
--        - select on grupos and on usuarios returns no rows (zero rows or 42501;
--          the before and after values are printed in the info column).
--   f. Logged-in behavior is unchanged for one admin and one director de etapa:
--      obtener_roles_usuario(own id), the RLS path (count of a two-group sample
--      of grupos: counting the whole table takes minutes on staging) and
--      tiene_rol_de_liderazgo(own id), which authenticated reaches through the
--      policies of grupos, give the same result before and after.
--   g. The allowlist and the grants of the block, on fixture functions: a listed
--      function keeps everything it had; an unlisted one (plain, overloaded, and
--      with a quoted name and an array argument) loses anon and PUBLIC; a
--      function that authenticated and service_role reached only through PUBLIC
--      keeps working for them through explicit grants; nobody gains an execute
--      it lacked; and an entry that matches no function raises.
--
-- Run against STAGING inside BEGIN...ROLLBACK - nothing here is kept. The
-- certificate fixture has codigo_verificacion 'ZZDSA0000000001A' and the
-- fixture functions are public.zz_dsa_* and public."ZZ dsa Weird". The MCP
-- connection is `postgres` (BYPASSRLS), so every logged-out or logged-in
-- probe runs under SET LOCAL ROLE with the claims set by pg_temp.probe(). The
-- last statement is a SELECT (failing_cases = 0 means all ok; detail lists the
-- failing cases; info prints the snapshot), because the MCP tool returns only
-- the last result-producing statement.
--
-- Run it before the migration is applied to see (a) and the anon call go RED,
-- and again after it is applied to see everything GREEN.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_dsa_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_dsa_info (k text, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dsa_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Runs a query that returns one scalar under a role and returns its text form,
-- or 'ERR <sqlstate>' when it raises. p_sub NULL means no claims (a visitor).
CREATE OR REPLACE FUNCTION pg_temp.probe(p_role text, p_sub uuid, p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_out text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true);
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN '' ELSE json_build_object('sub', p_sub, 'role', p_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql INTO v_out;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN coalesce(v_out, 'NULL');
  EXCEPTION
    WHEN OTHERS THEN
      RESET ROLE;
      PERFORM set_config('request.jwt.claim.sub', '', true);
      PERFORM set_config('request.jwt.claims', '', true);
      RETURN 'ERR ' || SQLSTATE;
  END;
END;
$$;

-- The set under test: every definer function (normal function) of public.
CREATE TEMP TABLE t_dsa_fn ON COMMIT DROP AS
SELECT p.oid, p.oid::regprocedure::text AS sig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f';

-- Who can execute what, per phase (s0 = as found, s1 = after the first run of
-- the block).
CREATE TEMP TABLE t_dsa_priv (
  phase text, sig text, anon boolean, auth boolean, svc boolean, public_acl boolean
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.take_priv(p_phase text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dsa_priv
  SELECT p_phase, f.sig,
         has_function_privilege('anon', f.oid, 'execute'),
         has_function_privilege('authenticated', f.oid, 'execute'),
         has_function_privilege('service_role', f.oid, 'execute'),
         EXISTS (SELECT 1
                   FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  WHERE p.oid = f.oid AND a.grantee = 0)
    FROM t_dsa_fn f;
$$;

CREATE OR REPLACE FUNCTION pg_temp.body_md5()
RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg(pg_get_functiondef(f.oid), '|' ORDER BY f.oid)) FROM t_dsa_fn f;
$$;

CREATE OR REPLACE FUNCTION pg_temp.acl_md5()
RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg(f.oid::text || coalesce(p.proacl::text, 'NULL'), '|' ORDER BY f.oid))
    FROM t_dsa_fn f JOIN pg_proc p ON p.oid = f.oid;
$$;

-- Fixtures (as postgres). ----------------------------------------------------
-- One certificate for the public lookup. Its parents (inscripcion, taller,
-- persona) are not needed to read it, so the foreign keys are skipped for this
-- insert only.
SET LOCAL session_replication_role = replica;
INSERT INTO public.taller_certificados
  (inscripcion_id, codigo_verificacion, taller_id, persona_id, nombre_taller_snapshot, nombre_participante_snapshot)
VALUES
  (gen_random_uuid(), 'ZZDSA0000000001A', gen_random_uuid(), gen_random_uuid(), 'ZZ dsa taller', 'ZZ dsa persona');
SET LOCAL session_replication_role = origin;

-- One real admin and one real director de etapa (with an account and a linked
-- group).
CREATE TEMP TABLE t_dsa_ids (who text, auth_id uuid) ON COMMIT DROP;
INSERT INTO t_dsa_ids
SELECT 'admin', (SELECT u.auth_id
                   FROM public.usuarios u
                   JOIN public.usuario_roles ur ON ur.usuario_id = u.id
                   JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                  WHERE rs.nombre_interno = 'admin' AND u.auth_id IS NOT NULL
                  ORDER BY u.id LIMIT 1)
UNION ALL
SELECT 'director_etapa', (SELECT u.auth_id
                            FROM public.usuarios u
                            JOIN public.usuario_roles ur ON ur.usuario_id = u.id
                            JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                           WHERE rs.nombre_interno = 'director-etapa' AND u.auth_id IS NOT NULL
                             AND EXISTS (SELECT 1
                                           FROM public.segmento_lideres sl
                                           JOIN public.director_etapa_grupos deg ON deg.director_etapa_id = sl.id
                                          WHERE sl.usuario_id = u.id)
                           ORDER BY u.id LIMIT 1);

-- The RLS policies of grupos are slow on staging (about a second per group
-- row), so the RLS-path probe counts a fixed sample instead of the whole table:
-- the lowest group id and one group of that director de etapa.
CREATE TEMP TABLE t_dsa_sample ON COMMIT DROP AS
SELECT ARRAY(
  SELECT x.id FROM (
    (SELECT g.id FROM public.grupos g ORDER BY g.id LIMIT 1)
    UNION
    (SELECT deg.grupo_id
       FROM public.director_etapa_grupos deg
       JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
      WHERE sl.usuario_id = (SELECT u.id FROM public.usuarios u WHERE u.auth_id = (SELECT auth_id FROM t_dsa_ids WHERE who = 'director_etapa'))
      ORDER BY deg.grupo_id LIMIT 1)
  ) x ORDER BY x.id) AS ids;

-- Probes: what a visitor and two logged-in people get, per phase. ---------------
CREATE TEMP TABLE t_dsa_probe (phase text, name text, val text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.take_probes(p_phase text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  INSERT INTO t_dsa_probe VALUES
    (p_phase, 'anon: select configuracion_plataforma',
      pg_temp.probe('anon', NULL, 'SELECT count(*)::text FROM public.configuracion_plataforma')),
    (p_phase, 'anon: certificate lookup',
      pg_temp.probe('anon', NULL, $q$SELECT count(*)::text FROM (
        SELECT id, codigo_verificacion, taller_id, persona_id, nombre_taller_snapshot,
               nombre_participante_snapshot, fecha_completitud, firmantes_snapshot
          FROM public.taller_certificados
         WHERE codigo_verificacion = 'ZZDSA0000000001A') s$q$)),
    (p_phase, 'anon: call obtener_roles_usuario',
      pg_temp.probe('anon', NULL, $q$SELECT public.obtener_roles_usuario('00000000-0000-0000-0000-000000000000')::text$q$)),
    (p_phase, 'anon: select grupos',
      pg_temp.probe('anon', NULL, 'SELECT count(*)::text FROM public.grupos')),
    (p_phase, 'anon: select usuarios',
      pg_temp.probe('anon', NULL, 'SELECT count(*)::text FROM public.usuarios'));

  FOR r IN SELECT who, auth_id FROM t_dsa_ids WHERE auth_id IS NOT NULL ORDER BY who LOOP
    INSERT INTO t_dsa_probe VALUES
      (p_phase, r.who || ': obtener_roles_usuario(own id)',
        pg_temp.probe('authenticated', r.auth_id,
          format('SELECT coalesce((SELECT array_agg(x ORDER BY x) FROM unnest(public.obtener_roles_usuario(%L)) x)::text, ''NULL'')', r.auth_id))),
      (p_phase, r.who || ': count of the grupos sample (RLS path)',
        pg_temp.probe('authenticated', r.auth_id,
          format('SELECT count(*)::text FROM public.grupos WHERE id = ANY (%L::uuid[])', (SELECT ids FROM t_dsa_sample)))),
      (p_phase, r.who || ': tiene_rol_de_liderazgo(own id)',
        pg_temp.probe('authenticated', r.auth_id, format('SELECT public.tiene_rol_de_liderazgo(%L)::text', r.auth_id)));
  END LOOP;
END;
$$;

-- The migration block as a function, so the suite can run it more than once.
-- Keep the text between the two markers identical to the body of the DO block
-- in supabase/migrations/20261001200000_definer_sin_anon.sql.
CREATE OR REPLACE FUNCTION pg_temp.run_definer_sin_anon()
RETURNS void LANGUAGE plpgsql AS $definer_sin_anon$
-- >>> block start
DECLARE
  -- Signatures (as regprocedure text, e.g. 'public.some_function(uuid)') of
  -- definer functions that must stay callable without a session. Empty today:
  -- the application calls no definer function as a visitor. An entry that
  -- matches no function raises, so a typo cannot go unnoticed.
  c_allowlist constant text[] := ARRAY[]::text[];

  v_allow       oid[];
  v_unmatched   text;
  v_targets     oid[];
  v_auth        oid[];
  v_service     oid[];
  v_anon_before integer;
  v_oid         oid;
  v_bad         text;
BEGIN
  SELECT array_agg(to_regprocedure(a)::oid) FILTER (WHERE to_regprocedure(a) IS NOT NULL),
         string_agg(a, ', ') FILTER (WHERE to_regprocedure(a) IS NULL)
    INTO v_allow, v_unmatched
    FROM unnest(c_allowlist) AS a;
  IF v_unmatched IS NOT NULL THEN
    RAISE EXCEPTION 'definer_sin_anon: allowlist entries match no function: %', v_unmatched;
  END IF;
  v_allow := coalesce(v_allow, '{}'::oid[]);

  -- What each role can execute BEFORE anything is revoked.
  SELECT coalesce(array_agg(p.oid), '{}'::oid[]),
         coalesce(array_agg(p.oid) FILTER (WHERE has_function_privilege('authenticated', p.oid, 'execute')), '{}'::oid[]),
         coalesce(array_agg(p.oid) FILTER (WHERE has_function_privilege('service_role', p.oid, 'execute')), '{}'::oid[]),
         count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'execute'))
    INTO v_targets, v_auth, v_service, v_anon_before
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND p.prokind = 'f'
     AND NOT (p.oid = ANY (v_allow));

  FOREACH v_oid IN ARRAY v_targets LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_oid::regprocedure);
    IF v_oid = ANY (v_auth) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_oid::regprocedure);
    END IF;
    IF v_oid = ANY (v_service) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_oid::regprocedure);
    END IF;
  END LOOP;

  -- Postcondition 1: no target is executable by anon any more.
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO v_bad
    FROM pg_proc p
   WHERE p.oid = ANY (v_targets)
     AND has_function_privilege('anon', p.oid, 'execute');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'definer_sin_anon: still executable by anon: %', v_bad;
  END IF;

  -- Postcondition 2: authenticated and service_role keep what they had.
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO v_bad
    FROM pg_proc p
   WHERE (p.oid = ANY (v_auth) AND NOT has_function_privilege('authenticated', p.oid, 'execute'))
      OR (p.oid = ANY (v_service) AND NOT has_function_privilege('service_role', p.oid, 'execute'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'definer_sin_anon: lost an execute it had: %', v_bad;
  END IF;

  RAISE NOTICE 'definer_sin_anon: % definer functions targeted, % were executable by anon before',
    cardinality(v_targets), v_anon_before;
END
-- <<< block end
$definer_sin_anon$;

-- Since 20261003110000 new postgres functions carry no PUBLIC EXECUTE, and these helpers run under SET LOCAL ROLE.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- Phase s0: the live catalog as found. -----------------------------------------
SELECT pg_temp.take_priv('s0');
SELECT pg_temp.take_probes('s0');
CREATE TEMP TABLE t_dsa_digest (k text, v text) ON COMMIT DROP;
INSERT INTO t_dsa_digest VALUES ('body_md5_s0', pg_temp.body_md5()), ('acl_md5_s0', pg_temp.acl_md5());

SELECT pg_temp.assert_eq('a: live catalog - no definer function is executable by anon',
  $q$SELECT count(*)::text FROM t_dsa_fn f WHERE has_function_privilege('anon', f.oid, 'execute')$q$, '0');
SELECT pg_temp.assert_eq('a: live catalog - no definer function has a PUBLIC ACL entry',
  $q$SELECT count(*)::text FROM t_dsa_fn f JOIN pg_proc p ON p.oid = f.oid,
            aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE a.grantee = 0$q$, '0');
SELECT pg_temp.assert_eq('e: live catalog - a visitor calling a definer function gets 42501',
  $q$SELECT val FROM t_dsa_probe WHERE phase = 's0' AND name = 'anon: call obtener_roles_usuario'$q$, 'ERR 42501');

-- Phase s1: after the first run of the block. ----------------------------------
SELECT pg_temp.run_definer_sin_anon();
SELECT pg_temp.take_priv('s1');
SELECT pg_temp.take_probes('s1');
INSERT INTO t_dsa_digest VALUES ('body_md5_s1', pg_temp.body_md5()), ('acl_md5_s1', pg_temp.acl_md5());

SELECT pg_temp.assert_eq('a: after the block - no definer function is executable by anon',
  $q$SELECT count(*)::text FROM t_dsa_fn f WHERE has_function_privilege('anon', f.oid, 'execute')$q$, '0');
SELECT pg_temp.assert_eq('a: after the block - no definer function has a PUBLIC ACL entry',
  $q$SELECT count(*)::text FROM t_dsa_fn f JOIN pg_proc p ON p.oid = f.oid,
            aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE a.grantee = 0$q$, '0');

SELECT pg_temp.assert_eq('b: the set executable by authenticated is the same before and after',
  $q$SELECT count(*)::text FROM t_dsa_priv a JOIN t_dsa_priv b ON b.sig = a.sig AND b.phase = 's1'
      WHERE a.phase = 's0' AND a.auth IS DISTINCT FROM b.auth$q$, '0');
SELECT pg_temp.assert_eq('b: the set executable by service_role is the same before and after',
  $q$SELECT count(*)::text FROM t_dsa_priv a JOIN t_dsa_priv b ON b.sig = a.sig AND b.phase = 's1'
      WHERE a.phase = 's0' AND a.svc IS DISTINCT FROM b.svc$q$, '0');
SELECT pg_temp.assert_eq('b: the same functions are measured before and after',
  $q$SELECT ((SELECT count(*) FROM t_dsa_priv WHERE phase = 's0') = (SELECT count(*) FROM t_dsa_priv WHERE phase = 's1')
         AND (SELECT count(*) FROM t_dsa_priv WHERE phase = 's0') = (SELECT count(*) FROM t_dsa_fn))::text$q$, 'true');
SELECT pg_temp.assert_eq('c: no function body, attribute or search_path changed',
  $q$SELECT ((SELECT v FROM t_dsa_digest WHERE k = 'body_md5_s0') = (SELECT v FROM t_dsa_digest WHERE k = 'body_md5_s1'))::text$q$, 'true');
SELECT pg_temp.assert_eq('c: the number of definer functions did not change',
  $q$SELECT ((SELECT count(*) FROM t_dsa_fn) = (SELECT count(*)
                FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'))::text$q$, 'true');

-- Phase s2: a second run changes nothing. ---------------------------------------
SELECT pg_temp.run_definer_sin_anon();
INSERT INTO t_dsa_digest VALUES ('acl_md5_s2', pg_temp.acl_md5());
SELECT pg_temp.assert_eq('d: running the block twice leaves every proacl unchanged',
  $q$SELECT ((SELECT v FROM t_dsa_digest WHERE k = 'acl_md5_s1') = (SELECT v FROM t_dsa_digest WHERE k = 'acl_md5_s2'))::text$q$, 'true');

-- Logged-out surface. -------------------------------------------------------------
SELECT pg_temp.assert_eq('e: select on configuracion_plataforma does not raise (before)',
  $q$SELECT (val NOT LIKE 'ERR%')::text FROM t_dsa_probe WHERE phase = 's0' AND name = 'anon: select configuracion_plataforma'$q$, 'true');
SELECT pg_temp.assert_eq('e: select on configuracion_plataforma does not raise (after)',
  $q$SELECT (val NOT LIKE 'ERR%')::text FROM t_dsa_probe WHERE phase = 's1' AND name = 'anon: select configuracion_plataforma'$q$, 'true');
SELECT pg_temp.assert_eq('e: select on configuracion_plataforma returns the same rows before and after',
  $q$SELECT ((SELECT val FROM t_dsa_probe WHERE phase = 's0' AND name = 'anon: select configuracion_plataforma')
         = (SELECT val FROM t_dsa_probe WHERE phase = 's1' AND name = 'anon: select configuracion_plataforma'))::text$q$, 'true');
SELECT pg_temp.assert_eq('e: the public certificate lookup returns the fixture row (before)',
  $q$SELECT val FROM t_dsa_probe WHERE phase = 's0' AND name = 'anon: certificate lookup'$q$, '1');
SELECT pg_temp.assert_eq('e: the public certificate lookup returns the fixture row (after)',
  $q$SELECT val FROM t_dsa_probe WHERE phase = 's1' AND name = 'anon: certificate lookup'$q$, '1');
SELECT pg_temp.assert_eq('e: after the block a visitor calling a definer function gets 42501',
  $q$SELECT val FROM t_dsa_probe WHERE phase = 's1' AND name = 'anon: call obtener_roles_usuario'$q$, 'ERR 42501');
SELECT pg_temp.assert_eq('e: a visitor reads no grupos rows (before)',
  $q$SELECT (val IN ('0', 'ERR 42501'))::text FROM t_dsa_probe WHERE phase = 's0' AND name = 'anon: select grupos'$q$, 'true');
SELECT pg_temp.assert_eq('e: a visitor reads no grupos rows (after)',
  $q$SELECT (val IN ('0', 'ERR 42501'))::text FROM t_dsa_probe WHERE phase = 's1' AND name = 'anon: select grupos'$q$, 'true');
SELECT pg_temp.assert_eq('e: a visitor reads no usuarios rows (before)',
  $q$SELECT (val IN ('0', 'ERR 42501'))::text FROM t_dsa_probe WHERE phase = 's0' AND name = 'anon: select usuarios'$q$, 'true');
SELECT pg_temp.assert_eq('e: a visitor reads no usuarios rows (after)',
  $q$SELECT (val IN ('0', 'ERR 42501'))::text FROM t_dsa_probe WHERE phase = 's1' AND name = 'anon: select usuarios'$q$, 'true');

-- Logged-in behavior. ---------------------------------------------------------------
SELECT pg_temp.assert_eq('f: staging has an admin with an account',
  $q$SELECT (auth_id IS NOT NULL)::text FROM t_dsa_ids WHERE who = 'admin'$q$, 'true');
SELECT pg_temp.assert_eq('f: staging has a director de etapa with an account',
  $q$SELECT (auth_id IS NOT NULL)::text FROM t_dsa_ids WHERE who = 'director_etapa'$q$, 'true');
SELECT pg_temp.assert_eq('f: the grupos sample holds two groups (the lowest id and one of the director de etapa)',
  $q$SELECT coalesce(array_length(ids, 1), 0)::text FROM t_dsa_sample$q$, '2');
SELECT pg_temp.assert_eq('f: every logged-in probe gives the same answer before and after',
  $q$SELECT count(*)::text FROM t_dsa_probe a JOIN t_dsa_probe b ON b.name = a.name AND b.phase = 's1'
      WHERE a.phase = 's0' AND a.name NOT LIKE 'anon:%' AND a.val IS DISTINCT FROM b.val$q$, '0');
SELECT pg_temp.assert_eq('f: no logged-in probe raises after the block (6 probes ran)',
  $q$SELECT (count(*) FILTER (WHERE val LIKE 'ERR%') = 0 AND count(*) = 6)::text
       FROM t_dsa_probe WHERE phase = 's1' AND name NOT LIKE 'anon:%'$q$, 'true');
SELECT pg_temp.assert_eq('f: the admin and the director de etapa still read their roles',
  $q$SELECT (count(*) = 2 AND bool_and(val LIKE '{%'))::text FROM t_dsa_probe
      WHERE phase = 's1' AND name LIKE '%: obtener_roles_usuario(own id)'$q$, 'true');
SELECT pg_temp.assert_eq('f: tiene_rol_de_liderazgo still answers true for both (reached through policies)',
  $q$SELECT (count(*) = 2 AND bool_and(val = 'true'))::text FROM t_dsa_probe
      WHERE phase = 's1' AND name LIKE '%: tiene_rol_de_liderazgo(own id)'$q$, 'true');

-- The allowlist of the block (fixtures, rolled back with everything else). ----------
CREATE FUNCTION public.zz_dsa_keep() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT 1 $$;
CREATE FUNCTION public.zz_dsa_drop() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT 1 $$;
CREATE FUNCTION public.zz_dsa_drop(p_x integer) RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT 1 $$;
CREATE FUNCTION public."ZZ dsa Weird"(p_x integer[]) RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT 1 $$;
CREATE FUNCTION public.zz_dsa_public_only() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT 1 $$;

GRANT EXECUTE ON FUNCTION public.zz_dsa_keep() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zz_dsa_drop() TO PUBLIC, anon, authenticated, service_role;
-- An overload that service_role never could execute.
GRANT EXECUTE ON FUNCTION public.zz_dsa_drop(integer) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.zz_dsa_drop(integer) FROM PUBLIC, service_role;
GRANT EXECUTE ON FUNCTION public."ZZ dsa Weird"(integer[]) TO PUBLIC, anon, authenticated, service_role;
-- authenticated and service_role reach this one only through PUBLIC.
REVOKE EXECUTE ON FUNCTION public.zz_dsa_public_only() FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zz_dsa_public_only() TO PUBLIC;

SELECT pg_temp.assert_eq('g: fixtures start as designed',
  $q$SELECT (has_function_privilege('authenticated', 'public.zz_dsa_public_only()', 'execute')
         AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                          WHERE p.oid = 'public.zz_dsa_public_only()'::regprocedure
                            AND a.grantee IN ('authenticated'::regrole::oid, 'service_role'::regrole::oid))
         AND NOT has_function_privilege('service_role', 'public.zz_dsa_drop(integer)', 'execute'))::text$q$, 'true');

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('pg_temp.run_definer_sin_anon()'::regprocedure);
  v_def := replace(v_def, 'pg_temp.run_definer_sin_anon()', 'pg_temp.run_definer_sin_anon_allow()');
  v_def := replace(v_def, 'ARRAY[]::text[]', 'ARRAY[''public.zz_dsa_keep()'']::text[]');
  EXECUTE v_def;
  PERFORM pg_temp.run_definer_sin_anon_allow();
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('g: the block with an allowlist runs', SQLSTATE || ' ' || SQLERRM);
END
$$;

SELECT pg_temp.assert_eq('g: an allowlisted function keeps anon and PUBLIC',
  $q$SELECT (has_function_privilege('anon', 'public.zz_dsa_keep()', 'execute')
         AND EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                      WHERE p.oid = 'public.zz_dsa_keep()'::regprocedure AND a.grantee = 0))::text$q$, 'true');
SELECT pg_temp.assert_eq('g: an unlisted function loses anon and PUBLIC',
  $q$SELECT (NOT has_function_privilege('anon', 'public.zz_dsa_drop()', 'execute')
         AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                          WHERE p.oid = 'public.zz_dsa_drop()'::regprocedure AND a.grantee = 0))::text$q$, 'true');
SELECT pg_temp.assert_eq('g: an overload of an unlisted function loses anon too',
  $q$SELECT (NOT has_function_privilege('anon', 'public.zz_dsa_drop(integer)', 'execute'))::text$q$, 'true');
SELECT pg_temp.assert_eq('g: a quoted name with an array argument is handled',
  $q$SELECT (NOT has_function_privilege('anon', 'public."ZZ dsa Weird"(integer[])', 'execute')
         AND has_function_privilege('authenticated', 'public."ZZ dsa Weird"(integer[])', 'execute')
         AND has_function_privilege('service_role', 'public."ZZ dsa Weird"(integer[])', 'execute'))::text$q$, 'true');
SELECT pg_temp.assert_eq('g: authenticated keeps what it had on the unlisted functions',
  $q$SELECT (has_function_privilege('authenticated', 'public.zz_dsa_drop()', 'execute')
         AND has_function_privilege('authenticated', 'public.zz_dsa_drop(integer)', 'execute'))::text$q$, 'true');
SELECT pg_temp.assert_eq('g: service_role keeps what it had, and does not gain what it lacked',
  $q$SELECT (has_function_privilege('service_role', 'public.zz_dsa_drop()', 'execute')
         AND NOT has_function_privilege('service_role', 'public.zz_dsa_drop(integer)', 'execute'))::text$q$, 'true');
SELECT pg_temp.assert_eq('g: a function reached only through PUBLIC keeps working through explicit grants',
  $q$SELECT (NOT has_function_privilege('anon', 'public.zz_dsa_public_only()', 'execute')
         AND has_function_privilege('authenticated', 'public.zz_dsa_public_only()', 'execute')
         AND has_function_privilege('service_role', 'public.zz_dsa_public_only()', 'execute')
         AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                          WHERE p.oid = 'public.zz_dsa_public_only()'::regprocedure AND a.grantee = 0)
         AND (SELECT count(*) FROM pg_proc p, aclexplode(p.proacl) a
               WHERE p.oid = 'public.zz_dsa_public_only()'::regprocedure
                 AND a.grantee IN ('authenticated'::regrole::oid, 'service_role'::regrole::oid)) = 2)::text$q$, 'true');

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('pg_temp.run_definer_sin_anon()'::regprocedure);
  v_def := replace(v_def, 'pg_temp.run_definer_sin_anon()', 'pg_temp.run_definer_sin_anon_typo()');
  v_def := replace(v_def, 'ARRAY[]::text[]', 'ARRAY[''public.zz_dsa_no_such_function()'']::text[]');
  EXECUTE v_def;
  BEGIN
    PERFORM pg_temp.run_definer_sin_anon_typo();
    PERFORM pg_temp.fail('g: an allowlist entry that matches no function raises', 'it ran without raising');
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- expected
  END;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('g: the typo variant is built', SQLSTATE || ' ' || SQLERRM);
END
$$;

-- Snapshot printed with the result. ----------------------------------------------------
INSERT INTO t_dsa_info
SELECT 'counts ' || phase,
       format('definer=%s anon=%s authenticated=%s service_role=%s public_acl=%s',
              count(*), count(*) FILTER (WHERE anon), count(*) FILTER (WHERE auth),
              count(*) FILTER (WHERE svc), count(*) FILTER (WHERE public_acl))
  FROM t_dsa_priv GROUP BY phase;
INSERT INTO t_dsa_info
SELECT 'lost anon (' || count(*) || ')', coalesce(string_agg(a.sig, ', ' ORDER BY a.sig), '')
  FROM t_dsa_priv a JOIN t_dsa_priv b ON b.sig = a.sig AND b.phase = 's1'
 WHERE a.phase = 's0' AND a.anon AND NOT b.anon;
INSERT INTO t_dsa_info
SELECT 'authenticated/service_role changed (' || count(*) || ')', coalesce(string_agg(a.sig, ', ' ORDER BY a.sig), 'none')
  FROM t_dsa_priv a JOIN t_dsa_priv b ON b.sig = a.sig AND b.phase = 's1'
 WHERE a.phase = 's0' AND (a.auth IS DISTINCT FROM b.auth OR a.svc IS DISTINCT FROM b.svc);
INSERT INTO t_dsa_info
SELECT 'probe ' || name, string_agg(phase || '=' || val, ' -> ' ORDER BY phase)
  FROM t_dsa_probe GROUP BY name;
INSERT INTO t_dsa_info
SELECT 'digest ' || k, v FROM t_dsa_digest;

SELECT (SELECT count(*) FROM t_dsa_failures) AS failing_cases,
       coalesce((SELECT string_agg(case_name, E'\n') FROM t_dsa_failures), 'all cases ok') AS detail,
       (SELECT string_agg(k || ': ' || v, E'\n' ORDER BY k) FROM t_dsa_info) AS info;

ROLLBACK;
