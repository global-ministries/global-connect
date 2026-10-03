-- L0 + L1 (odd/tasks/seguridad-definer-fase3.md) - two tables closed, four
-- definer functions taken away from signed-in callers, and the default
-- privileges that made every new function, table and sequence of public
-- reachable by anon.
--
-- Covers:
--   a. Catalog, as found and after the two migration blocks below:
--        - pastoral_role_capability_map, debug_toolbar_whitelist and the sibling
--          talleres_role_capability_map (already closed, must stay so):
--          relrowsecurity, has_table_privilege of anon and authenticated for
--          SELECT, INSERT, UPDATE, DELETE and TRUNCATE, and the policies (name,
--          command, roles, qual);
--        - eliminar_relacion_familiar(uuid), taller_emit_overdue_event(uuid,
--          date), cohort_belongs_to_talleres_experience(uuid) and
--          expirar_solicitudes_vencidas(): has_function_privilege of anon,
--          authenticated and service_role, and an ACL entry for PUBLIC; plus
--          es_admin_o_pastor(uuid), which the new policy calls (authenticated
--          must keep it);
--        - pg_default_acl of postgres: the exact ACL of its rows for functions,
--          tables and sequences in public and of its global row for functions;
--          the row of supabase_admin for functions in public stays as it is
--          (postgres cannot change it);
--        - the only readers of the two tables are the expected definer
--          functions owned by postgres, and no view or policy uses them.
--      As found, every value of a batch must be either the open state (staging
--      before the apply) or the closed state (after it), the same state for the
--      whole batch; the info column says which. After the blocks every value
--      must be the closed state.
--   b. Behaviour with simulated sessions (SET LOCAL ROLE plus both claim
--      formats), before and after the blocks, every probe in a subtransaction
--      that is rolled back:
--        - debug_toolbar_whitelist: anon is refused (42501) after; a leader sees
--          0 rows after; the admin sees its own row and every row before and
--          after; nobody but the owner can add a row;
--        - puede_ver_debug_toolbar(own id) answers the same before and after for
--          the admin (true) and the leader (false);
--        - pastoral_role_capability_map: anon and the leader are refused after
--          (read, insert, delete); the definer path
--          assign_pastoral_capabilities_for_role, run for a random persona id,
--          inserts as many grants before and after (it still reads the map);
--        - after only: the leader calling each of the four functions, and anon
--          calling expirar_solicitudes_vencidas(), get 42501 (the privilege
--          check fails before any body runs); service_role still calls them;
--        - objects postgres creates inside this transaction: a function, a table
--          and a sequence in public created after the blocks give nothing to
--          anon or PUBLIC and keep authenticated and service_role; the same
--          objects created before the blocks match the state found; a pg_temp
--          function created after the blocks is executable only by postgres
--          (the documented side effect of the global default). Every probe
--          object is dropped before the end.
--
-- Both migrations are copied byte for byte between the marker comments below.
--
-- Run against STAGING inside BEGIN...ROLLBACK: nothing here is kept. The MCP
-- connection is postgres (BYPASSRLS), so every probe switches role. The pg_temp
-- helpers of this file are only ever called as postgres: once the global
-- default of 20261003110000 is in place they are born executable by postgres
-- alone. The probed people are real staging users: an admin who is in the
-- debug toolbar whitelist and a leader who is not. The last statement is a
-- SELECT (failing_cases = 0 means all ok; detail lists the failing cases; info
-- prints the state found and the values), because the MCP tool returns only the
-- last result-producing statement.
--
-- Run it before the migrations are applied (state found: open) and after
-- (state found: closed); both runs must end with failing_cases = 0.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_f3_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_f3_info (k text, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_f3_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- People and counts ------------------------------------------------------------

CREATE TEMP TABLE t_f3_who ON COMMIT DROP AS
SELECT 'admin'::text AS who, u.auth_id AS auth, u.id AS uid
  FROM public.usuarios u WHERE '5df3b990-af3d-49b5-a061-025bc3598983'::uuid = u.auth_id
UNION ALL
SELECT 'leader', u.auth_id, u.id
  FROM public.usuarios u WHERE '2efa6e21-bbf0-4fb3-a8fa-96e16b3e881d'::uuid = u.auth_id;

INSERT INTO t_f3_failures
SELECT 'setup: person ' || w.who || ' not found'
  FROM (VALUES ('admin'), ('leader')) w(who)
 WHERE NOT EXISTS (SELECT 1 FROM t_f3_who x WHERE x.who = w.who);

INSERT INTO t_f3_failures
SELECT 'setup: the admin must be in debug_toolbar_whitelist and the leader must not'
 WHERE NOT EXISTS (SELECT 1 FROM public.debug_toolbar_whitelist d JOIN t_f3_who a ON a.uid = d.usuario_id AND a.who = 'admin')
    OR EXISTS (SELECT 1 FROM public.debug_toolbar_whitelist d JOIN t_f3_who l ON l.uid = d.usuario_id AND l.who = 'leader');

CREATE TEMP TABLE t_f3_counts ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.debug_toolbar_whitelist)::text AS whitelist_rows,
       (SELECT count(*) FROM public.pastoral_role_capability_map)::text AS map_rows,
       (SELECT count(*) FROM public.pastoral_role_capability_map WHERE rol = 'lider')::text AS map_lider_rows;

-- a. Who reads the two tables --------------------------------------------------
-- Closing them is safe because their only readers are definer functions owned by
-- postgres (BYPASSRLS, and the owner of both tables) and no view or policy uses
-- them. Temp schemas are skipped: this file's own helpers name the tables.

INSERT INTO t_f3_failures
SELECT format('a readers of %s: expected %s, got %s', t.tbl, t.expected, r.found)
  FROM (VALUES
          ('pastoral_role_capability_map',
           'assign_pastoral_capabilities_for_role(uuid,text) definer postgres, sync_pastoral_grants_on_role_change() definer postgres'),
          ('debug_toolbar_whitelist',
           'puede_ver_debug_toolbar(uuid) definer postgres')) t(tbl, expected),
       LATERAL (
         SELECT coalesce(string_agg(format('%s %s %s', p.oid::regprocedure,
                                           CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END,
                                           p.proowner::regrole),
                                    ', ' ORDER BY p.oid::regprocedure::text), 'nothing') AS found
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.prosrc ~ ('\m' || t.tbl || '\M') AND n.nspname NOT LIKE 'pg_temp%'
       ) r
 WHERE r.found IS DISTINCT FROM t.expected;

INSERT INTO t_f3_failures
SELECT 'a a view or a policy uses ' || c.relname
  FROM pg_class c
 WHERE c.oid IN ('public.pastoral_role_capability_map'::regclass, 'public.debug_toolbar_whitelist'::regclass)
   AND (EXISTS (SELECT 1 FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid
                 WHERE d.classid = 'pg_rewrite'::regclass AND d.refobjid = c.oid AND rw.ev_class <> c.oid)
        OR EXISTS (SELECT 1 FROM pg_policies pp
                    WHERE coalesce(pp.qual, '') || ' ' || coalesce(pp.with_check, '') ~ ('\m' || c.relname || '\M')));

-- a. Catalog snapshot ----------------------------------------------------------

-- Privileges of a role on a table, as one comparable string. (Booleans are cast
-- to text on purpose: format('%s', boolean) prints t / f.)
CREATE OR REPLACE FUNCTION pg_temp.tbl_privs(p_role text, p_tbl regclass)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('select=%s insert=%s update=%s delete=%s truncate=%s',
                has_table_privilege(p_role, p_tbl, 'SELECT')::text, has_table_privilege(p_role, p_tbl, 'INSERT')::text,
                has_table_privilege(p_role, p_tbl, 'UPDATE')::text, has_table_privilege(p_role, p_tbl, 'DELETE')::text,
                has_table_privilege(p_role, p_tbl, 'TRUNCATE')::text);
$$;

-- Who can execute a function. public = the ACL has an entry for PUBLIC (a NULL
-- ACL is the built-in default, which has one).
CREATE OR REPLACE FUNCTION pg_temp.fn_privs(p_fn regprocedure)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('anon=%s authenticated=%s service_role=%s public=%s',
                has_function_privilege('anon', p_fn, 'EXECUTE')::text,
                has_function_privilege('authenticated', p_fn, 'EXECUTE')::text,
                has_function_privilege('service_role', p_fn, 'EXECUTE')::text,
                EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                         WHERE p.oid = p_fn AND a.grantee = 0::oid)::text);
$$;

-- The policies of a table: name, command, roles and qual.
CREATE OR REPLACE FUNCTION pg_temp.policies(p_tbl regclass)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(format('%s %s %s %s', pol.polname, pol.polcmd,
                                    (SELECT string_agg(CASE WHEN r = 0::oid THEN 'public' ELSE r::regrole::text END, ',' ORDER BY r)
                                       FROM unnest(pol.polroles) r),
                                    coalesce(pg_get_expr(pol.polqual, pol.polrelid), '-')),
                             ' | ' ORDER BY pol.polname), 'none')
    FROM pg_policy pol WHERE pol.polrelid = p_tbl;
$$;

-- One pg_default_acl row as text, 'none' when the row does not exist. p_nsp NULL
-- is the global row.
CREATE OR REPLACE FUNCTION pg_temp.dacl(p_role text, p_nsp text, p_type "char")
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT d.defaclacl::text FROM pg_default_acl d
                    WHERE d.defaclrole = p_role::regrole::oid
                      AND d.defaclnamespace = coalesce(p_nsp::regnamespace::oid, 0::oid)
                      AND d.defaclobjtype = p_type), 'none');
$$;

CREATE TEMP TABLE t_f3_cat (phase text, k text, v text, PRIMARY KEY (phase, k)) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.take_cat(p_phase text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_f3_cat(phase, k, v)
  SELECT p_phase, x.k, x.v FROM (VALUES
    ('pastoral map: rls', (SELECT c.relrowsecurity::text FROM pg_class c WHERE c.oid = 'public.pastoral_role_capability_map'::regclass)),
    ('pastoral map: anon', pg_temp.tbl_privs('anon', 'public.pastoral_role_capability_map')),
    ('pastoral map: authenticated', pg_temp.tbl_privs('authenticated', 'public.pastoral_role_capability_map')),
    ('pastoral map: policies', pg_temp.policies('public.pastoral_role_capability_map')),
    ('debug whitelist: rls', (SELECT c.relrowsecurity::text FROM pg_class c WHERE c.oid = 'public.debug_toolbar_whitelist'::regclass)),
    ('debug whitelist: anon', pg_temp.tbl_privs('anon', 'public.debug_toolbar_whitelist')),
    ('debug whitelist: authenticated', pg_temp.tbl_privs('authenticated', 'public.debug_toolbar_whitelist')),
    ('debug whitelist: policies', pg_temp.policies('public.debug_toolbar_whitelist')),
    ('talleres map: rls', (SELECT c.relrowsecurity::text FROM pg_class c WHERE c.oid = 'public.talleres_role_capability_map'::regclass)),
    ('talleres map: anon', pg_temp.tbl_privs('anon', 'public.talleres_role_capability_map')),
    ('talleres map: authenticated', pg_temp.tbl_privs('authenticated', 'public.talleres_role_capability_map')),
    ('talleres map: policies', pg_temp.policies('public.talleres_role_capability_map')),
    ('fn es_admin_o_pastor(uuid)', pg_temp.fn_privs('public.es_admin_o_pastor(uuid)')),
    ('fn eliminar_relacion_familiar(uuid)', pg_temp.fn_privs('public.eliminar_relacion_familiar(uuid)')),
    ('fn taller_emit_overdue_event(uuid,date)', pg_temp.fn_privs('public.taller_emit_overdue_event(uuid,date)')),
    ('fn cohort_belongs_to_talleres_experience(uuid)', pg_temp.fn_privs('public.cohort_belongs_to_talleres_experience(uuid)')),
    ('fn expirar_solicitudes_vencidas()', pg_temp.fn_privs('public.expirar_solicitudes_vencidas()')),
    ('default acl: postgres public functions', pg_temp.dacl('postgres', 'public', 'f')),
    ('default acl: postgres public tables', pg_temp.dacl('postgres', 'public', 'r')),
    ('default acl: postgres public sequences', pg_temp.dacl('postgres', 'public', 'S')),
    ('default acl: postgres global functions', pg_temp.dacl('postgres', NULL, 'f')),
    ('default acl: supabase_admin public functions', pg_temp.dacl('supabase_admin', 'public', 'f'))
  ) x(k, v);
$$;

-- Expected values: open = staging before the apply, closed = after it. A value
-- that the migrations must not change has open = closed.
CREATE TEMP TABLE t_f3_expect (lot text, k text PRIMARY KEY, open_v text, closed_v text) ON COMMIT DROP;
INSERT INTO t_f3_expect(lot, k, open_v, closed_v) VALUES
  ('L0', 'pastoral map: rls', 'false', 'true'),
  ('L0', 'pastoral map: anon',
         'select=true insert=true update=true delete=true truncate=true',
         'select=false insert=false update=false delete=false truncate=false'),
  ('L0', 'pastoral map: authenticated',
         'select=true insert=true update=true delete=true truncate=true',
         'select=false insert=false update=false delete=false truncate=false'),
  ('L0', 'pastoral map: policies', 'none', 'none'),
  ('L0', 'debug whitelist: rls', 'true', 'true'),
  ('L0', 'debug whitelist: anon',
         'select=true insert=true update=true delete=true truncate=true',
         'select=false insert=false update=false delete=false truncate=false'),
  ('L0', 'debug whitelist: authenticated',
         'select=true insert=true update=true delete=true truncate=true',
         'select=true insert=false update=false delete=false truncate=false'),
  ('L0', 'debug whitelist: policies',
         'select_whitelist r public true',
         'debug_toolbar_whitelist_select_admin_pastor r authenticated es_admin_o_pastor(( SELECT auth.uid() AS uid))'),
  ('L0', 'talleres map: rls', 'true', 'true'),
  ('L0', 'talleres map: anon',
         'select=false insert=false update=false delete=false truncate=false',
         'select=false insert=false update=false delete=false truncate=false'),
  ('L0', 'talleres map: authenticated',
         'select=false insert=false update=false delete=false truncate=false',
         'select=false insert=false update=false delete=false truncate=false'),
  ('L0', 'talleres map: policies', 'none', 'none'),
  ('L0', 'fn es_admin_o_pastor(uuid)',
         'anon=false authenticated=true service_role=true public=false',
         'anon=false authenticated=true service_role=true public=false'),
  ('L1', 'fn eliminar_relacion_familiar(uuid)',
         'anon=false authenticated=true service_role=true public=false',
         'anon=false authenticated=false service_role=true public=false'),
  ('L1', 'fn taller_emit_overdue_event(uuid,date)',
         'anon=false authenticated=true service_role=true public=false',
         'anon=false authenticated=false service_role=true public=false'),
  ('L1', 'fn cohort_belongs_to_talleres_experience(uuid)',
         'anon=false authenticated=true service_role=true public=false',
         'anon=false authenticated=false service_role=true public=false'),
  ('L1', 'fn expirar_solicitudes_vencidas()',
         'anon=false authenticated=true service_role=true public=false',
         'anon=false authenticated=false service_role=true public=false'),
  ('L1', 'default acl: postgres public functions',
         '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}',
         '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('L1', 'default acl: postgres public tables',
         '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}',
         '{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'),
  ('L1', 'default acl: postgres public sequences',
         '{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}',
         '{postgres=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}'),
  ('L1', 'default acl: postgres global functions', 'none', '{postgres=X/postgres}'),
  ('L1', 'default acl: supabase_admin public functions',
         '{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}',
         '{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}');

-- b. Behaviour probes ------------------------------------------------------------

CREATE TEMP TABLE t_f3_probe (phase text, k text, v text, PRIMARY KEY (phase, k)) ON COMMIT DROP;

-- Runs one statement that returns one scalar, under p_role with the claims of
-- p_sub (both formats: request.jwt.claim.* and the JSON request.jwt.claims), and
-- returns its text form or 'ERR <sqlstate>'. p_role NULL keeps postgres and sets
-- no claims; p_sub NULL is a visitor. The statement always runs in a
-- subtransaction that is rolled back (the result travels in the exception), so
-- a write that unexpectedly succeeds leaves nothing behind. p_sql must not call
-- a pg_temp function: those are executable by postgres alone once the global
-- default of the migration is in place.
CREATE OR REPLACE FUNCTION pg_temp.probe(p_role text, p_sub uuid, p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_out text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true),
          set_config('request.jwt.claim.role', coalesce(p_role, ''), true),
          set_config('request.jwt.claims',
                     CASE WHEN p_role IS NULL THEN '' ELSE json_build_object('role', p_role, 'sub', p_sub)::text END,
                     true);
  BEGIN
    IF p_role IS NOT NULL THEN
      EXECUTE format('SET LOCAL ROLE %I', p_role);
    END IF;
    EXECUTE p_sql INTO v_out;
    RAISE EXCEPTION USING ERRCODE = 'ZZF30', MESSAGE = coalesce(v_out, 'NULL');
  EXCEPTION
    WHEN OTHERS THEN
      v_out := CASE WHEN SQLSTATE = 'ZZF30' THEN SQLERRM ELSE 'ERR ' || SQLSTATE END;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true),
          set_config('request.jwt.claim.role', '', true),
          set_config('request.jwt.claims', '', true);
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.run(p_phase text, p_k text, p_role text, p_sub uuid, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  v := pg_temp.probe(p_role, p_sub, p_sql);
  INSERT INTO t_f3_probe(phase, k, v) VALUES (p_phase, p_k, v);
END;
$$;

-- The probes that run both before and after the migration blocks.
CREATE OR REPLACE FUNCTION pg_temp.run_probes(p_phase text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_admin_auth uuid;
  v_admin_id uuid;
  v_leader_auth uuid;
  v_leader_id uuid;
BEGIN
  SELECT w.auth, w.uid INTO v_admin_auth, v_admin_id FROM t_f3_who w WHERE w.who = 'admin';
  SELECT w.auth, w.uid INTO v_leader_auth, v_leader_id FROM t_f3_who w WHERE w.who = 'leader';

  PERFORM pg_temp.run(p_phase, 'debug: anon reads', 'anon', NULL,
    'SELECT count(*)::text FROM public.debug_toolbar_whitelist');
  PERFORM pg_temp.run(p_phase, 'debug: leader reads', 'authenticated', v_leader_auth,
    'SELECT count(*)::text FROM public.debug_toolbar_whitelist');
  PERFORM pg_temp.run(p_phase, 'debug: admin reads every row', 'authenticated', v_admin_auth,
    'SELECT count(*)::text FROM public.debug_toolbar_whitelist');
  PERFORM pg_temp.run(p_phase, 'debug: admin reads own row', 'authenticated', v_admin_auth,
    format('SELECT count(*)::text FROM public.debug_toolbar_whitelist WHERE usuario_id = %L::uuid', v_admin_id));
  PERFORM pg_temp.run(p_phase, 'debug: leader adds a row', 'authenticated', v_leader_auth,
    format('WITH x AS (INSERT INTO public.debug_toolbar_whitelist (usuario_id) VALUES (%L::uuid) RETURNING 1) SELECT count(*)::text FROM x', v_leader_id));
  PERFORM pg_temp.run(p_phase, 'debug: puede_ver_debug_toolbar admin', 'authenticated', v_admin_auth,
    format('SELECT public.puede_ver_debug_toolbar(%L::uuid)::text', v_admin_auth));
  PERFORM pg_temp.run(p_phase, 'debug: puede_ver_debug_toolbar leader', 'authenticated', v_leader_auth,
    format('SELECT public.puede_ver_debug_toolbar(%L::uuid)::text', v_leader_auth));

  PERFORM pg_temp.run(p_phase, 'pastoral map: anon reads', 'anon', NULL,
    'SELECT count(*)::text FROM public.pastoral_role_capability_map');
  PERFORM pg_temp.run(p_phase, 'pastoral map: leader reads', 'authenticated', v_leader_auth,
    'SELECT count(*)::text FROM public.pastoral_role_capability_map');
  PERFORM pg_temp.run(p_phase, 'pastoral map: anon adds a row', 'anon', NULL,
    'WITH x AS (INSERT INTO public.pastoral_role_capability_map (rol, capability_key, scope_type) VALUES (''zz_f3_probe'', ''zz'', ''zz'') RETURNING 1) SELECT count(*)::text FROM x');
  PERFORM pg_temp.run(p_phase, 'pastoral map: leader deletes a probe row', 'authenticated', v_leader_auth,
    'WITH x AS (DELETE FROM public.pastoral_role_capability_map WHERE rol = ''zz_f3_probe'' RETURNING 1) SELECT count(*)::text FROM x');
  PERFORM pg_temp.run(p_phase, 'pastoral map: auto-grant for a new persona (definer)', NULL, NULL,
    'SELECT public.assign_pastoral_capabilities_for_role(gen_random_uuid(), ''lider'')::text');
END;
$$;

-- Creates a function, a table and a sequence in public and a function in
-- pg_temp as postgres, records who gets what, and drops them again.
CREATE OR REPLACE FUNCTION pg_temp.new_objects(p_phase text, p_name text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_tbl text := format('public.%I', p_name || '_t');
  v_seq text := format('public.%I', p_name || '_s');
BEGIN
  EXECUTE format('CREATE FUNCTION public.%I() RETURNS integer LANGUAGE sql AS ''SELECT 1''', p_name);
  EXECUTE format('CREATE FUNCTION pg_temp.%I() RETURNS integer LANGUAGE sql AS ''SELECT 1''', p_name);
  EXECUTE format('CREATE TABLE %s (id integer)', v_tbl);
  EXECUTE format('CREATE SEQUENCE %s', v_seq);

  INSERT INTO t_f3_probe(phase, k, v) VALUES
    (p_phase, 'new function in public', pg_temp.fn_privs(format('public.%I()', p_name)::regprocedure)),
    (p_phase, 'new function in pg_temp', pg_temp.fn_privs(format('pg_temp.%I()', p_name)::regprocedure)),
    (p_phase, 'new table in public (SELECT)',
     format('anon=%s authenticated=%s service_role=%s',
            has_table_privilege('anon', v_tbl, 'SELECT')::text,
            has_table_privilege('authenticated', v_tbl, 'SELECT')::text,
            has_table_privilege('service_role', v_tbl, 'SELECT')::text)),
    (p_phase, 'new sequence in public (USAGE)',
     format('anon=%s authenticated=%s service_role=%s',
            has_sequence_privilege('anon', v_seq, 'USAGE')::text,
            has_sequence_privilege('authenticated', v_seq, 'USAGE')::text,
            has_sequence_privilege('service_role', v_seq, 'USAGE')::text));

  EXECUTE format('DROP FUNCTION public.%I()', p_name);
  EXECUTE format('DROP FUNCTION pg_temp.%I()', p_name);
  EXECUTE format('DROP TABLE %s', v_tbl);
  EXECUTE format('DROP SEQUENCE %s', v_seq);
END;
$$;

-- Expected probe results. phases: where the probe runs (s0 = before the blocks,
-- s1 = after). Before the blocks the open value is expected when the batch was
-- found open, the closed one when it was found closed; after them, always the
-- closed one.
CREATE TEMP TABLE t_f3_bexp (lot text, k text PRIMARY KEY, open_v text, closed_v text, phases text[]) ON COMMIT DROP;
INSERT INTO t_f3_bexp(lot, k, open_v, closed_v, phases)
SELECT x.lot, x.k, x.open_v, x.closed_v, x.phases
  FROM t_f3_counts c,
       LATERAL (VALUES
         ('L0', 'debug: anon reads', c.whitelist_rows, 'ERR 42501', '{s0,s1}'::text[]),
         ('L0', 'debug: leader reads', c.whitelist_rows, '0', '{s0,s1}'),
         ('L0', 'debug: admin reads every row', c.whitelist_rows, c.whitelist_rows, '{s0,s1}'),
         ('L0', 'debug: admin reads own row', '1', '1', '{s0,s1}'),
         ('L0', 'debug: leader adds a row', 'ERR 42501', 'ERR 42501', '{s0,s1}'),
         ('L0', 'debug: puede_ver_debug_toolbar admin', 'true', 'true', '{s0,s1}'),
         ('L0', 'debug: puede_ver_debug_toolbar leader', 'false', 'false', '{s0,s1}'),
         ('L0', 'pastoral map: anon reads', c.map_rows, 'ERR 42501', '{s0,s1}'),
         ('L0', 'pastoral map: leader reads', c.map_rows, 'ERR 42501', '{s0,s1}'),
         ('L0', 'pastoral map: anon adds a row', '1', 'ERR 42501', '{s0,s1}'),
         ('L0', 'pastoral map: leader deletes a probe row', '0', 'ERR 42501', '{s0,s1}'),
         ('L0', 'pastoral map: auto-grant for a new persona (definer)', c.map_lider_rows, c.map_lider_rows, '{s0,s1}'),
         ('L1', 'new function in public',
                'anon=true authenticated=true service_role=true public=true',
                'anon=false authenticated=true service_role=true public=false', '{s0,s1}'),
         ('L1', 'new function in pg_temp',
                'anon=true authenticated=true service_role=true public=true',
                'anon=false authenticated=false service_role=false public=false', '{s0,s1}'),
         ('L1', 'new table in public (SELECT)',
                'anon=true authenticated=true service_role=true',
                'anon=false authenticated=true service_role=true', '{s0,s1}'),
         ('L1', 'new sequence in public (USAGE)',
                'anon=true authenticated=true service_role=true',
                'anon=false authenticated=true service_role=true', '{s0,s1}'),
         ('L1', 'call: leader eliminar_relacion_familiar', NULL, 'ERR 42501', '{s1}'),
         ('L1', 'call: leader taller_emit_overdue_event', NULL, 'ERR 42501', '{s1}'),
         ('L1', 'call: leader cohort_belongs_to_talleres_experience', NULL, 'ERR 42501', '{s1}'),
         ('L1', 'call: leader expirar_solicitudes_vencidas', NULL, 'ERR 42501', '{s1}'),
         ('L1', 'call: anon expirar_solicitudes_vencidas', NULL, 'ERR 42501', '{s1}'),
         ('L1', 'call: service_role cohort_belongs_to_talleres_experience', NULL, 'false', '{s1}')
       ) x(lot, k, open_v, closed_v, phases);

-- s0: as found ---------------------------------------------------------------------

SELECT pg_temp.take_cat('s0');
SELECT pg_temp.run_probes('s0');
SELECT pg_temp.new_objects('s0', 'zz_fase3_probe_before');

CREATE TEMP TABLE t_f3_state ON COMMIT DROP AS
SELECT e.lot,
       CASE WHEN bool_and(c.v IS NOT DISTINCT FROM e.open_v) THEN 'open'
            WHEN bool_and(c.v IS NOT DISTINCT FROM e.closed_v) THEN 'closed'
            ELSE 'neither' END AS state
  FROM t_f3_expect e LEFT JOIN t_f3_cat c ON c.phase = 's0' AND c.k = e.k
 GROUP BY e.lot;

INSERT INTO t_f3_failures
SELECT format('a as found %s: %s = %s (open state %s, closed state %s)', e.lot, e.k, coalesce(c.v, 'nothing'), e.open_v, e.closed_v)
  FROM t_f3_expect e
  JOIN t_f3_state s ON s.lot = e.lot AND s.state = 'neither'
  LEFT JOIN t_f3_cat c ON c.phase = 's0' AND c.k = e.k
 WHERE e.open_v IS DISTINCT FROM e.closed_v OR c.v IS DISTINCT FROM e.open_v;

-- >>> BEGIN migration 20261003100000_cierres_pastoral_y_debug.sql (byte-identical copy)
-- Close two tables that visitors and any signed-in person could reach
-- (security phase 3, batch 0).
--
-- What was wrong:
--   * pastoral_role_capability_map (created by 20260727000000) has row level
--     security disabled while anon and authenticated hold every table privilege
--     on it. This is the state on staging; production does not have the table
--     yet (the pastoral migrations were never applied there). The map decides
--     which pastoral capabilities a system role receives: the trigger
--     trg_sync_pastoral_grants_on_role_change on usuario_roles calls
--     assign_pastoral_capabilities_for_role, which copies the map into
--     dream_team_capability_grants. With the public anon key anybody could map
--     'lider' to pastoral.admin.manage (escalation on the next role change) or
--     empty the map. It is the hole 20260918130000 closed on the sibling table
--     talleres_role_capability_map.
--   * debug_toolbar_whitelist has row level security on, but its only policy,
--     select_whitelist, lets every role (PUBLIC) read every row, and anon holds
--     every table privilege. Any visitor could list the internal person ids that
--     see the debug toolbar (staging and production).
--
-- What changes:
--   1. pastoral_role_capability_map: row level security on, every privilege of
--      anon and authenticated revoked, no policy (only the owner reads or writes
--      the map). postgres and service_role keep theirs. The block is guarded by
--      to_regclass, so the file applies cleanly where the table does not exist:
--      it does nothing there. Run the block again after the pastoral migrations
--      are applied on such a database (it is idempotent): 20260727000000 creates
--      the table without row level security, and after 20261003110000 a new
--      table still gives every privilege to authenticated.
--   2. debug_toolbar_whitelist: row level security stated on; every privilege of
--      anon revoked; authenticated keeps SELECT only (its write privileges did
--      nothing under row level security, but TRUNCATE ignores row level
--      security); the open policy is replaced by a SELECT policy for
--      authenticated limited to admins and pastors, es_admin_o_pastor(auth.uid()),
--      the session-bound helper that the dg_directores_etapa policy already uses.
--      The table and its open policy were made by hand (no migration creates
--      them), so a database built only from migrations (local reset, CI shadow
--      database, preview branch) has no such table: the block is guarded by
--      to_regclass like the pastoral one and does nothing there. Where the
--      table exists, another database could name that policy differently: the
--      block raises, and nothing is applied, when any policy other than the new
--      one is left on the table. The statements are idempotent.
--
-- Who reads these tables (inventory on staging, 2026-10-02: function bodies,
-- views, policies and the app):
--   * pastoral_role_capability_map: only assign_pastoral_capabilities_for_role
--     and sync_pastoral_grants_on_role_change, both definer functions owned by
--     postgres. The owner is not subject to row level security (it is not
--     forced on the table) and postgres has BYPASSRLS, so the auto-grant path
--     reads the map as before. No view or policy uses the table; the app never
--     reads it (only lib/supabase/database.types.ts names it).
--   * debug_toolbar_whitelist: only puede_ver_debug_toolbar(uuid), a definer
--     function owned by postgres, so it keeps answering as before. No view or
--     policy uses the table; the app never reads it directly.
--   * talleres_role_capability_map was checked as well: row level security on
--     and no privilege for anon or authenticated on staging (and on production,
--     since 20260918130000), so it is not touched.
--
-- Blast radius: a visitor that selects from either table now gets 42501
-- (permission denied) instead of rows; a signed-in person who is not an admin
-- or a pastor sees no rows of debug_toolbar_whitelist and gets 42501 on the
-- pastoral map. Nothing in the app does either. Admins and pastors still read
-- the whitelist, and every definer function above behaves as before.
-- supabase/tests/fase3-cierres-y-privilegios.test.sql pins all of this.
--
-- Rollback (restores the open state; do not use): disable row level security on
-- pastoral_role_capability_map, give anon and authenticated back every table
-- privilege on both tables, drop debug_toolbar_whitelist_select_admin_pastor
-- and recreate select_whitelist as a SELECT policy for every role whose qual is
-- the constant true.

DO $cierre_pastoral$
BEGIN
  IF to_regclass('public.pastoral_role_capability_map') IS NOT NULL THEN
    ALTER TABLE public.pastoral_role_capability_map ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.pastoral_role_capability_map FROM anon, authenticated;
  END IF;
END
$cierre_pastoral$;

DO $cierre_debug$
DECLARE
  v_other text;
BEGIN
  IF to_regclass('public.debug_toolbar_whitelist') IS NOT NULL THEN
    ALTER TABLE public.debug_toolbar_whitelist ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.debug_toolbar_whitelist FROM anon, authenticated;
    GRANT SELECT ON TABLE public.debug_toolbar_whitelist TO authenticated;

    DROP POLICY IF EXISTS select_whitelist ON public.debug_toolbar_whitelist;
    DROP POLICY IF EXISTS debug_toolbar_whitelist_select_admin_pastor ON public.debug_toolbar_whitelist;
    CREATE POLICY debug_toolbar_whitelist_select_admin_pastor
      ON public.debug_toolbar_whitelist
      FOR SELECT
      TO authenticated
      USING (public.es_admin_o_pastor((SELECT auth.uid())));

    SELECT string_agg(pol.polname, ', ' ORDER BY pol.polname) INTO v_other
      FROM pg_policy pol
     WHERE pol.polrelid = 'public.debug_toolbar_whitelist'::regclass
       AND pol.polname <> 'debug_toolbar_whitelist_select_admin_pastor';
    IF v_other IS NOT NULL THEN
      RAISE EXCEPTION 'cierres_pastoral_y_debug: debug_toolbar_whitelist keeps other policies (%); drop them or adapt this file', v_other;
    END IF;
  END IF;
END
$cierre_debug$;
-- <<< END migration 20261003100000_cierres_pastoral_y_debug.sql

-- >>> BEGIN migration 20261003110000_privilegios_por_defecto.sql (byte-identical copy)
-- Dead executables and default privileges (security phase 3, batch 1).
--
-- PART 1. Four definer functions that any signed-in person could execute
-- although no signed-in caller needs them (inventory on staging, 2026-10-02):
--   eliminar_relacion_familiar(uuid)             deletes a family link and its
--       inverse by id without checking who asks; the app calls
--       eliminar_relacion_familiar_segura instead.
--   taller_emit_overdue_event(uuid, date)        inserts an overdue event for
--       any taller id; 20260811140000 granted it to service_role only, staging
--       drifted.
--   cohort_belongs_to_talleres_experience(uuid)  dead code: no caller in the
--       database (functions, policies, views) or in the app.
--   expirar_solicitudes_vencidas()               expires every overdue group
--       request of the whole database. The app called it with the session
--       client; lib/actions/solicitudes-grupo.actions.ts now calls it with the
--       service client, which keeps that global behaviour.
-- EXECUTE is revoked from PUBLIC, anon and authenticated and restated for
-- service_role. The owner (postgres) and supabase_admin keep theirs and no
-- function body changes. No other function, policy, view or trigger calls any of
-- the four, so nothing else changes. The statements are not guarded on purpose:
-- if a database lacks one of the functions, the whole file fails and nothing is
-- applied.
--
-- PART 2. Default privileges: what a NEW object gets when postgres creates it.
-- Postgres computes the ACL of a function, table or sequence that role R
-- creates in schema S as
--     the global default of R (its pg_default_acl row with no schema or, when
--     there is none, the built-in default: EXECUTE to PUBLIC on functions,
--     nothing on tables and sequences)
--   + the per-schema row of R for S, if there is one.
-- A per-schema row can only add: REVOKE ... IN SCHEMA takes back what an earlier
-- GRANT ... IN SCHEMA added, never the global default.
-- Found on staging for R = postgres and S = public: functions
-- {postgres,anon,authenticated,service_role}=X, tables anon=arwdDxtm, sequences
-- anon=rwU, and no global row, so the built-in EXECUTE to PUBLIC applied too.
-- Every new function was born executable by anon (through PUBLIC and through
-- its own entry), and every new table, view and sequence gave anon every
-- privilege (row level security still decides the rows).
-- This file:
--   * removes anon from the per-schema rows of postgres in public for functions,
--     tables and sequences (IN SCHEMA form: that is where anon comes from);
--   * revokes EXECUTE from PUBLIC in the GLOBAL default of postgres. The global
--     form is required: the built-in EXECUTE to PUBLIC is a global default and
--     cannot be cancelled per schema.
-- Resulting rule for what postgres creates in public from now on: functions are
-- executable by postgres, authenticated and service_role; tables, views and
-- sequences give their privileges to postgres, authenticated and service_role;
-- anon and PUBLIC get nothing. A future function or table that must work without
-- a session needs an explicit grant to anon in its migration, the way
-- configuracion_plataforma has one.
--
-- Side effect of the global form (on purpose): a function that postgres creates
-- later in a schema where postgres has no per-schema row (every schema except
-- public and storage: extensions, pg_temp, a future private schema...) is
-- executable only by postgres until somebody grants it. That covers
--   * extension functions that postgres installs, or that an extension update
--     run by postgres adds. On staging pgcrypto, uuid-ossp and
--     pg_stat_statements belong to postgres; pg_trgm (similarity and the rest,
--     installed in public), btree_gist and supabase_vault belong to
--     supabase_admin, whose defaults this file does not touch, so they are not
--     affected;
--   * the pg_temp helpers of the SQL suites in supabase/tests: a suite that calls
--     one of its own pg_temp functions after SET LOCAL ROLE anon or
--     authenticated must grant them first, for example with
--     GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;
--     right after it defines them.
-- Existing objects keep their privileges: default privileges only apply to
-- objects created later, and CREATE OR REPLACE of an existing function keeps
-- its ACL.
--
-- Not changed: the default rows of supabase_admin (public, graphql,
-- graphql_public, extensions...) still give anon privileges on every object that
-- supabase_admin creates; postgres is not a member of supabase_admin and cannot
-- alter its default privileges. The rows of postgres for the storage schema are
-- left as they are (the app creates nothing there).
--
-- The migration linter (supabase/tests/lint-migrations.mjs) now fails any
-- migration from 20261003 on that creates or replaces a definer function without
-- a REVOKE ... FROM PUBLIC for it in the same file: what the defaults give
-- depends on who creates the function and where, and CREATE OR REPLACE keeps
-- whatever ACL the function already had.
--
-- The block at the end checks the result and raises, so nothing is applied, when
-- one of the four is still executable by PUBLIC, anon or authenticated, when
-- service_role lost it, or when a default of postgres for public, or its global
-- default for functions, still gives anon or PUBLIC anything.
--
-- Rollback: run each REVOKE ... FROM below as GRANT ... TO (for the four
-- functions, to authenticated) and each ALTER DEFAULT PRIVILEGES ... REVOKE ...
-- FROM as ALTER DEFAULT PRIVILEGES ... GRANT ... TO (anon or PUBLIC).

REVOKE EXECUTE ON FUNCTION public.eliminar_relacion_familiar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.taller_emit_overdue_event(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cohort_belongs_to_talleres_experience(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expirar_solicitudes_vencidas() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.eliminar_relacion_familiar(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.taller_emit_overdue_event(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.cohort_belongs_to_talleres_experience(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expirar_solicitudes_vencidas() TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

DO $privilegios_por_defecto_check$
DECLARE
  v_problems text[] := ARRAY[]::text[];
  v_fn regprocedure;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.eliminar_relacion_familiar(uuid)',
    'public.taller_emit_overdue_event(uuid, date)',
    'public.cohort_belongs_to_talleres_experience(uuid)',
    'public.expirar_solicitudes_vencidas()'
  ]::regprocedure[] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                   WHERE p.oid = v_fn AND a.grantee = 0::oid) THEN
      v_problems := v_problems || format('%s is still executable by PUBLIC, anon or authenticated', v_fn);
    END IF;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      v_problems := v_problems || format('%s is not executable by service_role', v_fn);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM pg_default_acl d, aclexplode(d.defaclacl) a
     WHERE d.defaclrole = 'postgres'::regrole::oid
       AND (   (d.defaclnamespace = 'public'::regnamespace::oid AND d.defaclobjtype IN ('f', 'r', 'S'))
            OR (d.defaclnamespace = 0::oid AND d.defaclobjtype = 'f'))
       AND a.grantee IN (0::oid, 'anon'::regrole::oid)
  ) THEN
    v_problems := v_problems || 'a default privilege of postgres still gives anon or PUBLIC something'::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_default_acl d
     WHERE d.defaclrole = 'postgres'::regrole::oid AND d.defaclnamespace = 0::oid AND d.defaclobjtype = 'f'
  ) THEN
    v_problems := v_problems || 'postgres has no global default for functions, so the built-in EXECUTE to PUBLIC still applies'::text;
  END IF;

  IF cardinality(v_problems) > 0 THEN
    RAISE EXCEPTION 'privilegios_por_defecto: %', array_to_string(v_problems, '; ');
  END IF;
END
$privilegios_por_defecto_check$;
-- <<< END migration 20261003110000_privilegios_por_defecto.sql

-- s1: after the blocks -------------------------------------------------------------

SELECT pg_temp.take_cat('s1');
SELECT pg_temp.run_probes('s1');
SELECT pg_temp.new_objects('s1', 'zz_fase3_probe');

SELECT pg_temp.run('s1', 'call: leader eliminar_relacion_familiar', 'authenticated', w.auth,
                   'SELECT pg_typeof(public.eliminar_relacion_familiar(gen_random_uuid()))::text')
  FROM t_f3_who w WHERE w.who = 'leader';
SELECT pg_temp.run('s1', 'call: leader taller_emit_overdue_event', 'authenticated', w.auth,
                   'SELECT pg_typeof(public.taller_emit_overdue_event(gen_random_uuid(), current_date))::text')
  FROM t_f3_who w WHERE w.who = 'leader';
SELECT pg_temp.run('s1', 'call: leader cohort_belongs_to_talleres_experience', 'authenticated', w.auth,
                   'SELECT pg_typeof(public.cohort_belongs_to_talleres_experience(gen_random_uuid()))::text')
  FROM t_f3_who w WHERE w.who = 'leader';
SELECT pg_temp.run('s1', 'call: leader expirar_solicitudes_vencidas', 'authenticated', w.auth,
                   'SELECT pg_typeof(public.expirar_solicitudes_vencidas())::text')
  FROM t_f3_who w WHERE w.who = 'leader';
SELECT pg_temp.run('s1', 'call: anon expirar_solicitudes_vencidas', 'anon', NULL,
                   'SELECT pg_typeof(public.expirar_solicitudes_vencidas())::text');
SELECT pg_temp.run('s1', 'call: service_role cohort_belongs_to_talleres_experience', 'service_role', NULL,
                   'SELECT public.cohort_belongs_to_talleres_experience(gen_random_uuid())::text');

-- a. After the blocks every catalog value is the closed state.
INSERT INTO t_f3_failures
SELECT format('a after %s: expected %s, got %s', e.k, e.closed_v, coalesce(c.v, 'nothing'))
  FROM t_f3_expect e LEFT JOIN t_f3_cat c ON c.phase = 's1' AND c.k = e.k
 WHERE c.v IS DISTINCT FROM e.closed_v;

-- b. Every probe gives the value expected for its phase and the state found.
INSERT INTO t_f3_failures
SELECT format('b %s %s: expected %s, got %s', ph.phase, b.k, x.expected, coalesce(p.v, 'nothing'))
  FROM t_f3_bexp b
  CROSS JOIN LATERAL unnest(b.phases) ph(phase)
  LEFT JOIN t_f3_state s ON s.lot = b.lot
  LEFT JOIN t_f3_probe p ON p.phase = ph.phase AND p.k = b.k
  CROSS JOIN LATERAL (SELECT CASE WHEN ph.phase = 's0' AND s.state = 'open' THEN b.open_v ELSE b.closed_v END AS expected) x
 WHERE p.v IS DISTINCT FROM x.expected;

-- Snapshot printed with the result. --------------------------------------------------
INSERT INTO t_f3_info SELECT 'state found ' || lot, state FROM t_f3_state;
INSERT INTO t_f3_info
SELECT 'counts', format('whitelist rows=%s, pastoral map rows=%s (lider %s)', whitelist_rows, map_rows, map_lider_rows)
  FROM t_f3_counts;
INSERT INTO t_f3_info
SELECT 'catalog ' || a.k,
       CASE WHEN a.v IS NOT DISTINCT FROM b.v THEN coalesce(a.v, 'nothing') || ' (unchanged)'
            ELSE coalesce(a.v, 'nothing') || ' -> ' || coalesce(b.v, 'nothing') END
  FROM t_f3_cat a JOIN t_f3_cat b ON b.phase = 's1' AND b.k = a.k
 WHERE a.phase = 's0';
INSERT INTO t_f3_info
SELECT 'probe ' || k, string_agg(phase || '=' || v, ' -> ' ORDER BY phase)
  FROM t_f3_probe GROUP BY k;

SELECT (SELECT count(*) FROM t_f3_failures) AS failing_cases,
       coalesce((SELECT string_agg(case_name, E'\n' ORDER BY case_name) FROM t_f3_failures), 'all cases ok') AS detail,
       (SELECT string_agg(k || ': ' || v, E'\n' ORDER BY k) FROM t_f3_info) AS info;

ROLLBACK;
