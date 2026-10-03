-- usuario_roles only changes on the server (migration 20261003130000): no
-- INSERT, UPDATE or DELETE policy is left on public.usuario_roles, and anon and
-- authenticated lose INSERT, UPDATE, DELETE and TRUNCATE on it; reads stay as
-- they are and the service role keeps writing.
--
-- Covers:
--   a. Writes in a person's session (role authenticated, with claims), each in
--      a savepoint that is rolled back: the leader gives themselves the admin
--      role, the leader moves their own lider row to admin, the leader deletes
--      the admin's admin row, and the admin gives the leader the admin role.
--      Before the migration all four succeed while the write policies are live
--      (the RED); after it all four fail with 42501, permission denied. When
--      the suite runs again after the apply they already fail before the block.
--   b. service_role (the app's server client) inserts a role row and deletes
--      it, before and after, in a savepoint that is rolled back.
--   c. Catalog: no INSERT, UPDATE or DELETE policy is left and the other
--      policies are as before; anon holds no privilege on the table and
--      authenticated only SELECT, at table level (has_table_privilege, MAINTAIN
--      included) and at column level (pg_attribute.attacl, and
--      information_schema.column_privileges, where authenticated's table
--      SELECT shows on every column); service_role and postgres keep
--      everything; the RLS flags are as before.
--   d. RLS photo: as the admin, the general director, the director de etapa
--      and the leader, the count and md5 of the ids visible in usuario_roles
--      are the same before and after.
--
-- The migration is copied byte for byte between the two marker comments below.
--
-- Run against STAGING inside BEGIN...ROLLBACK: nothing here is kept. Each probe
-- write is undone by its own savepoint, and so is what the trigger
-- trg_sync_pastoral_grants_on_role_change writes for it. The last statement
-- returns the failing cases (kind 'failure', none expected), then the summary
-- rows, because the MCP tool returns only the last result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ur_failures (case_name text, detail text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ur_failures(case_name, detail) VALUES (p_case, p_detail);
$$;

-- Identity simulation, the modes of predicados-plpgsql.test.sql this suite
-- needs: user = request.jwt.claim.sub plus the JSON claims, runs as role
-- authenticated; service = service_role in both claim settings, runs as role
-- service_role; nobody = no claims, stays postgres.
CREATE OR REPLACE FUNCTION pg_temp.set_session(p_mode text, p_auth uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true),
          set_config('request.jwt.claim.sub', '', true),
          set_config('request.jwt.claim.role', '', true);
  IF p_mode = 'user' THEN
    PERFORM set_config('request.jwt.claim.sub', coalesce(p_auth::text, ''), true),
            set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  ELSIF p_mode = 'service' THEN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true),
            set_config('request.jwt.claims', '{"role":"service_role"}', true);
  ELSIF p_mode <> 'nobody' THEN
    RAISE EXCEPTION 'unknown session mode %', p_mode;
  END IF;
END;
$$;

-- Database role the call runs as, per session mode.
CREATE OR REPLACE FUNCTION pg_temp.as_role(p_mode text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_mode = 'user' THEN
    SET LOCAL ROLE authenticated;
  ELSIF p_mode = 'service' THEN
    SET LOCAL ROLE service_role;
  END IF;
END;
$$;

-- Runs the statements in one savepoint as the session and undoes them:
-- "ok <rows of each statement>" or "ERR <sqlstate> <message>".
CREATE OR REPLACE FUNCTION pg_temp.try_write(p_mode text, p_session uuid, p_sqls text[], p_a uuid, p_b uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_sql text;
  v_rows bigint;
  v_counts text[] := '{}';
  v_out text;
BEGIN
  PERFORM pg_temp.set_session(p_mode, p_session);
  BEGIN
    PERFORM pg_temp.as_role(p_mode);
    FOREACH v_sql IN ARRAY p_sqls LOOP
      EXECUTE v_sql USING p_a, p_b;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_counts := v_counts || v_rows::text;
    END LOOP;
    v_out := 'ok ' || array_to_string(v_counts, ',');
    -- Leave the block through an error of our own, so the writes are undone.
    RAISE EXCEPTION 'undo the probe' USING ERRCODE = 'TSUR1';
  EXCEPTION
    WHEN SQLSTATE 'TSUR1' THEN
      NULL;
    WHEN OTHERS THEN
      v_out := 'ERR ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.set_session('nobody', NULL);
  RETURN v_out;
END;
$$;

-- RLS: "count:md5 of the ordered ids" of usuario_roles as the person.
CREATE OR REPLACE FUNCTION pg_temp.photo(p_who uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  PERFORM pg_temp.set_session('user', p_who);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE 'SELECT count(*)::text || '':'' || coalesce(md5(string_agg(id::text, '','' ORDER BY id)), ''-'') FROM public.usuario_roles' INTO v;
  EXCEPTION
    WHEN OTHERS THEN v := 'ERR ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.set_session('nobody', NULL);
  RETURN v;
END;
$$;

-- The table privileges a role holds on usuario_roles, sorted.
CREATE OR REPLACE FUNCTION pg_temp.privs(p_role text)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(p, ',' ORDER BY p), '-')
    FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) p
   WHERE has_table_privilege(p_role, 'public.usuario_roles', p);
$$;

-- The policies on usuario_roles: the write ones (INSERT, UPDATE, DELETE) or
-- the rest, with everything that defines them.
CREATE OR REPLACE FUNCTION pg_temp.policies(p_write boolean)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(format('%s [cmd %s, permissive %s, roles %s, using %s, check %s]',
                                    pol.polname, pol.polcmd, pol.polpermissive, pol.polroles::text,
                                    coalesce(pg_get_expr(pol.polqual, pol.polrelid), '-'),
                                    coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '-')),
                             '; ' ORDER BY pol.polname), '(none)')
    FROM pg_policy pol
   WHERE pol.polrelid = 'public.usuario_roles'::regclass
     AND (pol.polcmd IN ('a', 'w', 'd')) = p_write;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ---------------------------------------------------------------------------
-- People and context.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_ur_who (who text PRIMARY KEY, auth uuid, uid uuid) ON COMMIT DROP;

INSERT INTO t_ur_who(who, auth, uid)
SELECT 'admin', u.auth_id, u.id FROM public.usuarios u
 WHERE '5df3b990-af3d-49b5-a061-025bc3598983'::uuid = u.auth_id;
INSERT INTO t_ur_who(who, auth, uid)
SELECT 'dg', u.auth_id, u.id FROM public.usuarios u
 WHERE '9f23ae7c-7008-4bd6-b449-89c326f8d1af'::uuid = u.auth_id;
INSERT INTO t_ur_who(who, auth, uid)
SELECT 'de', u.auth_id, u.id FROM public.usuarios u
 WHERE 'ee0efdea-2d85-479a-88ab-85720903aa2a'::uuid = u.auth_id;
INSERT INTO t_ur_who(who, auth, uid)
SELECT 'leader', u.auth_id, u.id FROM public.usuarios u
 WHERE '2efa6e21-bbf0-4fb3-a8fa-96e16b3e881d'::uuid = u.auth_id;

-- The rows the probes touch.
CREATE TEMP TABLE t_ur_ctx (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
INSERT INTO t_ur_ctx(k, v) VALUES
  ('admin role',       (SELECT rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin')),
  ('leader lider row', (SELECT ur.id FROM public.usuario_roles ur
                          JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                         WHERE ur.usuario_id = (SELECT uid FROM t_ur_who WHERE who = 'leader')
                           AND rs.nombre_interno = 'lider')),
  ('admin admin row',  (SELECT ur.id FROM public.usuario_roles ur
                          JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                         WHERE ur.usuario_id = (SELECT uid FROM t_ur_who WHERE who = 'admin')
                           AND rs.nombre_interno = 'admin'));

SELECT pg_temp.fail('setup', 'person not found: ' || w.who)
  FROM (VALUES ('admin'), ('dg'), ('de'), ('leader')) w(who)
 WHERE (SELECT uid FROM t_ur_who t WHERE t.who = w.who) IS NULL;

SELECT pg_temp.fail('setup', 'not found: ' || k) FROM t_ur_ctx WHERE v IS NULL;

SELECT pg_temp.fail('setup', 'the leader already holds the admin role')
 WHERE EXISTS (SELECT 1 FROM public.usuario_roles ur
                WHERE ur.usuario_id = (SELECT uid FROM t_ur_who WHERE who = 'leader')
                  AND ur.rol_id = (SELECT v FROM t_ur_ctx WHERE k = 'admin role'));

-- Probes: the session, the statements ($1 = a, $2 = b) and the kind: 'closed'
-- (succeeds while the write policies are live, 42501 after the migration) or
-- 'service' (succeeds before and after).
CREATE TEMP TABLE t_ur_probe (ord int PRIMARY KEY, case_name text UNIQUE, mode text, s_who text,
                              sqls text[], a uuid, b uuid, kind text) ON COMMIT DROP;
INSERT INTO t_ur_probe(ord, case_name, mode, s_who, sqls, a, b, kind) VALUES
  (1, 'leader inserts own admin', 'user', 'leader',
      ARRAY['INSERT INTO public.usuario_roles (usuario_id, rol_id) VALUES ($1, $2)'],
      (SELECT uid FROM t_ur_who WHERE who = 'leader'), (SELECT v FROM t_ur_ctx WHERE k = 'admin role'), 'closed'),
  (2, 'leader turns own row into admin', 'user', 'leader',
      ARRAY['UPDATE public.usuario_roles SET rol_id = $2 WHERE id = $1'],
      (SELECT v FROM t_ur_ctx WHERE k = 'leader lider row'), (SELECT v FROM t_ur_ctx WHERE k = 'admin role'), 'closed'),
  (3, 'leader deletes the admin row', 'user', 'leader',
      ARRAY['DELETE FROM public.usuario_roles WHERE id = $1'],
      (SELECT v FROM t_ur_ctx WHERE k = 'admin admin row'), NULL, 'closed'),
  (4, 'admin inserts admin for leader', 'user', 'admin',
      ARRAY['INSERT INTO public.usuario_roles (usuario_id, rol_id) VALUES ($1, $2)'],
      (SELECT uid FROM t_ur_who WHERE who = 'leader'), (SELECT v FROM t_ur_ctx WHERE k = 'admin role'), 'closed'),
  (5, 'service inserts and deletes', 'service', NULL,
      ARRAY['INSERT INTO public.usuario_roles (usuario_id, rol_id) VALUES ($1, $2)',
            'DELETE FROM public.usuario_roles WHERE usuario_id = $1 AND rol_id = $2'],
      (SELECT uid FROM t_ur_who WHERE who = 'leader'), (SELECT v FROM t_ur_ctx WHERE k = 'admin role'), 'service');

-- ---------------------------------------------------------------------------
-- BEFORE the migration.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_ur_state ON COMMIT DROP AS
SELECT pg_temp.policies(false) AS other_policies,
       (SELECT coalesce(string_agg(pol.polname::text, ', ' ORDER BY pol.polname), '(none)')
          FROM pg_policy pol
         WHERE pol.polrelid = 'public.usuario_roles'::regclass AND pol.polcmd IN ('a', 'w', 'd')) AS write_policy_names,
       (SELECT count(*) FROM pg_policy pol
         WHERE pol.polrelid = 'public.usuario_roles'::regclass AND pol.polcmd IN ('a', 'w', 'd')) AS n_write_policies,
       (SELECT c.relrowsecurity::text || '/' || c.relforcerowsecurity::text
          FROM pg_class c WHERE c.oid = 'public.usuario_roles'::regclass) AS rls,
       (SELECT count(*) FROM public.usuario_roles) AS n_rows;

CREATE TEMP TABLE t_ur_privs_old ON COMMIT DROP AS
SELECT r.role, pg_temp.privs(r.role) AS privs
  FROM (VALUES ('anon'), ('authenticated'), ('service_role'), ('postgres')) r(role);

-- 'open': the write policies are there and authenticated may write; 'closed':
-- neither (a run after the apply). Anything else is a half-applied state.
CREATE TEMP TABLE t_ur_live ON COMMIT DROP AS
SELECT CASE
         WHEN s.n_write_policies > 0
              AND has_table_privilege('authenticated', 'public.usuario_roles', 'INSERT')
              AND has_table_privilege('authenticated', 'public.usuario_roles', 'UPDATE')
              AND has_table_privilege('authenticated', 'public.usuario_roles', 'DELETE') THEN 'open'
         WHEN s.n_write_policies = 0
              AND NOT has_table_privilege('authenticated', 'public.usuario_roles', 'INSERT, UPDATE, DELETE, TRUNCATE')
              AND NOT has_table_privilege('anon', 'public.usuario_roles', 'INSERT, UPDATE, DELETE, TRUNCATE') THEN 'closed'
         ELSE 'partial'
       END AS state
  FROM t_ur_state s;

SELECT pg_temp.fail('setup', 'usuario_roles is half closed before the migration block: write policies '
                    || s.write_policy_names || '; authenticated ' || (SELECT privs FROM t_ur_privs_old WHERE role = 'authenticated'))
  FROM t_ur_state s
 WHERE (SELECT state FROM t_ur_live) = 'partial';

-- a, b. Probes.
CREATE TEMP TABLE t_ur_old (ord int PRIMARY KEY, val text) ON COMMIT DROP;
INSERT INTO t_ur_old(ord, val)
SELECT p.ord, pg_temp.try_write(p.mode, (SELECT w.auth FROM t_ur_who w WHERE w.who = p.s_who), p.sqls, p.a, p.b)
  FROM t_ur_probe p;

-- The RED: while the write policies are live every session write succeeds.
-- On a run after the apply they fail already.
SELECT pg_temp.fail('setup', format('live %s: expected %s, got %s', p.case_name,
                    CASE (SELECT state FROM t_ur_live) WHEN 'open' THEN 'ok 1' ELSE '42501 permission denied' END, o.val))
  FROM t_ur_probe p JOIN t_ur_old o USING (ord)
 WHERE p.kind = 'closed'
   AND NOT CASE (SELECT state FROM t_ur_live)
             WHEN 'open' THEN o.val = 'ok 1'
             ELSE o.val LIKE 'ERR 42501 permission denied%'
           END;

SELECT pg_temp.fail('setup', format('live %s: expected ok 1,1, got %s', p.case_name, o.val))
  FROM t_ur_probe p JOIN t_ur_old o USING (ord)
 WHERE p.kind = 'service' AND o.val IS DISTINCT FROM 'ok 1,1';

-- d. RLS photo.
CREATE TEMP TABLE t_ur_rls_old (who text PRIMARY KEY, val text) ON COMMIT DROP;
INSERT INTO t_ur_rls_old(who, val)
SELECT w.who, pg_temp.photo(w.auth) FROM t_ur_who w;

SELECT pg_temp.fail('setup', format('RLS photo of usuario_roles as %s failed or is empty before the migration: %s', who, val))
  FROM t_ur_rls_old WHERE val LIKE 'ERR%' OR val LIKE '0:%';

-- >>> BEGIN migration 20261003130000_usuario_roles_solo_servidor.sql (byte-identical copy)
-- Only the server changes usuario_roles (security phase 3).
--
-- What: drops every INSERT, UPDATE and DELETE policy on public.usuario_roles;
-- anon loses every privilege on the table and authenticated keeps only SELECT,
-- with its read policy unchanged (read exposure is a later batch). A final
-- check raises if anon or authenticated still hold anything else, at table or
-- column level. service_role keeps every privilege and bypasses RLS.
--
-- Why: three write policies apply to every role and only ask whether the
-- session holds a leadership role, never which row is written:
--   "Solo los líderes pueden asignar roles (insert)"  WITH CHECK tiene_rol_de_liderazgo(auth.uid())
--   "Solo los líderes pueden asignar roles (update)"  USING tiene_rol_de_liderazgo(auth.uid())
--   "Solo los líderes pueden eliminar roles"          USING tiene_rol_de_liderazgo(auth.uid())
-- So any account with a leadership role (lider, director-etapa,
-- director-general, pastor, admin) can give itself or anybody the admin role,
-- or change or remove anybody's roles, through the REST API.
--
-- The policies were created by hand and their names may differ between
-- projects, so the DO block finds them by command (polcmd a, w, d), drops them
-- all and reports their names in a NOTICE. A policy FOR ALL would also cover
-- reads, so it is left alone; the REVOKE closes writes in any case, because
-- privileges are checked before policies.
--
-- Callers (rg "from('usuario_roles')" in app, lib, components and hooks;
-- staging pg_proc, 2026-10-03). Every write goes through the service-role
-- client (createSupabaseAdminClient), which this change does not touch:
--   app/api/usuarios/cambiar-rol/route.ts:43,51  delete + insert, after checking admin
--   lib/actions/user.actions.ts:405               insert of the miembro role for a new person
--   lib/actions/gdv-directores.actions.ts:68      insert of the director-general role
--   app/api/import/grupos/route.ts:146            insert of the miembro role
-- The other calls only read: lib/actions/gdv-directores.actions.ts:61,272,289,
-- lib/actions/dg-segmentos.actions.ts:53,
-- lib/platform/grupos-vida/directores-datos.ts:90,
-- app/api/lideres/buscar/route.ts:44,
-- app/api/segmentos/[segmentoId]/directores-etapa/candidatos/route.ts:47, and
-- the embedded selects of hooks/use-usuarios.ts and hooks/use-usuario-detalle.ts.
-- In the database the only function that writes the table is
-- dream_team_cargar_voluntarios (invoker), executable only by service_role; the
-- trigger trg_sync_pastoral_grants_on_role_change runs its function as definer.
-- No view reads the table.
--
-- Grants: anon and authenticated held SELECT, INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES, TRIGGER and, on PostgreSQL 17, MAINTAIN. REVOKE ALL
-- takes every one of them on any version (a list of names would miss
-- MAINTAIN), and GRANT SELECT gives authenticated back its read. anon reads
-- nothing here today (the read policy asks for auth.role() = 'authenticated'),
-- and its reads of usuarios, segmento_lideres and director_general_segmentos,
-- whose policies look into usuario_roles, already fail with 42501 on
-- functions phase 1 closed to anon, so no working anon path changes. No column
-- grant existed on staging, and a table-level REVOKE also removes column
-- grants (tested on staging); the final check still looks at both levels, so
-- a grant this file cannot revoke (another grantor) fails the migration.
--
-- Rollback (as captured on staging, 2026-10-03; the policies apply to PUBLIC):
--   GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
--     ON public.usuario_roles TO anon, authenticated;   (MAINTAIN on PostgreSQL 17+)
--   CREATE POLICY "Solo los líderes pueden asignar roles (insert)" ON public.usuario_roles
--     FOR INSERT WITH CHECK (tiene_rol_de_liderazgo(auth.uid()));
--   CREATE POLICY "Solo los líderes pueden asignar roles (update)" ON public.usuario_roles
--     FOR UPDATE USING (tiene_rol_de_liderazgo(auth.uid()));
--   CREATE POLICY "Solo los líderes pueden eliminar roles" ON public.usuario_roles
--     FOR DELETE USING (tiene_rol_de_liderazgo(auth.uid()));

DO $$
DECLARE
  v_policy record;
  v_dropped text[] := '{}';
BEGIN
  FOR v_policy IN
    SELECT pol.polname
      FROM pg_policy pol
     WHERE pol.polrelid = 'public.usuario_roles'::regclass
       AND pol.polcmd IN ('a', 'w', 'd')
     ORDER BY pol.polname
  LOOP
    EXECUTE format('DROP POLICY %I ON public.usuario_roles', v_policy.polname);
    v_dropped := v_dropped || v_policy.polname::text;
  END LOOP;

  RAISE NOTICE 'usuario_roles: dropped % write policies: %',
    cardinality(v_dropped),
    coalesce(nullif(array_to_string(v_dropped, ', '), ''), '(none)');
END;
$$;

-- Writes only through the service role; anon gets nothing, authenticated reads.
REVOKE ALL ON public.usuario_roles FROM anon, authenticated;
GRANT SELECT ON public.usuario_roles TO authenticated;

-- Fail loudly if anything else is left for anon, authenticated or PUBLIC: a
-- table privilege other than authenticated's SELECT, or any column grant.
DO $$
DECLARE
  v_left text;
BEGIN
  SELECT string_agg(x.what, ', ' ORDER BY x.what) INTO v_left
    FROM (
      SELECT format('table %s %s', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
                    a.privilege_type) AS what
        FROM pg_class c, aclexplode(c.relacl) a
       WHERE c.oid = 'public.usuario_roles'::regclass
         AND (a.grantee IN (0::oid, 'anon'::regrole::oid, 'authenticated'::regrole::oid))
         AND NOT (a.grantee = 'authenticated'::regrole::oid AND a.privilege_type = 'SELECT')
      UNION ALL
      SELECT format('column %s %s %s', att.attname,
                    CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, a.privilege_type)
        FROM pg_attribute att, aclexplode(att.attacl) a
       WHERE att.attrelid = 'public.usuario_roles'::regclass
         AND att.attnum > 0 AND NOT att.attisdropped
         AND a.grantee IN (0::oid, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
      UNION ALL
      SELECT format('column_privileges %s %s %s', cp.column_name, cp.grantee, cp.privilege_type)
        FROM information_schema.column_privileges cp
       WHERE cp.table_schema = 'public' AND cp.table_name = 'usuario_roles'
         AND cp.grantee IN ('PUBLIC', 'anon', 'authenticated')
         AND NOT (cp.grantee = 'authenticated' AND cp.privilege_type = 'SELECT')) x;

  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'usuario_roles still grants: %', v_left;
  END IF;
END;
$$;
-- <<< END migration 20261003130000_usuario_roles_solo_servidor.sql

-- ---------------------------------------------------------------------------
-- AFTER the migration.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_ur_new (ord int PRIMARY KEY, val text) ON COMMIT DROP;
INSERT INTO t_ur_new(ord, val)
SELECT p.ord, pg_temp.try_write(p.mode, (SELECT w.auth FROM t_ur_who w WHERE w.who = p.s_who), p.sqls, p.a, p.b)
  FROM t_ur_probe p;

-- a. Session writes: 42501 from the missing privilege, not from a policy.
SELECT pg_temp.fail('a session write', format('%s: expected 42501 permission denied, got %s', p.case_name, n.val))
  FROM t_ur_probe p JOIN t_ur_new n USING (ord)
 WHERE p.kind = 'closed' AND n.val NOT LIKE 'ERR 42501 permission denied%';

-- b. The service role still inserts and deletes.
SELECT pg_temp.fail('b service', format('%s: expected ok 1,1, got %s', p.case_name, n.val))
  FROM t_ur_probe p JOIN t_ur_new n USING (ord)
 WHERE p.kind = 'service' AND n.val IS DISTINCT FROM 'ok 1,1';

-- c. Catalog.
SELECT pg_temp.fail('c catalog', 'write policies left: ' || pg_temp.policies(true))
 WHERE EXISTS (SELECT 1 FROM pg_policy pol
                WHERE pol.polrelid = 'public.usuario_roles'::regclass AND pol.polcmd IN ('a', 'w', 'd'));

SELECT pg_temp.fail('c catalog', format('the other policies changed: before %s, after %s', s.other_policies, pg_temp.policies(false)))
  FROM t_ur_state s
 WHERE pg_temp.policies(false) IS DISTINCT FROM s.other_policies;

SELECT pg_temp.fail('c catalog', format('RLS flags changed: before %s, after %s', s.rls, c.relrowsecurity::text || '/' || c.relforcerowsecurity::text))
  FROM t_ur_state s, pg_class c
 WHERE c.oid = 'public.usuario_roles'::regclass
   AND s.rls IS DISTINCT FROM c.relrowsecurity::text || '/' || c.relforcerowsecurity::text;

-- anon holds nothing and authenticated only SELECT; the rest keep everything.
SELECT pg_temp.fail('c catalog', format('%s privileges: before %s, after %s, expected %s', o.role, o.privs, pg_temp.privs(o.role), e.expected))
  FROM t_ur_privs_old o
 CROSS JOIN LATERAL (SELECT CASE o.role WHEN 'anon' THEN '-'
                                        WHEN 'authenticated' THEN 'SELECT'
                                        ELSE o.privs END AS expected) e
 WHERE pg_temp.privs(o.role) IS DISTINCT FROM e.expected;

SELECT pg_temp.fail('c catalog', format('%s %s on usuario_roles: expected %s', r.role, r.priv, r.expected))
  FROM (VALUES ('anon', 'SELECT', false), ('anon', 'INSERT', false), ('anon', 'UPDATE', false), ('anon', 'DELETE', false),
               ('anon', 'TRUNCATE', false), ('anon', 'TRIGGER', false), ('anon', 'REFERENCES', false), ('anon', 'MAINTAIN', false),
               ('authenticated', 'SELECT', true), ('authenticated', 'INSERT', false), ('authenticated', 'UPDATE', false),
               ('authenticated', 'DELETE', false), ('authenticated', 'TRUNCATE', false), ('authenticated', 'TRIGGER', false),
               ('authenticated', 'REFERENCES', false), ('authenticated', 'MAINTAIN', false),
               ('service_role', 'INSERT', true), ('service_role', 'UPDATE', true), ('service_role', 'DELETE', true),
               ('service_role', 'SELECT', true)) r(role, priv, expected)
 WHERE has_table_privilege(r.role, 'public.usuario_roles', r.priv) IS DISTINCT FROM r.expected;

-- Column level: no column grant for anon, authenticated or PUBLIC, and the
-- information schema shows nothing for them but authenticated's table SELECT.
SELECT pg_temp.fail('c catalog', format('column grant left: %s %s %s', att.attname, a.grantee::regrole, a.privilege_type))
  FROM pg_attribute att, aclexplode(att.attacl) a
 WHERE att.attrelid = 'public.usuario_roles'::regclass AND att.attnum > 0 AND NOT att.attisdropped
   AND a.grantee IN (0::oid, 'anon'::regrole::oid, 'authenticated'::regrole::oid);

SELECT pg_temp.fail('c catalog', format('column privilege left: %s %s %s', cp.column_name, cp.grantee, cp.privilege_type))
  FROM information_schema.column_privileges cp
 WHERE cp.table_schema = 'public' AND cp.table_name = 'usuario_roles'
   AND cp.grantee IN ('PUBLIC', 'anon', 'authenticated')
   AND NOT (cp.grantee = 'authenticated' AND cp.privilege_type = 'SELECT');

-- d. RLS photo: the same rows for every identity.
SELECT pg_temp.fail('d rls', format('usuario_roles as %s: before %s, after %s', o.who, o.val, n.val))
  FROM t_ur_rls_old o JOIN t_ur_who w USING (who)
 CROSS JOIN LATERAL (SELECT pg_temp.photo(w.auth) AS val) n
 WHERE n.val IS DISTINCT FROM o.val;

-- Failing cases first (none expected), then what ran.
SELECT kind, name, detail
  FROM (SELECT 1 AS ord, 'failure' AS kind, case_name AS name, detail FROM t_ur_failures
        UNION ALL
        SELECT 2, 'summary', 'compared',
               format('%s probes, %s RLS photos, %s failing cases; before the migration block: %s, %s rows, write policies: %s',
                      (SELECT count(*) FROM t_ur_probe), (SELECT count(*) FROM t_ur_rls_old),
                      (SELECT count(*) FROM t_ur_failures), (SELECT state FROM t_ur_live),
                      (SELECT n_rows FROM t_ur_state), (SELECT write_policy_names FROM t_ur_state))
        UNION ALL
        SELECT 2, 'summary', 'probes before -> after',
               (SELECT string_agg(format('%s: %s -> %s', p.case_name,
                                         regexp_replace(o.val, '^(ERR [0-9A-Z]{5}).*$', '\1'),
                                         regexp_replace(n.val, '^(ERR [0-9A-Z]{5}).*$', '\1')), '; ' ORDER BY p.ord)
                  FROM t_ur_probe p JOIN t_ur_old o USING (ord) JOIN t_ur_new n USING (ord))
        UNION ALL
        SELECT 2, 'summary', 'after',
               format('%s; anon %s; authenticated %s; service_role %s',
                      (SELECT val FROM t_ur_new WHERE ord = 1),
                      pg_temp.privs('anon'), pg_temp.privs('authenticated'), pg_temp.privs('service_role'))) x
 ORDER BY ord, name, detail;

ROLLBACK;
