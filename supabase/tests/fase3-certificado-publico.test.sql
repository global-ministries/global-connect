-- Public certificate verification of migration 20261003170000: anon reads a
-- certificate only through verificar_certificado_publico(code), never by
-- listing taller_certificados.
--
-- Covers:
--   a. Listing hole. As anon (SET LOCAL ROLE anon, no JWT claims) a plain
--      SELECT count(*) FROM taller_certificados sees the fixture before the
--      migration block; after it the same SELECT fails with 42501 (anon holds
--      no privilege on the table any more). On a run after the apply the
--      probe before the block already expects 42501.
--   b. RPC, after the block: as anon the right code returns exactly one row,
--      the nine columns of NON_SENSITIVE_COLUMNS with the fixture's values
--      (nombre_pareja_snapshot included: it is a couple's certificate); a
--      wrong code, NULL and '' return no rows; the revoked fixture's code
--      returns no rows. As authenticated (claims of a real person) the right
--      code returns the same row.
--   c. Catalog after the block: the function is STABLE SECURITY DEFINER with
--      search_path=public and returns those nine columns; anon, authenticated
--      and service_role may execute it, PUBLIC may not; anon holds no table
--      or column privilege on taller_certificados; the policy
--      taller_certificados_select_anon applies to authenticated only; md5 of
--      the definition.
--
-- Fixture: two certificates written inside the transaction (one live couple
-- certificate, one revoked). Staging has no taller_ediciones nor
-- taller_inscripciones rows, so the three foreign keys of
-- taller_certificados are dropped first; that DDL, like the rows, is undone
-- by the final ROLLBACK. persona_id is a real usuarios row anyway.
--
-- The migration is copied byte for byte between the two marker comments below.
--
-- Run against STAGING inside BEGIN...ROLLBACK: nothing here is kept. The last
-- statement returns the failing cases (kind 'failure', none expected), then
-- the summary rows, because the MCP tool returns only the last
-- result-producing statement.

BEGIN;

CREATE TEMP TABLE t_cv_failures (case_name text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE t_cv_probe (case_name text PRIMARY KEY, val text) ON COMMIT DROP;
GRANT ALL ON t_cv_failures, t_cv_probe TO PUBLIC;

CREATE FUNCTION pg_temp.fail(p_case text, p_detail text) RETURNS void
LANGUAGE sql AS $$ INSERT INTO t_cv_failures VALUES (p_case, p_detail) $$;

-- Runs p_sql as p_role (anon: no claims; authenticated: claims of p_auth) and
-- returns its single text value, or 'ERR <sqlstate>'.
CREATE FUNCTION pg_temp.as_role(p_role text, p_auth uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims',
                     CASE WHEN p_auth IS NULL THEN '' ELSE json_build_object('sub', p_auth, 'role', p_role)::text END, true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_auth::text, ''), true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := 'ERR ' || SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.probe(p_case text, p_role text, p_auth uuid, p_sql text) RETURNS void
LANGUAGE sql AS $$ INSERT INTO t_cv_probe VALUES (p_case, pg_temp.as_role(p_role, p_auth, p_sql)) $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

ALTER TABLE public.taller_certificados
  DROP CONSTRAINT taller_certificados_inscripcion_id_fkey,
  DROP CONSTRAINT taller_certificados_taller_id_fkey;

CREATE TEMP TABLE t_cv_who ON COMMIT DROP AS
SELECT u.id AS uid, u.auth_id AS auth FROM public.usuarios u WHERE u.auth_id IS NOT NULL ORDER BY u.id LIMIT 1;
GRANT ALL ON t_cv_who TO PUBLIC;

INSERT INTO public.taller_certificados
  (id, inscripcion_id, codigo_verificacion, taller_id, persona_id, nombre_taller_snapshot,
   nombre_participante_snapshot, nombre_pareja_snapshot, fecha_completitud, firmantes_snapshot, pdf_storage_path)
SELECT '11111111-0000-4000-8000-000000000001'::uuid, gen_random_uuid(), 'abcdefghijkmnpqr',
       '22222222-0000-4000-8000-000000000002'::uuid, w.uid, 'Taller de prueba', 'Ana Prueba', 'Luis Prueba',
       '2026-05-01T00:00:00Z', '["Pastor Uno","Pastora Dos"]'::jsonb, 'secreto/ruta.pdf'
  FROM t_cv_who w;
INSERT INTO public.taller_certificados
  (id, inscripcion_id, codigo_verificacion, taller_id, persona_id, nombre_taller_snapshot,
   nombre_participante_snapshot, fecha_completitud, firmantes_snapshot, revocado_at, motivo_revocacion)
SELECT '11111111-0000-4000-8000-000000000003'::uuid, gen_random_uuid(), 'bcdefghijkmnpqrs',
       '22222222-0000-4000-8000-000000000002'::uuid, w.uid, 'Taller de prueba', 'Ana Prueba',
       '2026-05-01T00:00:00Z', '[]'::jsonb, now(), 'prueba'
  FROM t_cv_who w;

SELECT pg_temp.fail('setup', 'no usuarios row with an auth id') WHERE NOT EXISTS (SELECT 1 FROM t_cv_who);

-- a. before the block: anon lists the table (the hole, the RED).
SELECT pg_temp.probe('before anon list', 'anon', NULL, 'SELECT count(*)::text FROM public.taller_certificados');
-- On a run after the apply the hole is already closed: expect ERR 42501 there.
CREATE TEMP TABLE t_cv_applied ON COMMIT DROP AS
SELECT to_regprocedure('public.verificar_certificado_publico(text)') IS NOT NULL AS applied;
SELECT pg_temp.fail('a before anon list', format('expected %s, got %s',
         CASE WHEN a.applied THEN 'ERR 42501 (migration already live)' ELSE '1 visible row (the live fixture)' END,
         coalesce(p.val, 'NULL')))
  FROM t_cv_probe p, t_cv_applied a
 WHERE p.case_name = 'before anon list'
   AND p.val IS DISTINCT FROM CASE WHEN a.applied THEN 'ERR 42501' ELSE '1' END;

-- >>> BEGIN migration 20261003170000_certificado_publico_por_rpc.sql (byte-identical copy)
-- noqa: grant-to-anon-on-definer (anon executes verificar_certificado_publico on purpose; see below)
-- Public certificate verification through one RPC instead of an open table
-- (security phase 3, batch L4).
--
-- lib/platform/talleres/verificar-certificado.ts looked a certificate up with
-- a sessionless anon client: SELECT ... FROM taller_certificados WHERE
-- codigo_verificacion = <code>. That needed an anon grant on the table plus
-- the policy taller_certificados_select_anon (revocado_at IS NULL, for anon
-- and authenticated), so anybody holding the public anon key could drop the
-- filter and list every non-revoked certificate, persona_id and
-- pdf_storage_path included, not only the one whose code they hold.
--
-- verificar_certificado_publico(p_codigo) answers exactly the old question:
-- at most one row, the certificate whose codigo_verificacion equals p_codigo
-- and whose revocado_at is NULL, with the nine columns the app selected
-- (NON_SENSITIVE_COLUMNS, same names and types). A NULL or empty code returns
-- no rows. The code is compared as given; the app validates its format first
-- and never trimmed it. Anon may execute it ON PURPOSE: this is the public
-- verification page, reachable without signing in. Knowing a code is the
-- only way to read a certificate as anon now.
--
-- Then anon loses every privilege on taller_certificados (table and column
-- level), and the policy taller_certificados_select_anon is kept for
-- authenticated only: lib/platform/talleres/participante.ts embeds
-- taller_certificados (persona_id, fecha_completitud) under the person's own
-- inscriptions, and that read relies on this policy; there is no
-- own-certificate policy to fall back to. Narrowing what a signed-in person
-- can list is left for a later batch.
--
-- taller_certificados is created by 20260811130000, so it exists everywhere
-- this file runs; no to_regclass guard.

CREATE OR REPLACE FUNCTION public.verificar_certificado_publico(p_codigo text)
RETURNS TABLE (
  id uuid,
  codigo_verificacion text,
  taller_id uuid,
  persona_id uuid,
  nombre_taller_snapshot text,
  nombre_participante_snapshot text,
  nombre_pareja_snapshot text,
  fecha_completitud timestamptz,
  firmantes_snapshot jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.codigo_verificacion, c.taller_id, c.persona_id,
         c.nombre_taller_snapshot, c.nombre_participante_snapshot,
         c.nombre_pareja_snapshot, c.fecha_completitud, c.firmantes_snapshot
    FROM public.taller_certificados c
   WHERE p_codigo IS NOT NULL
     AND p_codigo <> ''
     AND c.codigo_verificacion = p_codigo
     AND c.revocado_at IS NULL
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.verificar_certificado_publico(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verificar_certificado_publico(text) TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.taller_certificados FROM anon;
REVOKE ALL (id, inscripcion_id, codigo_verificacion, taller_id, persona_id,
            nombre_taller_snapshot, nombre_participante_snapshot,
            fecha_completitud, firmantes_snapshot, pdf_storage_path,
            revocado_at, motivo_revocacion, version, created_at,
            nombre_pareja_snapshot)
  ON TABLE public.taller_certificados FROM anon;

ALTER POLICY taller_certificados_select_anon ON public.taller_certificados TO authenticated;
-- <<< END migration 20261003170000_certificado_publico_por_rpc.sql

-- a. after the block.
SELECT pg_temp.probe('after anon list', 'anon', NULL, 'SELECT count(*)::text FROM public.taller_certificados');
SELECT pg_temp.fail('a after anon list', 'expected ERR 42501, got ' || coalesce(val, 'NULL'))
  FROM t_cv_probe WHERE case_name = 'after anon list' AND val IS DISTINCT FROM 'ERR 42501';

-- b. RPC probes.
SELECT pg_temp.probe('rpc anon right', 'anon', NULL,
  $q$SELECT json_agg(r)::text FROM public.verificar_certificado_publico('abcdefghijkmnpqr') r$q$);
SELECT pg_temp.probe('rpc anon wrong', 'anon', NULL,
  $q$SELECT count(*)::text FROM public.verificar_certificado_publico('zzzzzzzzzzzzzzzz')$q$);
SELECT pg_temp.probe('rpc anon null', 'anon', NULL,
  $q$SELECT count(*)::text FROM public.verificar_certificado_publico(NULL)$q$);
SELECT pg_temp.probe('rpc anon empty', 'anon', NULL,
  $q$SELECT count(*)::text FROM public.verificar_certificado_publico('')$q$);
SELECT pg_temp.probe('rpc anon revoked', 'anon', NULL,
  $q$SELECT count(*)::text FROM public.verificar_certificado_publico('bcdefghijkmnpqrs')$q$);
SELECT pg_temp.probe('rpc authenticated right', 'authenticated', (SELECT auth FROM t_cv_who),
  $q$SELECT json_agg(r)::text FROM public.verificar_certificado_publico('abcdefghijkmnpqr') r$q$);

CREATE TEMP TABLE t_cv_expected ON COMMIT DROP AS
SELECT json_build_array(json_build_object(
  'id', '11111111-0000-4000-8000-000000000001', 'codigo_verificacion', 'abcdefghijkmnpqr',
  'taller_id', '22222222-0000-4000-8000-000000000002', 'persona_id', (SELECT uid FROM t_cv_who),
  'nombre_taller_snapshot', 'Taller de prueba', 'nombre_participante_snapshot', 'Ana Prueba',
  'nombre_pareja_snapshot', 'Luis Prueba', 'fecha_completitud', '2026-05-01T00:00:00+00:00',
  'firmantes_snapshot', json_build_array('Pastor Uno', 'Pastora Dos')))::jsonb AS v;

SELECT pg_temp.fail('b ' || p.case_name, 'got ' || coalesce(p.val, 'NULL'))
  FROM t_cv_probe p
 WHERE (p.case_name IN ('rpc anon right', 'rpc authenticated right')
        AND (p.val IS NULL OR p.val LIKE 'ERR%' OR p.val::jsonb IS DISTINCT FROM (SELECT v FROM t_cv_expected)))
    OR (p.case_name IN ('rpc anon wrong', 'rpc anon null', 'rpc anon empty', 'rpc anon revoked')
        AND p.val IS DISTINCT FROM '0');

-- c. Catalog.
CREATE TEMP TABLE t_cv_cat (k text PRIMARY KEY, got text, expected text) ON COMMIT DROP;
INSERT INTO t_cv_cat
SELECT 'attributes', format('%s %s definer=%s config=%s', (SELECT l.lanname FROM pg_language l WHERE l.oid = p.prolang), p.provolatile, p.prosecdef, p.proconfig),
       'sql s definer=t config={search_path=public}'
  FROM pg_proc p WHERE p.oid = to_regprocedure('public.verificar_certificado_publico(text)')
UNION ALL
SELECT 'result', pg_get_function_result('public.verificar_certificado_publico(text)'::regprocedure),
       'TABLE(id uuid, codigo_verificacion text, taller_id uuid, persona_id uuid, nombre_taller_snapshot text, nombre_participante_snapshot text, nombre_pareja_snapshot text, fecha_completitud timestamp with time zone, firmantes_snapshot jsonb)'
UNION ALL
SELECT 'execute', format('anon=%s authenticated=%s service_role=%s public=%s',
         has_function_privilege('anon', 'public.verificar_certificado_publico(text)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.verificar_certificado_publico(text)', 'EXECUTE'),
         has_function_privilege('service_role', 'public.verificar_certificado_publico(text)', 'EXECUTE'),
         EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                  WHERE p.oid = 'public.verificar_certificado_publico(text)'::regprocedure AND a.grantee = 0)),
       'anon=t authenticated=t service_role=t public=f'
UNION ALL
SELECT 'anon table privileges',
       (SELECT count(*)::text FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'taller_certificados' AND grantee = 'anon')
       || ' table, ' ||
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'taller_certificados' AND grantee = 'anon')
       || ' column, any via has_table_privilege '
       || (has_table_privilege('anon', 'public.taller_certificados', 'SELECT')
           OR has_table_privilege('anon', 'public.taller_certificados', 'INSERT')
           OR has_table_privilege('anon', 'public.taller_certificados', 'UPDATE')
           OR has_table_privilege('anon', 'public.taller_certificados', 'DELETE')
           OR has_any_column_privilege('anon', 'public.taller_certificados', 'SELECT'))::text,
       '0 table, 0 column, any via has_table_privilege false'
UNION ALL
SELECT 'policy roles', (SELECT roles::text FROM pg_policies WHERE schemaname = 'public'
                          AND tablename = 'taller_certificados' AND policyname = 'taller_certificados_select_anon'),
       '{authenticated}'
UNION ALL
SELECT 'policy qual', (SELECT qual FROM pg_policies WHERE schemaname = 'public'
                         AND tablename = 'taller_certificados' AND policyname = 'taller_certificados_select_anon'),
       '(revocado_at IS NULL)';

SELECT pg_temp.fail('c ' || k, format('got %s, expected %s', coalesce(got, 'NULL'), expected))
  FROM t_cv_cat WHERE got IS DISTINCT FROM expected;

SELECT kind, name, detail FROM (
        SELECT 0 AS ord, 'failure' AS kind, case_name AS name, detail FROM t_cv_failures
        UNION ALL
        SELECT 1, 'summary', 'compared',
               format('%s probes, %s catalog checks, %s failing cases; migration live before the block: %s',
                      (SELECT count(*) FROM t_cv_probe), (SELECT count(*) FROM t_cv_cat),
                      (SELECT count(*) FROM t_cv_failures),
                      (SELECT CASE WHEN applied THEN 'yes' ELSE 'no' END FROM t_cv_applied))
        UNION ALL
        SELECT 2, 'probe', case_name, left(val, 120) FROM t_cv_probe
        UNION ALL
        SELECT 3, 'summary', 'md5(pg_get_functiondef) after the block',
               'verificar_certificado_publico ' || md5(pg_get_functiondef('public.verificar_certificado_publico(text)'::regprocedure))) x
 ORDER BY ord, name, detail;

ROLLBACK;
