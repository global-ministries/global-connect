-- Role predicates in plpgsql: obtener_roles_usuario and tiene_rol_de_liderazgo
-- move from LANGUAGE sql to LANGUAGE plpgsql (migration 20261002150000) and must
-- return exactly what the live functions return, identity guard included.
--
-- Covers:
--   a. Every person: for every usuarios row with an auth id, in that person's
--      own session (role authenticated, both claim settings), the sorted roles
--      and the leadership flag are the same before and after the migration.
--   b. Edge cases, same before and after: no session; a leader asking for the
--      admin, the admin asking for the leader, a general director asking for a
--      stage director; service_role asking for the admin, the leader, an unknown
--      id and a person with no roles; a NULL argument in a session and as
--      service_role; a session whose id is in no usuarios row; a person with no
--      roles in their own session; each claim format on its own. Setup cases
--      prove the guard is in the live functions (a foreign id gets the neutral
--      value before the migration), so equality is not trivial.
--   c. Catalog: language plpgsql, definer, search_path pinned to public,
--      volatility, not strict, signature, result, owner and ACL as before; the
--      guard is in both bodies; anon cannot execute, authenticated and
--      service_role can, PUBLIC cannot.
--   d. RLS photo: as the admin, the general director, the stage director and the
--      leader, the count and md5 of the ids of usuarios, grupo_miembros and
--      solicitudes_grupo, and the count of casas_anfitrionas,
--      historial_movimientos_grupo, segmentos, temporadas and direcciones are the
--      same before and after.
--   e. Timing (informational, never a failure): cost per call of both functions
--      as the leader and the admin, before and after, measured two ways: "stmt"
--      is one statement per call (200 statements after a warm-up), "row" is 200
--      calls inside one statement, the way a policy calls them per row; plus the
--      time of count(*) of usuarios and historial_movimientos_grupo as the leader
--      and the general director (best of three).
--
-- Roles are compared sorted (array_agg has no ORDER BY), telling NULL from empty.
-- Every probe call goes through EXECUTE, so it resolves the function afresh and
-- the calls after the migration block run the new bodies.
--
-- The migration is copied byte for byte between the two marker comments below.
--
-- Run against STAGING inside BEGIN...ROLLBACK: nothing here is kept (a fixture
-- person with no roles is inserted only when staging has none). The last
-- statement returns the failing cases (kind 'failure', none expected), then a
-- summary row and the timing rows (kind 'summary' and 'timing'), because the MCP
-- tool returns only the last result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_pp_failures (case_name text, detail text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_pp_failures(case_name, detail) VALUES (p_case, p_detail);
$$;

-- An array as text, sorted, telling NULL from empty.
CREATE OR REPLACE FUNCTION pg_temp.arr(a anyarray)
RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN a IS NULL THEN 'NULL'
              ELSE '[' || coalesce((SELECT string_agg(e::text, ',' ORDER BY e::text) FROM unnest(a) e), '') || ']' END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.has_role(p_auth uuid, p_role text)
RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuarios u
                   JOIN public.usuario_roles ur ON ur.usuario_id = u.id
                   JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                  WHERE p_auth = u.auth_id AND rs.nombre_interno = p_role);
$$;

-- Identity simulation. Modes:
--   user            request.jwt.claim.sub plus the JSON request.jwt.claims
--                   (role authenticated); runs as role authenticated
--   user_legacy     only the per-claim settings (claim.sub, claim.role)
--   user_json       only the JSON request.jwt.claims
--   service         service_role in both claim settings, no sub; runs as
--                   role service_role
--   service_legacy  only request.jwt.claim.role = service_role
--   service_json    only the JSON claims with role service_role
--   nobody          no claims at all; stays postgres
CREATE OR REPLACE FUNCTION pg_temp.set_session(p_mode text, p_auth uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true),
          set_config('request.jwt.claim.sub', '', true),
          set_config('request.jwt.claim.role', '', true);
  IF p_mode IN ('user', 'user_legacy') THEN
    PERFORM set_config('request.jwt.claim.sub', coalesce(p_auth::text, ''), true);
  END IF;
  IF p_mode = 'user_legacy' THEN
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  END IF;
  IF p_mode IN ('user', 'user_json') THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  END IF;
  IF p_mode IN ('service', 'service_legacy') THEN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  END IF;
  IF p_mode IN ('service', 'service_json') THEN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  END IF;
  IF p_mode NOT IN ('user', 'user_legacy', 'user_json', 'service', 'service_legacy', 'service_json', 'nobody') THEN
    RAISE EXCEPTION 'unknown session mode %', p_mode;
  END IF;
END;
$$;

-- Database role the call runs as, per session mode.
CREATE OR REPLACE FUNCTION pg_temp.as_role(p_mode text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_mode LIKE 'user%' THEN
    SET LOCAL ROLE authenticated;
  ELSIF p_mode LIKE 'service%' THEN
    SET LOCAL ROLE service_role;
  END IF;
END;
$$;

-- Both functions for one session and argument:
-- "roles <sorted array or NULL>, leader <bool or NULL>", or the error.
CREATE OR REPLACE FUNCTION pg_temp.probe(p_mode text, p_session uuid, p_arg uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_roles text[];
  v_lider boolean;
  v_out text;
BEGIN
  PERFORM pg_temp.set_session(p_mode, p_session);
  PERFORM pg_temp.as_role(p_mode);
  BEGIN
    EXECUTE 'SELECT public.obtener_roles_usuario($1)' INTO v_roles USING p_arg;
    EXECUTE 'SELECT public.tiene_rol_de_liderazgo($1)' INTO v_lider USING p_arg;
    RESET ROLE;
    v_out := 'roles ' || pg_temp.arr(v_roles) || ', leader ' || coalesce(v_lider::text, 'NULL');
  EXCEPTION
    WHEN OTHERS THEN
      v_out := 'ERR ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.set_session('nobody', NULL);
  RETURN v_out;
END;
$$;

-- RLS: what a person sees through the policies (role authenticated, with
-- claims). "ids" gives "count:md5 of the ordered ids", "count" only the count.
CREATE OR REPLACE FUNCTION pg_temp.photo(p_who uuid, p_tbl text, p_shape text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  PERFORM pg_temp.set_session('user', p_who);
  SET LOCAL ROLE authenticated;
  BEGIN
    IF p_shape = 'ids' THEN
      EXECUTE format('SELECT count(*)::text || '':'' || coalesce(md5(string_agg(id::text, '','' ORDER BY id)), ''-'') FROM public.%I', p_tbl) INTO v;
    ELSE
      EXECUTE format('SELECT count(*)::text FROM public.%I', p_tbl) INTO v;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN v := 'ERR ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.set_session('nobody', NULL);
  RETURN v;
END;
$$;

-- Timing (informational). Milliseconds per call of p_fn for the person's own id:
-- "stmt" runs p_n statements of one call each, "row" one statement of p_n calls.
-- Both after a warm-up.
CREATE OR REPLACE FUNCTION pg_temp.ms_per_call(p_fn text, p_shape text, p_who uuid, p_n int)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE
  q text;
  v text;
  i int;
  t0 timestamptz;
  t1 timestamptz;
BEGIN
  PERFORM pg_temp.set_session('user', p_who);
  SET LOCAL ROLE authenticated;
  IF p_shape = 'stmt' THEN
    q := format('SELECT public.%I($1)::text', p_fn);
    FOR i IN 1 .. 20 LOOP EXECUTE q INTO v USING p_who; END LOOP;
    t0 := clock_timestamp();
    FOR i IN 1 .. p_n LOOP EXECUTE q INTO v USING p_who; END LOOP;
    t1 := clock_timestamp();
  ELSE
    q := format('SELECT count(public.%I($1))::text FROM generate_series(1, %s)', p_fn, p_n);
    EXECUTE q INTO v USING p_who;
    t0 := clock_timestamp();
    EXECUTE q INTO v USING p_who;
    t1 := clock_timestamp();
  END IF;
  RESET ROLE;
  PERFORM pg_temp.set_session('nobody', NULL);
  RETURN round((extract(epoch FROM t1 - t0) * 1000 / p_n)::numeric, 4);
END;
$$;

-- Timing (informational): "ms|count" of count(*) on a table as the person, best
-- of three runs.
CREATE OR REPLACE FUNCTION pg_temp.ms_count(p_tbl text, p_who uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v bigint;
  best numeric;
  ms numeric;
  i int;
  t0 timestamptz;
BEGIN
  PERFORM pg_temp.set_session('user', p_who);
  SET LOCAL ROLE authenticated;
  FOR i IN 1 .. 3 LOOP
    t0 := clock_timestamp();
    EXECUTE format('SELECT count(*) FROM public.%I', p_tbl) INTO v;
    ms := extract(epoch FROM clock_timestamp() - t0) * 1000;
    best := least(coalesce(best, ms), ms);
  END LOOP;
  RESET ROLE;
  PERFORM pg_temp.set_session('nobody', NULL);
  RETURN round(best, 2) || ' ms|' || v;
END;
$$;

-- ---------------------------------------------------------------------------
-- People and context.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_pp_who (who text PRIMARY KEY, auth uuid) ON COMMIT DROP;

INSERT INTO t_pp_who(who, auth)
SELECT 'admin', u.auth_id FROM public.usuarios u
 WHERE '5df3b990-af3d-49b5-a061-025bc3598983'::uuid = u.auth_id;
INSERT INTO t_pp_who(who, auth)
SELECT 'dg', u.auth_id FROM public.usuarios u
 WHERE '9f23ae7c-7008-4bd6-b449-89c326f8d1af'::uuid = u.auth_id;
INSERT INTO t_pp_who(who, auth)
SELECT 'de', u.auth_id FROM public.usuarios u
 WHERE 'ee0efdea-2d85-479a-88ab-85720903aa2a'::uuid = u.auth_id;
INSERT INTO t_pp_who(who, auth)
SELECT 'leader', u.auth_id FROM public.usuarios u
 WHERE '2efa6e21-bbf0-4fb3-a8fa-96e16b3e881d'::uuid = u.auth_id;

-- A person with an auth id and no roles at all.
INSERT INTO t_pp_who(who, auth)
SELECT 'noroles', (SELECT u.auth_id FROM public.usuarios u
                    WHERE u.auth_id IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM public.usuario_roles ur WHERE ur.usuario_id = u.id)
                    ORDER BY u.id LIMIT 1);

-- None on this project: a fixture person (rolled back with everything else).
DO $$
BEGIN
  IF (SELECT auth FROM t_pp_who WHERE who = 'noroles') IS NULL THEN
    WITH fx AS (
      INSERT INTO public.usuarios (nombre, apellido, genero, estado_civil, auth_id)
      SELECT 'Fixture', 'Sin roles', u.genero, u.estado_civil, gen_random_uuid()
        FROM public.usuarios u ORDER BY u.id LIMIT 1
      RETURNING auth_id)
    UPDATE t_pp_who SET auth = (SELECT auth_id FROM fx) WHERE who = 'noroles';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('setup', 'could not insert the no-roles fixture: ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- An id that is in no usuarios row (fixed for the whole run).
INSERT INTO t_pp_who(who, auth) VALUES ('unknown', gen_random_uuid());

-- Setup checks: every person resolved and holding the role the case relies on.
SELECT pg_temp.fail('setup', 'person not found: ' || w.who)
  FROM (VALUES ('admin'), ('dg'), ('de'), ('leader'), ('noroles')) w(who)
 WHERE (SELECT auth FROM t_pp_who t WHERE t.who = w.who) IS NULL;

SELECT pg_temp.fail('setup', format('%s does not hold the role %s', c.who, c.rol))
  FROM (VALUES ('admin', 'admin'), ('dg', 'director-general'), ('de', 'director-etapa'), ('leader', 'lider')) c(who, rol)
 WHERE NOT pg_temp.has_role((SELECT auth FROM t_pp_who WHERE who = c.who), c.rol);

SELECT pg_temp.fail('setup', 'the no-roles person has roles')
 WHERE EXISTS (SELECT 1 FROM public.usuarios u JOIN public.usuario_roles ur ON ur.usuario_id = u.id
                WHERE u.auth_id = (SELECT auth FROM t_pp_who WHERE who = 'noroles'));

SELECT pg_temp.fail('setup', 'the unknown id belongs to somebody')
 WHERE EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = (SELECT auth FROM t_pp_who WHERE who = 'unknown'));

-- Edge cases: session mode, the session's person, the argument's person (NULL
-- = a NULL argument), and what the live functions must answer (checked before
-- the migration, so the equality after it is not trivial): neutral (roles NULL,
-- leader false), or the real roles of the admin or of the leader.
CREATE TEMP TABLE t_pp_edge (case_name text PRIMARY KEY, mode text, s_who text, a_who text, expect text) ON COMMIT DROP;
INSERT INTO t_pp_edge(case_name, mode, s_who, a_who, expect) VALUES
  ('nobody asks for the admin',              'nobody',         NULL,      'admin',   'neutral'),
  ('nobody asks for the leader',             'nobody',         NULL,      'leader',  'neutral'),
  ('nobody, NULL argument',                  'nobody',         NULL,      NULL,      'neutral'),
  ('leader asks for the admin',              'user',           'leader',  'admin',   'neutral'),
  ('leader asks for the admin (legacy)',     'user_legacy',    'leader',  'admin',   'neutral'),
  ('leader asks for the admin (json)',       'user_json',      'leader',  'admin',   'neutral'),
  ('admin asks for the leader',              'user',           'admin',   'leader',  'neutral'),
  ('dg asks for the de',                     'user',           'dg',      'de',      'neutral'),
  ('no-roles person asks for the admin',     'user',           'noroles', 'admin',   'neutral'),
  ('leader, NULL argument',                  'user',           'leader',  NULL,      'neutral'),
  ('leader own (legacy)',                    'user_legacy',    'leader',  'leader',  'leader'),
  ('leader own (json)',                      'user_json',      'leader',  'leader',  'leader'),
  ('no-roles person own',                    'user',           'noroles', 'noroles', 'neutral'),
  ('unknown session own',                    'user',           'unknown', 'unknown', 'neutral'),
  ('service asks for the admin',             'service',        NULL,      'admin',   'admin'),
  ('service asks for the admin (legacy)',    'service_legacy', NULL,      'admin',   'admin'),
  ('service asks for the admin (json)',      'service_json',   NULL,      'admin',   'admin'),
  ('service asks for the leader',            'service',        NULL,      'leader',  'leader'),
  ('service asks for an unknown id',         'service',        NULL,      'unknown', 'neutral'),
  ('service asks for the no-roles person',   'service',        NULL,      'noroles', 'neutral'),
  ('service, NULL argument',                 'service',        NULL,      NULL,      'neutral');

CREATE OR REPLACE FUNCTION pg_temp.run_edge(p_case text)
RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.probe(e.mode,
                       (SELECT auth FROM t_pp_who WHERE who = e.s_who),
                       (SELECT auth FROM t_pp_who WHERE who = e.a_who))
    FROM t_pp_edge e WHERE e.case_name = p_case;
$$;

-- ---------------------------------------------------------------------------
-- BEFORE the migration, from the live text.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_pp_fns (sig text PRIMARY KEY, volatility "char") ON COMMIT DROP;
INSERT INTO t_pp_fns(sig, volatility) VALUES
  ('public.obtener_roles_usuario(uuid)', 'v'),
  ('public.tiene_rol_de_liderazgo(uuid)', 's');

-- Everything of the catalog row that must not change (the language must).
CREATE OR REPLACE FUNCTION pg_temp.cat_of(p_sig text)
RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws(' | ',
           p.oid::regprocedure::text,
           pg_get_function_arguments(p.oid),
           pg_get_function_result(p.oid),
           'volatile=' || p.provolatile::text,
           'definer=' || p.prosecdef::text,
           'owner=' || p.proowner::regrole::text,
           'strict=' || p.proisstrict::text,
           'parallel=' || p.proparallel::text,
           'leakproof=' || p.proleakproof::text,
           'config=' || coalesce(p.proconfig::text, 'NULL'),
           'acl=' || coalesce(p.proacl::text, 'NULL'))
    FROM pg_proc p
   WHERE p.oid = p_sig::regprocedure;
$$;

CREATE TEMP TABLE t_pp_cat_old ON COMMIT DROP AS
SELECT f.sig, pg_temp.cat_of(f.sig) AS cat, l.lanname
  FROM t_pp_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure JOIN pg_language l ON l.oid = p.prolang;
-- The live language goes to the summary row: sql before the apply, plpgsql when
-- the suite runs again after it (then old and new are the same text).

-- a. Every person with an auth id, own session.
CREATE TEMP TABLE t_pp_eq_old (auth uuid PRIMARY KEY, val text) ON COMMIT DROP;
INSERT INTO t_pp_eq_old(auth, val)
SELECT u.auth_id, pg_temp.probe('user', u.auth_id, u.auth_id)
  FROM public.usuarios u
 WHERE u.auth_id IS NOT NULL;

-- b. Edge cases.
CREATE TEMP TABLE t_pp_edge_old (case_name text PRIMARY KEY, val text) ON COMMIT DROP;
INSERT INTO t_pp_edge_old(case_name, val)
SELECT e.case_name, pg_temp.run_edge(e.case_name) FROM t_pp_edge e;

-- The live answers must cover every shape, otherwise equality proves little.
SELECT pg_temp.fail('setup', 'a live probe raised: ' || val)
  FROM (SELECT val FROM t_pp_eq_old UNION ALL SELECT val FROM t_pp_edge_old) x
 WHERE val LIKE 'ERR%';
SELECT pg_temp.fail('setup', 'no person with leadership in their own session')
 WHERE NOT EXISTS (SELECT 1 FROM t_pp_eq_old WHERE val LIKE '%, leader true');
SELECT pg_temp.fail('setup', 'no person with roles and no leadership in their own session')
 WHERE NOT EXISTS (SELECT 1 FROM t_pp_eq_old WHERE val LIKE 'roles [%' AND val LIKE '%, leader false');
SELECT pg_temp.fail('setup', 'no person without roles in their own session')
 WHERE NOT EXISTS (SELECT 1 FROM t_pp_eq_old WHERE val = 'roles NULL, leader false');
-- The guard is live: a foreign id or no session gets the neutral value, and the
-- service client and the person's own session get the real answer.
SELECT pg_temp.fail('setup', format('live %s: expected %s, got %s', e.case_name, e.expect, o.val))
  FROM t_pp_edge e JOIN t_pp_edge_old o USING (case_name)
 WHERE NOT coalesce(CASE e.expect
                      WHEN 'neutral' THEN o.val = 'roles NULL, leader false'
                      WHEN 'admin'   THEN o.val LIKE 'roles [%admin%], leader true'
                      WHEN 'leader'  THEN o.val LIKE 'roles [%lider%], leader true'
                    END, false);

-- d. RLS photo.
CREATE TEMP TABLE t_pp_tbl (tbl text PRIMARY KEY, shape text) ON COMMIT DROP;
INSERT INTO t_pp_tbl(tbl, shape) VALUES
  ('usuarios',                    'ids'),
  ('grupo_miembros',              'ids'),
  ('solicitudes_grupo',           'ids'),
  ('casas_anfitrionas',           'count'),
  ('historial_movimientos_grupo', 'count'),
  ('segmentos',                   'count'),
  ('temporadas',                  'count'),
  ('direcciones',                 'count');

CREATE TEMP TABLE t_pp_rls_old (tbl text, who text, val text, PRIMARY KEY (tbl, who)) ON COMMIT DROP;
INSERT INTO t_pp_rls_old(tbl, who, val)
SELECT t.tbl, w.who, pg_temp.photo(w.auth, t.tbl, t.shape)
  FROM t_pp_tbl t CROSS JOIN t_pp_who w
 WHERE w.who IN ('admin', 'dg', 'de', 'leader');

SELECT pg_temp.fail('setup', format('RLS photo of %s for %s failed before the migration: %s', tbl, who, val))
  FROM t_pp_rls_old WHERE val LIKE 'ERR%';

-- e. Timing before.
CREATE TEMP TABLE t_pp_timing (metric text, phase text, val text, PRIMARY KEY (metric, phase)) ON COMMIT DROP;
INSERT INTO t_pp_timing(metric, phase, val)
SELECT format('%s %s %s', f.fn, s.shape, w.who), 'old',
       pg_temp.ms_per_call(f.fn, s.shape, (SELECT auth FROM t_pp_who t WHERE t.who = w.who), 200) || ' ms/call'
  FROM (VALUES ('obtener_roles_usuario'), ('tiene_rol_de_liderazgo')) f(fn)
 CROSS JOIN (VALUES ('stmt'), ('row')) s(shape)
 CROSS JOIN (VALUES ('leader'), ('admin')) w(who);
INSERT INTO t_pp_timing(metric, phase, val)
SELECT format('count(*) %s %s', c.tbl, w.who), 'old',
       pg_temp.ms_count(c.tbl, (SELECT auth FROM t_pp_who t WHERE t.who = w.who))
  FROM (VALUES ('usuarios'), ('historial_movimientos_grupo')) c(tbl)
 CROSS JOIN (VALUES ('leader'), ('dg')) w(who);

-- >>> BEGIN migration 20261002150000_predicados_plpgsql.sql (byte-identical copy)
-- Role predicates in plpgsql (security phase 2, follow-up of batch 3).
--
-- What: obtener_roles_usuario and tiene_rol_de_liderazgo move from LANGUAGE sql
-- to LANGUAGE plpgsql. They return exactly what they return today, identity
-- guard of 20261002120000 included.
--
-- Why: RLS policies call them per row. The usuarios policies call
-- obtener_roles_usuario(auth.uid()) and puede_ver_usuario(auth.uid(), id), which
-- calls it again; twenty policies call tiene_rol_de_liderazgo(auth.uid()). A
-- SECURITY DEFINER LANGUAGE sql function is never inlined, so its body is
-- planned again in every statement that calls it, and the guard added
-- auth.uid() and auth.role() to that body. A plpgsql body is compiled once per
-- session, keeps its query plans, and runs the guard as plain comparisons
-- before the query.
--   Measured on production, per call: obtener_roles_usuario 0.38 ms before the
--   guard, 0.56 ms with it; tiene_rol_de_liderazgo 0.42 ms before, 0.69 ms with
--   it. A plpgsql prototype with the guard ran 2-3x faster than the original on
--   staging.
--
-- What changes in the bodies:
--   * The guard is an IF before the query, the form of the plpgsql functions of
--     20261002120000. When it fails the functions return what the guarded query
--     returned: NULL for obtener_roles_usuario (array_agg over no rows) and
--     false for tiene_rol_de_liderazgo.
--   * tiene_rol_de_liderazgo checks the five leadership roles with one EXISTS on
--     the tables instead of calling obtener_roles_usuario (a second definer call
--     per row). Same answer: true when the person holds at least one of them,
--     false otherwise, never NULL. Being STABLE with no VOLATILE call inside, it
--     now reads the roles with the snapshot of the calling statement.
--
-- What does not change: signature, argument name, return type, SECURITY
-- DEFINER, search_path pinned to public, volatility (obtener_roles_usuario stays
-- VOLATILE, tiene_rol_de_liderazgo stays STABLE), not STRICT, owner, and grants
-- (restated at the end, today's state: no anon, no PUBLIC).
--
-- Rollback: recreate both functions from
-- 20261002120000_definer_identidad_predicados.sql.

CREATE OR REPLACE FUNCTION public.obtener_roles_usuario(p_auth_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN NULL;
  END IF;

  -- NULL when the person has no roles (array_agg over no rows), as before.
  RETURN (
    SELECT array_agg(rs.nombre_interno)
    FROM public.roles_sistema rs
    JOIN public.usuario_roles ur ON rs.id = ur.rol_id
    JOIN public.usuarios u ON ur.usuario_id = u.id
    WHERE u.auth_id = p_auth_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tiene_rol_de_liderazgo(p_auth_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN false;
  END IF;

  -- Read the roles directly: calling obtener_roles_usuario here would add a
  -- second definer call per row.
  RETURN EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.usuario_roles ur ON ur.usuario_id = u.id
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE u.auth_id = p_auth_id
      AND rs.nombre_interno IN ('lider', 'director-etapa', 'director-general', 'pastor', 'admin')
  );
END;
$function$;

-- Execution rights: signed-in people and the service client only (today's state).
REVOKE ALL ON FUNCTION public.obtener_roles_usuario(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tiene_rol_de_liderazgo(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.obtener_roles_usuario(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tiene_rol_de_liderazgo(uuid) TO authenticated, service_role;
-- <<< END migration 20261002150000_predicados_plpgsql.sql

-- ---------------------------------------------------------------------------
-- AFTER the migration.
-- ---------------------------------------------------------------------------

-- a. Every person, own session: the same as before (and nobody lost or gained).
SELECT pg_temp.fail('a own', format('%s: before %s, after %s', o.auth, o.val, n.val))
  FROM t_pp_eq_old o,
       LATERAL (SELECT pg_temp.probe('user', o.auth, o.auth) AS val) n
 WHERE n.val IS DISTINCT FROM o.val;

SELECT pg_temp.fail('a own', 'the set of people changed: before ' || (SELECT count(*) FROM t_pp_eq_old)
                    || ', now ' || (SELECT count(*) FROM public.usuarios u WHERE u.auth_id IS NOT NULL))
 WHERE (SELECT count(*) FROM t_pp_eq_old) <> (SELECT count(*) FROM public.usuarios u WHERE u.auth_id IS NOT NULL);

-- b. Edge cases: the same as before.
SELECT pg_temp.fail('b edge', format('%s: before %s, after %s', o.case_name, o.val, n.val))
  FROM t_pp_edge_old o,
       LATERAL (SELECT pg_temp.run_edge(o.case_name) AS val) n
 WHERE n.val IS DISTINCT FROM o.val;

-- c. Catalog.
SELECT pg_temp.fail('c catalog', format('%s changed: before [%s], after [%s]', o.sig, o.cat, pg_temp.cat_of(o.sig)))
  FROM t_pp_cat_old o
 WHERE pg_temp.cat_of(o.sig) IS DISTINCT FROM o.cat;

SELECT pg_temp.fail('c catalog', format('%s: language %s, definer %s, config %s, volatility %s (expected plpgsql, true, {search_path=public}, %s), strict %s',
                    f.sig, l.lanname, p.prosecdef, p.proconfig, p.provolatile, f.volatility, p.proisstrict))
  FROM t_pp_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure JOIN pg_language l ON l.oid = p.prolang
 WHERE l.lanname <> 'plpgsql'
    OR NOT p.prosecdef
    OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
    OR p.provolatile <> f.volatility
    OR p.proisstrict;

SELECT pg_temp.fail('c catalog', 'the guard is missing from ' || f.sig)
  FROM t_pp_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure
 WHERE p.prosrc NOT LIKE '%v_request_role text := auth.role()%'
    OR p.prosrc NOT LIKE '%coalesce(v_request_role, '''') <> ''service_role''%'
    OR p.prosrc NOT LIKE '%auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()%';

SELECT pg_temp.fail('c catalog', format('%s privilege on %s: expected %s', r.priv_role, f.sig, r.expected))
  FROM t_pp_fns f
 CROSS JOIN (VALUES ('anon', false), ('authenticated', true), ('service_role', true)) r(priv_role, expected)
 WHERE has_function_privilege(r.priv_role, f.sig, 'execute') IS DISTINCT FROM r.expected;

SELECT pg_temp.fail('c catalog', 'PUBLIC can execute ' || f.sig)
  FROM t_pp_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure,
       aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
 WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE';

-- d. RLS photo: the same rows through the policies, per person and table.
SELECT pg_temp.fail('d rls', format('%s as %s: before %s, after %s', o.tbl, o.who, o.val, n.val))
  FROM t_pp_rls_old o JOIN t_pp_who w ON w.who = o.who JOIN t_pp_tbl t ON t.tbl = o.tbl,
       LATERAL (SELECT pg_temp.photo(w.auth, o.tbl, t.shape) AS val) n
 WHERE n.val IS DISTINCT FROM o.val;

-- e. Timing after.
INSERT INTO t_pp_timing(metric, phase, val)
SELECT format('%s %s %s', f.fn, s.shape, w.who), 'new',
       pg_temp.ms_per_call(f.fn, s.shape, (SELECT auth FROM t_pp_who t WHERE t.who = w.who), 200) || ' ms/call'
  FROM (VALUES ('obtener_roles_usuario'), ('tiene_rol_de_liderazgo')) f(fn)
 CROSS JOIN (VALUES ('stmt'), ('row')) s(shape)
 CROSS JOIN (VALUES ('leader'), ('admin')) w(who);
INSERT INTO t_pp_timing(metric, phase, val)
SELECT format('count(*) %s %s', c.tbl, w.who), 'new',
       pg_temp.ms_count(c.tbl, (SELECT auth FROM t_pp_who t WHERE t.who = w.who))
  FROM (VALUES ('usuarios'), ('historial_movimientos_grupo')) c(tbl)
 CROSS JOIN (VALUES ('leader'), ('dg')) w(who);

-- Failing cases first (none expected), then what ran, then the timing.
SELECT kind, name, detail
  FROM (SELECT 1 AS ord, 'failure' AS kind, case_name AS name, detail FROM t_pp_failures
        UNION ALL
        SELECT 2, 'summary', 'compared',
               format('%s people, %s edge cases, %s RLS photos, %s failing cases; live language before the migration block: %s',
                      (SELECT count(*) FROM t_pp_eq_old), (SELECT count(*) FROM t_pp_edge_old),
                      (SELECT count(*) FROM t_pp_rls_old), (SELECT count(*) FROM t_pp_failures),
                      (SELECT string_agg(sig || ' ' || lanname, ', ' ORDER BY sig) FROM t_pp_cat_old))
        UNION ALL
        SELECT 3, 'timing', o.metric, format('old %s, new %s', o.val, n.val)
          FROM t_pp_timing o JOIN t_pp_timing n ON n.metric = o.metric AND n.phase = 'new'
         WHERE o.phase = 'old') x
 ORDER BY ord, name, detail;

ROLLBACK;
