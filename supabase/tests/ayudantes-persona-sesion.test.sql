-- Person-id helpers bound to the session: es_superadmin, puede_ver_grupo,
-- es_director_de_grupo and es_lider_de_grupo (migration 20261003120000) answer
-- only about the person in the session unless the caller is service_role, and
-- otherwise return exactly what the live functions return.
--
-- Covers:
--   a. Every person: for every usuarios row with an auth id, in that person's
--      own session (role authenticated, both claim settings), the four answers
--      for the person's own usuarios.id are the same before and after the
--      migration, over a sample of groups: the groups the person belongs to or
--      directs (segmento_lideres, director_etapa_grupos,
--      director_general_segmentos) plus 10 other groups chosen per person. The
--      admin, the general director, the director de etapa and the leader also
--      in each claim format on its own. Setup cases prove the sample holds true
--      and false answers of all four functions.
--   b. Everybody else, after the migration, on the same samples: the leader's
--      session asking about every other person and no session asking about
--      every person get false from all four; service_role asking about every
--      person gets that person's own answers from before.
--   c. Edge cases on a fixed set of groups (one the leader leads, one the
--      director de etapa directs, another one and a NULL group): no session;
--      the leader asking about the admin (each claim format), the admin about
--      the leader, the general director about the director de etapa, a session
--      with no usuarios row asking about the leader; a NULL argument; a session
--      passing its own auth id (what 19 policies and the app do today); own
--      sessions; service_role (each claim format) about the admin, the leader,
--      the director de etapa, an unknown id and NULL. After the migration a
--      foreign id or no session gets false everywhere and the rest is as
--      before. Before it, while the live functions have no guard, a foreign id
--      must get the real answer, the one service_role gets: that is the RED.
--      When the suite runs again after the apply, the live functions already
--      answer false there, and the setup case expects that instead.
--   d. Catalog: language plpgsql, definer, search_path pinned to public,
--      volatility, not strict, signature, result, cost, owner and ACL as
--      before; the guard is in all four bodies; every line of the live body of
--      puede_ver_grupo is still in it; anon cannot execute, authenticated and
--      service_role can, PUBLIC cannot.
--   e. RLS photo: as the admin, the general director, the director de etapa
--      and the leader, the count and md5 of the ordered ids visible in grupos,
--      grupo_miembros, solicitudes_grupo, usuarios and
--      historial_movimientos_grupo are the same before and after. A setup case
--      proves the admin sees every row of grupos, grupo_miembros and
--      solicitudes_grupo, the paths that call puede_ver_grupo and es_superadmin
--      with the admin's own id.
--   f. Timing (informational, never a failure): cost per call of each helper
--      for the leader's and the admin's own id, 200 calls inside one statement
--      the way a policy calls them per row (best of three after a warm-up); and
--      the time of count(*) of grupos and grupo_miembros under RLS per
--      identity, old and new: the RLS photo statement of e (count(*) plus the
--      md5 of the ids), one run each, because grupos under RLS takes seconds
--      per identity on staging and repeated runs would not fit the tool's time
--      limit.
--
-- Every probe call goes through EXECUTE, so it resolves the functions afresh
-- and the calls after the migration block run the new bodies.
--
-- The migration is copied byte for byte between the two marker comments below.
--
-- Run against STAGING inside BEGIN...ROLLBACK: nothing here is kept and no row
-- is written outside temporary tables. The last statement returns the failing
-- cases (kind 'failure', none expected; at most five per case plus a count),
-- then the summary rows and the timing rows (kind 'summary' and 'timing'),
-- because the MCP tool returns only the last result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ap_failures (case_name text, detail text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ap_failures(case_name, detail) VALUES (p_case, p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.has_role(p_uid uuid, p_role text)
RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuario_roles ur
                   JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                  WHERE ur.usuario_id = p_uid AND rs.nombre_interno = p_role);
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

-- The four answers for one argument and each group of a list, in list order:
-- "superadmin <bool>, ver <bool>, director <bool>, lider <bool>", or the error.
-- es_superadmin takes no group, so its answer repeats on every row.
CREATE OR REPLACE FUNCTION pg_temp.probe(p_mode text, p_session uuid, p_arg uuid, p_groups uuid[])
RETURNS TABLE (ord int, grupo uuid, val text) LANGUAGE plpgsql AS $$
DECLARE
  v_sa boolean;
  v_ver boolean;
  v_dir boolean;
  v_lid boolean;
BEGIN
  PERFORM pg_temp.set_session(p_mode, p_session);
  PERFORM pg_temp.as_role(p_mode);
  FOR i IN 1 .. coalesce(array_length(p_groups, 1), 0) LOOP
    ord := i;
    grupo := p_groups[i];
    BEGIN
      EXECUTE 'SELECT public.es_superadmin($1), public.puede_ver_grupo($1, $2), '
              || 'public.es_director_de_grupo($1, $2), public.es_lider_de_grupo($1, $2)'
         INTO v_sa, v_ver, v_dir, v_lid USING p_arg, p_groups[i];
      val := format('superadmin %s, ver %s, director %s, lider %s',
                    coalesce(v_sa::text, 'NULL'), coalesce(v_ver::text, 'NULL'),
                    coalesce(v_dir::text, 'NULL'), coalesce(v_lid::text, 'NULL'));
    EXCEPTION
      WHEN OTHERS THEN
        val := 'ERR ' || SQLSTATE || ' ' || SQLERRM;
    END;
    RETURN NEXT;
  END LOOP;
  RESET ROLE;
  PERFORM pg_temp.set_session('nobody', NULL);
END;
$$;

-- The answer of all four functions when the guard turns somebody away.
CREATE OR REPLACE FUNCTION pg_temp.neutral()
RETURNS text LANGUAGE sql AS $$
  SELECT 'superadmin false, ver false, director false, lider false';
$$;

-- RLS: what a person sees through the policies (role authenticated, with
-- claims): "count:md5 of the ordered ids", and how long the statement took
-- (informational).
CREATE OR REPLACE FUNCTION pg_temp.photo(p_who uuid, p_tbl text, OUT val text, OUT ms numeric)
LANGUAGE plpgsql AS $$
DECLARE
  t0 timestamptz;
BEGIN
  PERFORM pg_temp.set_session('user', p_who);
  SET LOCAL ROLE authenticated;
  t0 := clock_timestamp();
  BEGIN
    EXECUTE format('SELECT count(*)::text || '':'' || coalesce(md5(string_agg(id::text, '','' ORDER BY id)), ''-'') FROM public.%I', p_tbl) INTO val;
  EXCEPTION
    WHEN OTHERS THEN val := 'ERR ' || SQLSTATE || ' ' || SQLERRM;
  END;
  ms := round((extract(epoch FROM clock_timestamp() - t0) * 1000)::numeric, 1);
  RESET ROLE;
  PERFORM pg_temp.set_session('nobody', NULL);
END;
$$;

-- Timing (informational). Milliseconds per call of p_fn for p_arg, 200 calls
-- inside one statement as a policy makes them, best of three after a warm-up.
CREATE OR REPLACE FUNCTION pg_temp.ms_per_call(p_fn text, p_who uuid, p_arg uuid, p_grupo uuid, p_n int)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE
  q text;
  v text;
  t0 timestamptz;
  ms numeric;
  best numeric;
BEGIN
  q := format('SELECT count(%s)::text FROM generate_series(1, %s)',
              CASE WHEN p_fn = 'es_superadmin' THEN 'public.es_superadmin($1)'
                   ELSE format('public.%I($1, $2)', p_fn) END,
              p_n);
  PERFORM pg_temp.set_session('user', p_who);
  SET LOCAL ROLE authenticated;
  EXECUTE q INTO v USING p_arg, p_grupo;
  FOR i IN 1 .. 3 LOOP
    t0 := clock_timestamp();
    EXECUTE q INTO v USING p_arg, p_grupo;
    ms := extract(epoch FROM clock_timestamp() - t0) * 1000;
    best := least(coalesce(best, ms), ms);
  END LOOP;
  RESET ROLE;
  PERFORM pg_temp.set_session('nobody', NULL);
  RETURN round(best / p_n, 4);
END;
$$;

-- ---------------------------------------------------------------------------
-- People and context.
-- ---------------------------------------------------------------------------
-- auth: the session id; uid: the argument passed to the four functions.
CREATE TEMP TABLE t_ap_who (who text PRIMARY KEY, auth uuid, uid uuid) ON COMMIT DROP;

INSERT INTO t_ap_who(who, auth, uid)
SELECT 'admin', u.auth_id, u.id FROM public.usuarios u
 WHERE '5df3b990-af3d-49b5-a061-025bc3598983'::uuid = u.auth_id;
INSERT INTO t_ap_who(who, auth, uid)
SELECT 'dg', u.auth_id, u.id FROM public.usuarios u
 WHERE '9f23ae7c-7008-4bd6-b449-89c326f8d1af'::uuid = u.auth_id;
INSERT INTO t_ap_who(who, auth, uid)
SELECT 'de', u.auth_id, u.id FROM public.usuarios u
 WHERE 'ee0efdea-2d85-479a-88ab-85720903aa2a'::uuid = u.auth_id;
INSERT INTO t_ap_who(who, auth, uid)
SELECT 'leader', u.auth_id, u.id FROM public.usuarios u
 WHERE '2efa6e21-bbf0-4fb3-a8fa-96e16b3e881d'::uuid = u.auth_id;

-- A session whose auth id is in no usuarios row, and an id that is nobody's
-- usuarios.id (both fixed for the whole run).
INSERT INTO t_ap_who(who, auth, uid) VALUES ('unknown', gen_random_uuid(), gen_random_uuid());

-- The admin's and the leader's auth ids passed where usuarios.id is expected,
-- what the 19 policies and the app do with auth.uid().
INSERT INTO t_ap_who(who, auth, uid)
SELECT w.who || '_auth', w.auth, w.auth FROM t_ap_who w WHERE w.who IN ('admin', 'leader');

-- Setup checks: every person resolved and holding the role the cases rely on.
SELECT pg_temp.fail('setup', 'person not found: ' || w.who)
  FROM (VALUES ('admin'), ('dg'), ('de'), ('leader')) w(who)
 WHERE (SELECT uid FROM t_ap_who t WHERE t.who = w.who) IS NULL;

SELECT pg_temp.fail('setup', format('%s does not hold the role %s', c.who, c.rol))
  FROM (VALUES ('admin', 'admin'), ('dg', 'director-general'), ('de', 'director-etapa'), ('leader', 'lider')) c(who, rol)
 WHERE NOT pg_temp.has_role((SELECT uid FROM t_ap_who WHERE who = c.who), c.rol);

SELECT pg_temp.fail('setup', 'the auth id of ' || w.who || ' equals its usuarios.id, so it is not a foreign id')
  FROM t_ap_who w WHERE w.who IN ('admin', 'leader') AND w.auth = w.uid;

SELECT pg_temp.fail('setup', 'the unknown ids belong to somebody')
 WHERE EXISTS (SELECT 1 FROM public.usuarios u, t_ap_who w
                WHERE w.who = 'unknown' AND (u.auth_id = w.auth OR u.id = w.uid));

-- Edge groups: one the leader leads, one the director de etapa directs (an
-- assigned one first), another one and a NULL group.
CREATE TEMP TABLE t_ap_edge_groups (ord int PRIMARY KEY, label text, grupo uuid) ON COMMIT DROP;
INSERT INTO t_ap_edge_groups(ord, label, grupo)
SELECT 1, 'led by the leader',
       (SELECT gm.grupo_id FROM public.grupo_miembros gm
         WHERE gm.usuario_id = (SELECT uid FROM t_ap_who WHERE who = 'leader')
           AND gm.rol IN ('Líder', 'Colíder')
         ORDER BY gm.grupo_id LIMIT 1);
INSERT INTO t_ap_edge_groups(ord, label, grupo)
SELECT 2, 'directed by the de',
       (SELECT g.id FROM public.grupos g
          JOIN public.segmento_lideres sl ON sl.segmento_id = g.segmento_id
         WHERE sl.usuario_id = (SELECT uid FROM t_ap_who WHERE who = 'de')
           AND sl.tipo_lider IN ('director_general', 'director_etapa')
         ORDER BY EXISTS (SELECT 1 FROM public.director_etapa_grupos deg
                           WHERE deg.grupo_id = g.id AND deg.director_etapa_id = sl.id) DESC, g.id
         LIMIT 1);
INSERT INTO t_ap_edge_groups(ord, label, grupo)
SELECT 3, 'another group',
       (SELECT g.id FROM public.grupos g
         WHERE g.id NOT IN (SELECT e.grupo FROM t_ap_edge_groups e WHERE e.grupo IS NOT NULL)
           AND NOT EXISTS (SELECT 1 FROM public.grupo_miembros gm
                            WHERE gm.grupo_id = g.id
                              AND gm.usuario_id IN (SELECT uid FROM t_ap_who WHERE who IN ('admin', 'dg', 'de', 'leader')))
         ORDER BY g.id LIMIT 1);
INSERT INTO t_ap_edge_groups(ord, label, grupo) VALUES (4, 'NULL group', NULL);

SELECT pg_temp.fail('setup', 'edge group not found: ' || label)
  FROM t_ap_edge_groups WHERE ord < 4 AND grupo IS NULL;

-- What all four answer on every edge group when the guard turns somebody away.
CREATE OR REPLACE FUNCTION pg_temp.neutral_edge()
RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(g.label || ': ' || pg_temp.neutral(), '; ' ORDER BY g.ord) FROM t_ap_edge_groups g;
$$;

-- Edge cases: session mode, the session's person, the argument's person (NULL
-- = a NULL argument), and the kind: 'foreign' (after the migration: false
-- everywhere; before it: the answer of the oracle case, or false when the
-- guard is already live), 'neutral' (false everywhere before and after) and
-- 'same' (after = before).
CREATE TEMP TABLE t_ap_edge (case_name text PRIMARY KEY, mode text, s_who text, a_who text, kind text, oracle text) ON COMMIT DROP;
INSERT INTO t_ap_edge(case_name, mode, s_who, a_who, kind, oracle) VALUES
  ('nobody asks about the admin',            'nobody',         NULL,      'admin',       'foreign', 'service asks about the admin'),
  ('nobody asks about the leader',           'nobody',         NULL,      'leader',      'foreign', 'service asks about the leader'),
  ('nobody, NULL argument',                  'nobody',         NULL,      NULL,          'neutral', NULL),
  ('leader asks about the admin',            'user',           'leader',  'admin',       'foreign', 'service asks about the admin'),
  ('leader asks about the admin (legacy)',   'user_legacy',    'leader',  'admin',       'foreign', 'service asks about the admin'),
  ('leader asks about the admin (json)',     'user_json',      'leader',  'admin',       'foreign', 'service asks about the admin'),
  ('admin asks about the leader',            'user',           'admin',   'leader',      'foreign', 'service asks about the leader'),
  ('dg asks about the de',                   'user',           'dg',      'de',          'foreign', 'service asks about the de'),
  ('no usuarios row asks about the leader',  'user',           'unknown', 'leader',      'foreign', 'service asks about the leader'),
  ('leader, NULL argument',                  'user',           'leader',  NULL,          'neutral', NULL),
  ('no usuarios row, NULL argument',         'user',           'unknown', NULL,          'neutral', NULL),
  ('admin passes its own auth id',           'user',           'admin',   'admin_auth',  'neutral', NULL),
  ('leader passes its own auth id',          'user',           'leader',  'leader_auth', 'neutral', NULL),
  ('admin own',                              'user',           'admin',   'admin',       'same',    NULL),
  ('de own',                                 'user',           'de',      'de',          'same',    NULL),
  ('leader own (legacy)',                    'user_legacy',    'leader',  'leader',      'same',    NULL),
  ('leader own (json)',                      'user_json',      'leader',  'leader',      'same',    NULL),
  ('service asks about the admin',           'service',        NULL,      'admin',       'same',    NULL),
  ('service asks about the admin (legacy)',  'service_legacy', NULL,      'admin',       'same',    NULL),
  ('service asks about the admin (json)',    'service_json',   NULL,      'admin',       'same',    NULL),
  ('service asks about the leader',          'service',        NULL,      'leader',      'same',    NULL),
  ('service asks about the de',              'service',        NULL,      'de',          'same',    NULL),
  ('service asks about an unknown id',       'service',        NULL,      'unknown',     'neutral', NULL),
  ('service, NULL argument',                 'service',        NULL,      NULL,          'neutral', NULL);

-- One edge case as text: "<group label>: <answers>" per edge group, in order.
CREATE OR REPLACE FUNCTION pg_temp.run_edge(p_case text)
RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(g.label || ': ' || r.val, '; ' ORDER BY r.ord)
    FROM t_ap_edge e
   CROSS JOIN LATERAL pg_temp.probe(e.mode,
                                    (SELECT w.auth FROM t_ap_who w WHERE w.who = e.s_who),
                                    (SELECT w.uid FROM t_ap_who w WHERE w.who = e.a_who),
                                    (SELECT array_agg(eg.grupo ORDER BY eg.ord) FROM t_ap_edge_groups eg)) r
    JOIN t_ap_edge_groups g ON g.ord = r.ord
   WHERE e.case_name = p_case;
$$;

-- Every person with an auth id, and the groups each one is asked about: the
-- groups they belong to or direct, plus 10 other groups chosen per person.
CREATE TEMP TABLE t_ap_people (uid uuid PRIMARY KEY, auth uuid NOT NULL) ON COMMIT DROP;
INSERT INTO t_ap_people(uid, auth)
SELECT u.id, u.auth_id FROM public.usuarios u WHERE u.auth_id IS NOT NULL;

CREATE TEMP TABLE t_ap_sample (uid uuid, grupo uuid, PRIMARY KEY (uid, grupo)) ON COMMIT DROP;
INSERT INTO t_ap_sample(uid, grupo)
SELECT p.uid, o.grupo
  FROM t_ap_people p
 CROSS JOIN LATERAL (
         SELECT gm.grupo_id FROM public.grupo_miembros gm WHERE gm.usuario_id = p.uid
         UNION
         SELECT g.id FROM public.grupos g
           JOIN public.segmento_lideres sl ON sl.segmento_id = g.segmento_id
          WHERE sl.usuario_id = p.uid
         UNION
         SELECT deg.grupo_id FROM public.director_etapa_grupos deg
           JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
          WHERE sl.usuario_id = p.uid
         UNION
         SELECT g.id FROM public.grupos g
           JOIN public.director_general_segmentos dgs ON dgs.segmento_id = g.segmento_id
          WHERE dgs.usuario_id = p.uid) o(grupo)
 WHERE o.grupo IS NOT NULL;

INSERT INTO t_ap_sample(uid, grupo)
SELECT p.uid, x.id
  FROM t_ap_people p
 CROSS JOIN LATERAL (SELECT g.id FROM public.grupos g
                      WHERE NOT EXISTS (SELECT 1 FROM t_ap_sample s WHERE s.uid = p.uid AND s.grupo = g.id)
                      ORDER BY md5(g.id::text || p.uid::text)
                      LIMIT 10) x;

CREATE TEMP TABLE t_ap_groups ON COMMIT DROP AS
SELECT p.uid, p.auth, array_agg(s.grupo ORDER BY s.grupo) AS groups
  FROM t_ap_people p JOIN t_ap_sample s ON s.uid = p.uid
 GROUP BY p.uid, p.auth;

-- ---------------------------------------------------------------------------
-- BEFORE the migration, from the live text.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_ap_fns (sig text PRIMARY KEY, volatility "char") ON COMMIT DROP;
INSERT INTO t_ap_fns(sig, volatility) VALUES
  ('public.es_superadmin(uuid)', 's'),
  ('public.puede_ver_grupo(uuid,uuid)', 'v'),
  ('public.es_director_de_grupo(uuid,uuid)', 'v'),
  ('public.es_lider_de_grupo(uuid,uuid)', 'v');

-- The session-person guard of the migration, as it reads in the bodies.
CREATE OR REPLACE FUNCTION pg_temp.has_guard(p_src text)
RETURNS boolean LANGUAGE sql AS $$
  SELECT strpos(p_src, 'v_request_role text := auth.role()') > 0
     AND strpos(p_src, 'coalesce(v_request_role, '''') <> ''service_role''') > 0
     AND strpos(p_src, 'auth.uid() IS NULL') > 0
     AND strpos(p_src, 'IS DISTINCT FROM (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid())') > 0;
$$;

-- Everything of the catalog row that must not change (language and config may).
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
           'cost=' || p.procost::text,
           'acl=' || coalesce(p.proacl::text, 'NULL'))
    FROM pg_proc p
   WHERE p.oid = p_sig::regprocedure;
$$;

CREATE TEMP TABLE t_ap_cat_old ON COMMIT DROP AS
SELECT f.sig, pg_temp.cat_of(f.sig) AS cat, l.lanname, p.prosrc AS src, pg_temp.has_guard(p.prosrc) AS guarded
  FROM t_ap_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure JOIN pg_language l ON l.oid = p.prolang;

-- The guard is in no live body (before the apply) or in all four (a run after
-- it); anything in between is a broken state.
SELECT pg_temp.fail('setup', 'the guard is live in some of the four functions only: '
                    || string_agg(sig, ', ' ORDER BY sig) FILTER (WHERE guarded))
  FROM t_ap_cat_old
HAVING count(*) FILTER (WHERE guarded) NOT IN (0, 4);

CREATE OR REPLACE FUNCTION pg_temp.guard_live()
RETURNS boolean LANGUAGE sql AS $$
  SELECT bool_and(guarded) FROM t_ap_cat_old;
$$;

-- a. Every person, own session.
CREATE TEMP TABLE t_ap_eq_old (uid uuid, grupo uuid, val text, PRIMARY KEY (uid, grupo)) ON COMMIT DROP;
INSERT INTO t_ap_eq_old(uid, grupo, val)
SELECT g.uid, r.grupo, r.val
  FROM t_ap_groups g
 CROSS JOIN LATERAL pg_temp.probe('user', g.auth, g.uid, g.groups) r;

SELECT pg_temp.fail('setup', format('%s live probes raised, e.g. %s', count(*), min(val)))
  FROM t_ap_eq_old WHERE val LIKE 'ERR%'
HAVING count(*) > 0;

-- The live answers must hold both values of every function, otherwise equality
-- proves little.
SELECT pg_temp.fail('setup', 'no own answer with ' || m.marker)
  FROM (VALUES ('superadmin true'), ('superadmin false'), ('ver true'), ('ver false'),
               ('director true'), ('director false'), ('lider true'), ('lider false')) m(marker)
 WHERE NOT EXISTS (SELECT 1 FROM t_ap_eq_old o WHERE strpos(o.val, m.marker) > 0);

-- c. Edge cases.
CREATE TEMP TABLE t_ap_edge_old (case_name text PRIMARY KEY, val text) ON COMMIT DROP;
INSERT INTO t_ap_edge_old(case_name, val)
SELECT e.case_name, pg_temp.run_edge(e.case_name) FROM t_ap_edge e;

SELECT pg_temp.fail('setup', format('live %s raised: %s', case_name, val))
  FROM t_ap_edge_old WHERE val LIKE '%ERR%';

-- The oracles hold real answers, so the comparisons are not trivial.
SELECT pg_temp.fail('setup', format('live %s does not match %s: %s', c.case_name, c.pattern, o.val))
  FROM (VALUES ('service asks about the admin',  'led by the leader: superadmin true, ver true'),
               ('service asks about the leader', 'led by the leader: [^;]*lider true'),
               ('service asks about the de',     'directed by the de: [^;]*director true')) c(case_name, pattern)
  JOIN t_ap_edge_old o USING (case_name)
 WHERE o.val !~ c.pattern;

SELECT pg_temp.fail('setup', format('live %s: expected false everywhere, got %s', e.case_name, o.val))
  FROM t_ap_edge e JOIN t_ap_edge_old o USING (case_name)
 WHERE e.kind = 'neutral' AND o.val IS DISTINCT FROM pg_temp.neutral_edge();

-- The RED: without the guard a foreign id or no session gets the real answer.
-- On a run after the apply the guard is live and they get false already.
SELECT pg_temp.fail('setup', format('live %s: expected %s, got %s', e.case_name,
                    CASE WHEN pg_temp.guard_live() THEN 'false everywhere' ELSE 'the answer of ' || e.oracle || ': ' || r.val END,
                    o.val))
  FROM t_ap_edge e
  JOIN t_ap_edge_old o USING (case_name)
  JOIN t_ap_edge_old r ON r.case_name = e.oracle
 WHERE e.kind = 'foreign'
   AND o.val IS DISTINCT FROM CASE WHEN pg_temp.guard_live() THEN pg_temp.neutral_edge() ELSE r.val END;

-- e. RLS photo.
CREATE TEMP TABLE t_ap_tbl (tbl text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO t_ap_tbl(tbl) VALUES
  ('grupos'), ('grupo_miembros'), ('solicitudes_grupo'), ('usuarios'), ('historial_movimientos_grupo');

CREATE TEMP TABLE t_ap_rls_old (tbl text, who text, val text, ms numeric, PRIMARY KEY (tbl, who)) ON COMMIT DROP;
INSERT INTO t_ap_rls_old(tbl, who, val, ms)
SELECT t.tbl, w.who, ph.val, ph.ms
  FROM t_ap_tbl t CROSS JOIN t_ap_who w
 CROSS JOIN LATERAL pg_temp.photo(w.auth, t.tbl) ph
 WHERE w.who IN ('admin', 'dg', 'de', 'leader');

SELECT pg_temp.fail('setup', format('RLS photo of %s for %s failed before the migration: %s', tbl, who, val))
  FROM t_ap_rls_old WHERE val LIKE 'ERR%';

-- The admin reaches every row through puede_ver_grupo and es_superadmin with
-- the admin's own id: those paths must keep working.
SELECT pg_temp.fail('setup', format('the admin sees %s rows of %s out of %s', split_part(o.val, ':', 1), t.tbl, t.total))
  FROM (VALUES ('grupos',            (SELECT count(*) FROM public.grupos)),
               ('grupo_miembros',    (SELECT count(*) FROM public.grupo_miembros)),
               ('solicitudes_grupo', (SELECT count(*) FROM public.solicitudes_grupo))) t(tbl, total)
  JOIN t_ap_rls_old o ON o.tbl = t.tbl AND o.who = 'admin'
 WHERE split_part(o.val, ':', 1) IS DISTINCT FROM t.total::text;

-- f. Timing before.
CREATE TEMP TABLE t_ap_timing (metric text, phase text, val text, PRIMARY KEY (metric, phase)) ON COMMIT DROP;
INSERT INTO t_ap_timing(metric, phase, val)
SELECT format('%s x200 %s', f.fn, w.who), 'old',
       pg_temp.ms_per_call(f.fn, w.auth, w.uid, (SELECT grupo FROM t_ap_edge_groups WHERE ord = 1), 200) || ' ms/call'
  FROM (VALUES ('es_superadmin'), ('puede_ver_grupo'), ('es_director_de_grupo'), ('es_lider_de_grupo')) f(fn)
 CROSS JOIN t_ap_who w
 WHERE w.who IN ('leader', 'admin');

-- >>> BEGIN migration 20261003120000_ayudantes_persona_sesion.sql (byte-identical copy)
-- Person-id helpers answer only about the session person (security phase 3,
-- batch L2).
--
-- What: es_superadmin, puede_ver_grupo, es_director_de_grupo and
-- es_lider_de_grupo take a person's internal id, usuarios.id (es_superadmin
-- names it p_auth_uid but compares it with usuario_roles.usuario_id). Unless
-- the request role is service_role, the argument must now be the usuarios.id
-- of the session person, the row whose auth_id is auth.uid(); with no session
-- or any other id they return false. Otherwise they return exactly what they
-- returned before.
--
-- Why: every signed-in person can execute them, and they answered about
-- anybody: whether a person is admin or pastor, and which groups somebody may
-- see, directs or leads.
--
-- Callers (staging pg_policy, pg_proc and pg_views, and the app, 2026-10-02).
-- None passes another person's id on a path that works today:
--   es_superadmin
--     * solicitudes_grupo: solicitudes_select and solicitudes_update pass
--       get_my_internal_id(), the session person.
--     * contar_solicitudes_pendientes and es_director_general_de_grupo pass the
--       usuarios.id of their p_auth_id, which their own guard pins to
--       auth.uid() unless the caller is service_role.
--     * 19 policies pass auth.uid(), a session id where the function expects
--       usuarios.id: audit_grupo_miembros (1), campus (3), campus_localidades
--       (3), configuracion_grupos_vida (1), director_general_directores (4),
--       director_general_segmentos (1), tipos_grupo (2), usuario_campus (4).
--       So do lib/actions/geocodificar.actions.ts and
--       app/(auth)/configuracion/grupos-vida/page.tsx (rpc with user.id).
--       They are always false today and stay false: a session id gets past
--       the guard only on a row whose id equals its own auth_id, and there
--       the answer is the same as before (2 such rows on staging, without
--       roles; no row's id equals another row's auth_id). Batch L5 moves them
--       to the internal id.
--   puede_ver_grupo
--     * grupos: grupos_select_scoped_authenticated passes actor.id, the
--       usuarios row of auth.uid().
--     * grupo_miembros: "Los usuarios pueden ver los miembros de los grupos
--       permitidos" passes get_my_internal_id().
--     * obtener_auditoria_miembros, obtener_detalle_grupo,
--       obtener_eventos_con_notas, obtener_grupos_para_usuario,
--       obtener_ranking_asistencia_grupo, obtener_reporte_asistencia_grupo and
--       puede_gestionar_miembros pass the usuarios.id of their p_auth_id,
--       pinned to auth.uid() by their guard unless service_role.
--   es_director_de_grupo
--     * grupo_miembros: "Solo directores pueden gestionar miembros en grupos"
--       (INSERT, UPDATE, DELETE) pass get_my_internal_id().
--     * puede_ver_usuario passes its p_viewer_id, which both usuarios
--       policies fill with auth.uid(): the session-id case above, unchanged.
--   es_lider_de_grupo
--     * puede_ver_usuario only, as above.
--   No view calls them. service_role skips the guard, as in the guarded
--   functions of phase 2, so the service client keeps its answers.
--
-- What changes in the bodies:
--   * LANGUAGE plpgsql with the guard as the first IF, the form of
--     tiene_rol_de_liderazgo in 20261002150000. puede_ver_grupo already was
--     plpgsql: after the guard its body is the live one, line for line.
--   * The session person is read inline, through the unique index
--     unique_auth_id_nonnull. get_my_internal_id() does the same lookup and is
--     safe to call (definer, search_path pinned, reads only auth.uid()); as the
--     guard it measured about 10% cheaper on staging (0.028 against 0.032 ms
--     per call of es_lider_de_grupo: an IF without a subquery runs as a plpgsql
--     simple expression). But it is VOLATILE: es_superadmin is STABLE and would
--     take a new snapshot on every call, which 20261002150000 avoided for
--     tiene_rol_de_liderazgo. Inlining also keeps the four helpers free of a
--     function outside this batch.
--   * es_superadmin and puede_ver_grupo get search_path pinned to public (they
--     had none); es_superadmin's tables are now schema-qualified.
--   * A NULL argument still returns false: it matches no row.
--   * Cost: the guard adds one query per call. Prototypes on staging, 2000
--     calls in one statement as a policy makes them: es_lider_de_grupo 0.010
--     to 0.032 ms per call, es_superadmin 0.015 to 0.039 ms (part of it is
--     plpgsql against the old sql bodies). The suite
--     ayudantes-persona-sesion.test.sql prints old and new for all four.
--
-- What does not change: signatures, parameter names, return type, the definer
-- flag, owner, volatility (es_superadmin STABLE, the other three VOLATILE), not
-- STRICT, and grants (restated at the end, today's state: no anon, no PUBLIC).
--
-- Rollback: puede_ver_grupo from 20260929150000_gdv_dg_regla_en_grupos.sql (the
-- live body is byte-identical). The other three were never in a migration of
-- this repository; recreate them with CREATE OR REPLACE as LANGUAGE sql,
-- definer, with these bodies:
--   es_superadmin(p_auth_uid uuid), STABLE, no search_path:
--     SELECT EXISTS (SELECT 1 FROM usuario_roles ur
--       JOIN roles_sistema rs ON rs.id = ur.rol_id
--       WHERE ur.usuario_id = p_auth_uid AND rs.nombre_interno IN ('admin', 'pastor'));
--   es_director_de_grupo(p_user_id uuid, p_grupo_id uuid), VOLATILE,
--   search_path public:
--     SELECT EXISTS (SELECT 1 FROM public.grupos g
--       JOIN public.segmento_lideres sl ON g.segmento_id = sl.segmento_id
--       WHERE g.id = p_grupo_id AND sl.usuario_id = p_user_id
--         AND sl.tipo_lider IN ('director_general', 'director_etapa'));
--   es_lider_de_grupo(p_user_id uuid, p_grupo_id uuid), VOLATILE,
--   search_path public:
--     SELECT EXISTS (SELECT 1 FROM public.grupo_miembros
--       WHERE usuario_id = p_user_id AND grupo_id = p_grupo_id
--         AND rol IN ('Líder', 'Colíder'));

CREATE OR REPLACE FUNCTION public.es_superadmin(p_auth_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- Only about the person in the session (the argument is usuarios.id);
  -- only service_role may ask about somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL
          OR p_auth_uid IS DISTINCT FROM (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid())) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = p_auth_uid
      AND rs.nombre_interno IN ('admin', 'pastor')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.puede_ver_grupo(p_user_id uuid, p_grupo_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
  v_is_superior boolean := false;
  v_is_dg boolean := false;
  v_is_director_etapa boolean := false;
  v_is_grupo_futuro boolean := false;
BEGIN
  -- Only about the person in the session; only service_role may ask about
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL
          OR p_user_id IS DISTINCT FROM (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid())) THEN
    RETURN false;
  END IF;

  IF p_user_id IS NULL OR p_grupo_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Admin/Pastor: acceso total (incluye grupos inactivos/futuros)
  SELECT TRUE INTO v_is_superior
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno IN ('admin','pastor')
  LIMIT 1;

  IF v_is_superior THEN
    RETURN TRUE;
  END IF;

  -- Director General: acceso solo a los grupos que le da la regla única (gdv_dg_ve_grupo)
  SELECT TRUE INTO v_is_dg
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno = 'director-general'
  LIMIT 1;

  IF v_is_dg THEN
    IF public.gdv_dg_ve_grupo(p_user_id, p_grupo_id) THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  -- Director de Etapa: acceso si está asignado explícitamente al grupo (incluye futuros)
  SELECT TRUE INTO v_is_director_etapa
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno = 'director-etapa'
  LIMIT 1;

  IF v_is_director_etapa THEN
    IF EXISTS (
      SELECT 1
      FROM public.director_etapa_grupos deg
      JOIN public.segmento_lideres sl ON deg.director_etapa_id = sl.id
      WHERE deg.grupo_id = p_grupo_id
        AND sl.usuario_id = p_user_id
        AND sl.tipo_lider = 'director_etapa'
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Líder/Colíder/Miembro: solo si pertenece al grupo Y el grupo NO es futuro
  SELECT EXISTS (
    SELECT 1 FROM public.grupos g
    JOIN public.temporadas t ON t.id = g.temporada_id
    WHERE g.id = p_grupo_id AND t.fecha_inicio > CURRENT_DATE
  ) INTO v_is_grupo_futuro;

  IF v_is_grupo_futuro THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.grupos g
      JOIN public.temporadas t ON t.id = g.temporada_id
      WHERE g.id = p_grupo_id
        AND g.activo IS TRUE
        AND t.activa IS TRUE
    ) THEN
      RETURN FALSE;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.grupo_miembros gm
    WHERE gm.grupo_id = p_grupo_id AND gm.usuario_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.es_director_de_grupo(p_user_id uuid, p_grupo_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- Only about the person in the session; only service_role may ask about
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL
          OR p_user_id IS DISTINCT FROM (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid())) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.grupos g
    JOIN public.segmento_lideres sl ON g.segmento_id = sl.segmento_id
    WHERE g.id = p_grupo_id
      AND sl.usuario_id = p_user_id
      AND sl.tipo_lider IN ('director_general', 'director_etapa')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.es_lider_de_grupo(p_user_id uuid, p_grupo_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- Only about the person in the session; only service_role may ask about
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL
          OR p_user_id IS DISTINCT FROM (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid())) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm
    WHERE gm.usuario_id = p_user_id
      AND gm.grupo_id = p_grupo_id
      AND gm.rol IN ('Líder', 'Colíder')
  );
END;
$function$;

-- Execution rights: signed-in people and the service client only (today's state).
REVOKE ALL ON FUNCTION public.es_superadmin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_ver_grupo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.es_director_de_grupo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.es_lider_de_grupo(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.es_superadmin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_ver_grupo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.es_director_de_grupo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.es_lider_de_grupo(uuid, uuid) TO authenticated, service_role;
-- <<< END migration 20261003120000_ayudantes_persona_sesion.sql

-- ---------------------------------------------------------------------------
-- AFTER the migration.
-- ---------------------------------------------------------------------------

-- a. Every person, own session: the same as before (and nobody lost or gained).
CREATE TEMP TABLE t_ap_eq_new (uid uuid, grupo uuid, val text, PRIMARY KEY (uid, grupo)) ON COMMIT DROP;
INSERT INTO t_ap_eq_new(uid, grupo, val)
SELECT g.uid, r.grupo, r.val
  FROM t_ap_groups g
 CROSS JOIN LATERAL pg_temp.probe('user', g.auth, g.uid, g.groups) r;

SELECT pg_temp.fail('a own', format('%s, group %s: before %s, after %s',
                    coalesce(o.uid, n.uid), coalesce(o.grupo, n.grupo), coalesce(o.val, 'missing'), coalesce(n.val, 'missing')))
  FROM t_ap_eq_old o FULL JOIN t_ap_eq_new n ON n.uid = o.uid AND n.grupo = o.grupo
 WHERE o.val IS DISTINCT FROM n.val;

SELECT pg_temp.fail('a own', 'the set of people changed: before ' || (SELECT count(*) FROM t_ap_people)
                    || ', now ' || (SELECT count(*) FROM public.usuarios u WHERE u.auth_id IS NOT NULL))
 WHERE (SELECT count(*) FROM t_ap_people) <> (SELECT count(*) FROM public.usuarios u WHERE u.auth_id IS NOT NULL);

-- The four identities in each claim format on its own.
SELECT pg_temp.fail('a own', format('%s (%s), group %s: before %s, after %s', w.who, m.mode, r.grupo, o.val, r.val))
  FROM t_ap_who w
  JOIN t_ap_groups g ON g.uid = w.uid
 CROSS JOIN (VALUES ('user_legacy'), ('user_json')) m(mode)
 CROSS JOIN LATERAL pg_temp.probe(m.mode, g.auth, g.uid, g.groups) r
  LEFT JOIN t_ap_eq_old o ON o.uid = g.uid AND o.grupo = r.grupo
 WHERE w.who IN ('admin', 'dg', 'de', 'leader')
   AND r.val IS DISTINCT FROM o.val;

-- b. Everybody else. The leader's session asks about every other person: false.
SELECT pg_temp.fail('b foreign', format('the leader asks about %s, group %s: %s', g.uid, r.grupo, r.val))
  FROM t_ap_groups g
 CROSS JOIN LATERAL pg_temp.probe('user', (SELECT auth FROM t_ap_who WHERE who = 'leader'), g.uid, g.groups) r
 WHERE g.uid <> (SELECT uid FROM t_ap_who WHERE who = 'leader')
   AND r.val IS DISTINCT FROM pg_temp.neutral();

-- No session asks about every person: false.
SELECT pg_temp.fail('b nobody', format('no session asks about %s, group %s: %s', g.uid, r.grupo, r.val))
  FROM t_ap_groups g
 CROSS JOIN LATERAL pg_temp.probe('nobody', NULL, g.uid, g.groups) r
 WHERE r.val IS DISTINCT FROM pg_temp.neutral();

-- service_role asks about every person: that person's own answers from before.
SELECT pg_temp.fail('b service', format('service asks about %s, group %s: own before %s, after %s', g.uid, r.grupo, o.val, r.val))
  FROM t_ap_groups g
 CROSS JOIN LATERAL pg_temp.probe('service', NULL, g.uid, g.groups) r
  LEFT JOIN t_ap_eq_old o ON o.uid = g.uid AND o.grupo = r.grupo
 WHERE r.val IS DISTINCT FROM o.val;

-- c. Edge cases.
CREATE TEMP TABLE t_ap_edge_new (case_name text PRIMARY KEY, val text) ON COMMIT DROP;
INSERT INTO t_ap_edge_new(case_name, val)
SELECT e.case_name, pg_temp.run_edge(e.case_name) FROM t_ap_edge e;

SELECT pg_temp.fail('c edge', format('%s: expected false everywhere, got %s', e.case_name, n.val))
  FROM t_ap_edge e JOIN t_ap_edge_new n USING (case_name)
 WHERE e.kind IN ('foreign', 'neutral') AND n.val IS DISTINCT FROM pg_temp.neutral_edge();

SELECT pg_temp.fail('c edge', format('%s: before %s, after %s', e.case_name, o.val, n.val))
  FROM t_ap_edge e JOIN t_ap_edge_old o USING (case_name) JOIN t_ap_edge_new n USING (case_name)
 WHERE e.kind = 'same' AND n.val IS DISTINCT FROM o.val;

-- d. Catalog.
SELECT pg_temp.fail('d catalog', format('%s changed: before [%s], after [%s]', o.sig, o.cat, pg_temp.cat_of(o.sig)))
  FROM t_ap_cat_old o
 WHERE pg_temp.cat_of(o.sig) IS DISTINCT FROM o.cat;

SELECT pg_temp.fail('d catalog', format('%s: language %s, definer %s, config %s, volatility %s (expected plpgsql, true, {search_path=public}, %s), strict %s',
                    f.sig, l.lanname, p.prosecdef, p.proconfig, p.provolatile, f.volatility, p.proisstrict))
  FROM t_ap_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure JOIN pg_language l ON l.oid = p.prolang
 WHERE l.lanname <> 'plpgsql'
    OR NOT p.prosecdef
    OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
    OR p.provolatile <> f.volatility
    OR p.proisstrict;

SELECT pg_temp.fail('d catalog', 'the guard is missing from ' || f.sig)
  FROM t_ap_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure
 WHERE NOT pg_temp.has_guard(p.prosrc);

-- puede_ver_grupo keeps every line of its live body.
SELECT pg_temp.fail('d catalog', 'puede_ver_grupo lost the line: ' || l.line)
  FROM t_ap_cat_old o
 CROSS JOIN LATERAL unnest(string_to_array(o.src, E'\n')) AS l(line)
 WHERE o.sig = 'public.puede_ver_grupo(uuid,uuid)'
   AND btrim(l.line) <> ''
   AND strpos(E'\n' || (SELECT p.prosrc FROM pg_proc p WHERE p.oid = o.sig::regprocedure) || E'\n',
              E'\n' || l.line || E'\n') = 0;

SELECT pg_temp.fail('d catalog', format('%s privilege on %s: expected %s', r.priv_role, f.sig, r.expected))
  FROM t_ap_fns f
 CROSS JOIN (VALUES ('anon', false), ('authenticated', true), ('service_role', true)) r(priv_role, expected)
 WHERE has_function_privilege(r.priv_role, f.sig, 'execute') IS DISTINCT FROM r.expected;

SELECT pg_temp.fail('d catalog', 'PUBLIC can execute ' || f.sig)
  FROM t_ap_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure,
       aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
 WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE';

-- e. RLS photo: the same rows through the policies, per person and table.
CREATE TEMP TABLE t_ap_rls_new (tbl text, who text, val text, ms numeric, PRIMARY KEY (tbl, who)) ON COMMIT DROP;
INSERT INTO t_ap_rls_new(tbl, who, val, ms)
SELECT o.tbl, o.who, ph.val, ph.ms
  FROM t_ap_rls_old o JOIN t_ap_who w ON w.who = o.who
 CROSS JOIN LATERAL pg_temp.photo(w.auth, o.tbl) ph;

SELECT pg_temp.fail('e rls', format('%s as %s: before %s, after %s', o.tbl, o.who, o.val, coalesce(n.val, 'missing')))
  FROM t_ap_rls_old o LEFT JOIN t_ap_rls_new n USING (tbl, who)
 WHERE n.val IS DISTINCT FROM o.val;

-- f. Timing after: the cost per call, and count(*) of grupos and
-- grupo_miembros from the photos.
INSERT INTO t_ap_timing(metric, phase, val)
SELECT format('%s x200 %s', f.fn, w.who), 'new',
       pg_temp.ms_per_call(f.fn, w.auth, w.uid, (SELECT grupo FROM t_ap_edge_groups WHERE ord = 1), 200) || ' ms/call'
  FROM (VALUES ('es_superadmin'), ('puede_ver_grupo'), ('es_director_de_grupo'), ('es_lider_de_grupo')) f(fn)
 CROSS JOIN t_ap_who w
 WHERE w.who IN ('leader', 'admin');
INSERT INTO t_ap_timing(metric, phase, val)
SELECT format('count(*) %s %s', r.tbl, r.who), r.phase, r.ms || ' ms|' || split_part(r.val, ':', 1)
  FROM (SELECT 'old' AS phase, tbl, who, val, ms FROM t_ap_rls_old
        UNION ALL
        SELECT 'new', tbl, who, val, ms FROM t_ap_rls_new) r
 WHERE r.tbl IN ('grupos', 'grupo_miembros');

-- Failing cases first (none expected; at most five per case, then a count),
-- then what ran, then the timing.
SELECT kind, name, detail
  FROM (SELECT 1 AS ord, 'failure' AS kind, f.case_name AS name, f.detail
          FROM (SELECT case_name, detail, row_number() OVER (PARTITION BY case_name ORDER BY detail) AS rn
                  FROM t_ap_failures) f
         WHERE f.rn <= 5
        UNION ALL
        SELECT 1, 'failure', case_name, format('(%s more like these)', count(*) - 5)
          FROM t_ap_failures GROUP BY case_name HAVING count(*) > 5
        UNION ALL
        SELECT 2, 'summary', 'compared',
               format('%s people, %s person-group pairs, %s edge cases, %s RLS photos, %s failing cases; '
                      || 'guard live before the migration block: %s; live language: %s; rows with id = auth_id: %s',
                      (SELECT count(*) FROM t_ap_people), (SELECT count(*) FROM t_ap_eq_old),
                      (SELECT count(*) FROM t_ap_edge_old), (SELECT count(*) FROM t_ap_rls_old),
                      (SELECT count(*) FROM t_ap_failures),
                      CASE WHEN pg_temp.guard_live() THEN 'yes' ELSE 'no' END,
                      (SELECT string_agg(regexp_replace(sig, '^public\.|\(.*$', '', 'g') || ' ' || lanname, ', ' ORDER BY sig) FROM t_ap_cat_old),
                      (SELECT count(*) FROM public.usuarios u WHERE u.id = u.auth_id))
        UNION ALL
        SELECT 2, 'summary', 'md5(pg_get_functiondef) after the block',
               (SELECT string_agg(p.proname || ' ' || md5(pg_get_functiondef(p.oid)), ', ' ORDER BY p.proname)
                  FROM t_ap_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure)
        UNION ALL
        SELECT 3, 'timing', o.metric, format('old %s, new %s', o.val, n.val)
          FROM t_ap_timing o JOIN t_ap_timing n ON n.metric = o.metric AND n.phase = 'new'
         WHERE o.phase = 'old') x
 ORDER BY ord, name, detail;

ROLLBACK;
