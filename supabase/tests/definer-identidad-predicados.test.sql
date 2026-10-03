-- L3 (odd/tasks/seguridad-definer-fase2-identidad.md) - identity guard on the
-- role and permission predicates that take the caller as p_auth_id / p_auth_uid
-- (the ones used inside RLS policies).
--
-- Covers, for the fifteen functions of the migration 20261002120000:
--   a. Own identity: with the session of person A and the argument = A, the
--      result equals what the function returned BEFORE the migration (a digest
--      captured at the top of this file from the live functions, before the
--      migration block below recreates them inside the transaction). Run for six
--      real staging people (admin, pastor, general director, director de etapa,
--      leader, member) plus one fixture person that has a campus and a debug
--      toolbar entry (one of the two test users whose auth id equals usuarios.id),
--      with both claim formats (legacy per-claim settings and the
--      JSON request.jwt.claims).
--   b. Foreign identity: a leader, a member and the fixture person passing the
--      admin's id, and the admin passing the leader's id, get the neutral value
--      (before the migration they got the other person's answer: that is the RED).
--   c. Service client (both claim styles) with anybody's id: same as the old
--      result for that person.
--   d. No session: neutral; a NULL argument inside a session: neutral. anon
--      cannot execute any of the fifteen (42501).
--   e. Catalog: signature, return type, volatility, definer flag, owner,
--      language, ACL as before; search_path pinned to public; every line of the
--      live body is still there; the six functions that receive usuarios.id and
--      are out of scope are byte-identical.
--   f. RLS photo: as each of the six people (role authenticated, with claims),
--      the ordered primary keys visible through RLS on every table whose
--      policies call one of these functions are identical before and after
--      (count and md5 of the keys; bounded samples where staging is slow, see
--      the t_dp_tbl list). Plus one INSERT / UPDATE / DELETE probe per table
--      whose write policy uses these functions: same outcome before and after
--      (rows affected or SQLSTATE; every probe runs in a subtransaction that is
--      rolled back).
--   g. Dependents that are not recreated here still answer the same for their
--      own identity: puede_editar_grupo, puede_ver_usuario_ficha,
--      puede_gestionar_relacion_familiar, the puede_gestionar_miembros field of
--      obtener_detalle_grupo, listar_usuarios_con_permisos and the permission
--      precondition of crear_grupo_con_director (puede_crear_grupo).
--
-- Compared fields: digests of the rows as text. Left out because they are clock
-- dependent or tie-ordered: nothing in the probes returns the time of the query;
-- role arrays are compared sorted (array_agg has no ORDER BY); the list probes
-- are compared as a sorted set of rows.
--
-- The migration is copied byte for byte between the two marker comments below.
--
-- Run against STAGING inside BEGIN...ROLLBACK: nothing here is kept. Fixtures
-- (a campus and a toolbar entry for a test user) are inserted and rolled back.
-- The last statement is a SELECT of the failing cases (empty = all ok), because
-- the MCP tool returns only the last result-producing statement.
--
-- Optional, set before the BEGIN (SELECT set_config('dp.only', 'fn,dep', false);)
-- to split a slow project into batches. Sections: fn (a-d), dep (g), rls_a
-- (cheap tables), rls_usr (usuarios), rls_gm (grupo_miembros), rls_gr (grupos),
-- rls_au (audit_grupo_miembros), w1 and w2 (write probes). The catalog cases (e)
-- always run. dp.who restricts the RLS photo to some people ('admin,leader').

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_dp_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dp_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Section switches (dp.only) and person filter (dp.who).
CREATE OR REPLACE FUNCTION pg_temp.sec(p text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('dp.only', true), ''), '') = ''
      OR p = ANY (string_to_array(current_setting('dp.only', true), ','));
$$;

CREATE OR REPLACE FUNCTION pg_temp.who_on(p text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('dp.who', true), ''), '') = ''
      OR p = ANY (string_to_array(current_setting('dp.who', true), ','));
$$;

-- Identity simulation. The functions under test are SECURITY DEFINER, so the
-- session role stays postgres and only the JWT settings change. Modes:
--   user          legacy per-claim settings (request.jwt.claim.*)
--   user_json     only the JSON request.jwt.claims (newer PostgREST)
--   service       service_role, legacy per-claim setting
--   service_json  service_role, only the JSON claims
--   nobody        no session at all
CREATE OR REPLACE FUNCTION pg_temp.set_session(p_mode text, p_auth uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true),
          set_config('request.jwt.claim.sub', '', true),
          set_config('request.jwt.claim.role', '', true);
  IF p_mode = 'user' THEN
    PERFORM set_config('request.jwt.claim.sub', p_auth::text, true),
            set_config('request.jwt.claim.role', 'authenticated', true);
  ELSIF p_mode = 'user_json' THEN
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_auth)::text, true);
  ELSIF p_mode = 'service' THEN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  ELSIF p_mode = 'service_json' THEN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  ELSIF p_mode <> 'nobody' THEN
    RAISE EXCEPTION 'unknown session mode %', p_mode;
  END IF;
END;
$$;

-- Digest of what a query returns: "row count:md5 of the ordered rows", or
-- "ERR <sqlstate> <message>" when it raises.
CREATE OR REPLACE FUNCTION pg_temp.dig(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  EXECUTE 'SELECT count(*) || '':'' || coalesce(md5(string_agg(t::text, ''|'' ORDER BY t::text)), ''-'') FROM (' || p_sql || ') t' INTO v;
  RETURN v;
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'ERR ' || SQLSTATE || ' ' || SQLERRM;
END;
$$;

-- An array as text, sorted, telling NULL from empty.
CREATE OR REPLACE FUNCTION pg_temp.arr(a anyarray)
RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN a IS NULL THEN 'NULL'
              ELSE '[' || coalesce((SELECT string_agg(e::text, ',' ORDER BY e::text) FROM unnest(a) e), '') || ']' END;
$$;

-- The same call as anon: only the SQLSTATE matters.
CREATE OR REPLACE FUNCTION pg_temp.as_anon_state(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  SET LOCAL ROLE anon;
  EXECUTE p_sql;
  RESET ROLE;
  RETURN 'executed';
EXCEPTION
  WHEN OTHERS THEN
    RESET ROLE;
    RETURN SQLSTATE;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.has_role(p_usr uuid, p_roles text[])
RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                  WHERE ur.usuario_id = p_usr AND rs.nombre_interno = ANY (p_roles));
$$;

-- Real people, resolved by role (the admin is the one named in the task).
CREATE TEMP TABLE t_dp_who (who text PRIMARY KEY, auth uuid, usr uuid) ON COMMIT DROP;

INSERT INTO t_dp_who(who, auth)
SELECT 'admin', u.auth_id FROM public.usuarios u
 WHERE '5df3b990-af3d-49b5-a061-025bc3598983'::uuid = u.auth_id;

INSERT INTO t_dp_who(who, auth)
SELECT 'pastor', (SELECT u.auth_id FROM public.usuarios u
                   WHERE u.auth_id IS NOT NULL AND pg_temp.has_role(u.id, ARRAY['pastor'])
                     AND NOT pg_temp.has_role(u.id, ARRAY['admin'])
                   ORDER BY u.id LIMIT 1);

INSERT INTO t_dp_who(who, auth)
SELECT 'dg', (SELECT u.auth_id FROM public.usuarios u
               WHERE u.auth_id IS NOT NULL AND pg_temp.has_role(u.id, ARRAY['director-general'])
                 AND NOT pg_temp.has_role(u.id, ARRAY['admin', 'pastor'])
                 AND EXISTS (SELECT 1 FROM public.director_general_segmentos dgs WHERE dgs.usuario_id = u.id)
               ORDER BY u.id LIMIT 1);

INSERT INTO t_dp_who(who, auth)
SELECT 'de', (SELECT u.auth_id FROM public.usuarios u
               WHERE u.auth_id IS NOT NULL AND pg_temp.has_role(u.id, ARRAY['director-etapa'])
                 AND NOT pg_temp.has_role(u.id, ARRAY['admin', 'pastor', 'director-general'])
                 AND EXISTS (SELECT 1 FROM public.segmento_lideres sl WHERE sl.usuario_id = u.id AND sl.tipo_lider = 'director_etapa')
               ORDER BY u.id LIMIT 1);

INSERT INTO t_dp_who(who, auth)
SELECT 'leader', (SELECT u.auth_id FROM public.usuarios u
                   WHERE u.auth_id IS NOT NULL AND pg_temp.has_role(u.id, ARRAY['lider'])
                     AND NOT pg_temp.has_role(u.id, ARRAY['admin', 'pastor', 'director-general', 'director-etapa'])
                     AND EXISTS (SELECT 1 FROM public.grupo_miembros gm WHERE gm.usuario_id = u.id AND gm.rol = 'Líder' AND gm.fecha_salida IS NULL)
                   ORDER BY u.id LIMIT 1);

INSERT INTO t_dp_who(who, auth)
SELECT 'member', (SELECT u.auth_id FROM public.usuarios u
                   WHERE u.auth_id IS NOT NULL AND pg_temp.has_role(u.id, ARRAY['miembro'])
                     AND NOT pg_temp.has_role(u.id, ARRAY['admin', 'pastor', 'director-general', 'director-etapa', 'lider'])
                     AND NOT EXISTS (SELECT 1 FROM public.grupo_miembros gm WHERE gm.usuario_id = u.id AND gm.rol = 'Líder')
                   ORDER BY u.id LIMIT 1);

-- The fixture person: one of the two test users whose auth id equals usuarios.id
-- (the campus helpers compare usuario_campus.usuario_id, a usuarios.id, with the
-- auth id, so only such a person can have a non-empty campus answer). It gets one
-- campus and a toolbar entry below; both rows are rolled back.
INSERT INTO t_dp_who(who, auth)
SELECT 'fx', (SELECT u.id FROM public.usuarios u
               WHERE u.id = u.auth_id AND NOT pg_temp.has_role(u.id, ARRAY['admin', 'pastor', 'director-general', 'director-etapa', 'lider', 'miembro'])
                 AND NOT EXISTS (SELECT 1 FROM public.usuario_campus uc WHERE uc.usuario_id = u.id)
               ORDER BY u.id LIMIT 1);

UPDATE t_dp_who w SET usr = (SELECT u.id FROM public.usuarios u WHERE u.auth_id = w.auth) WHERE w.who <> 'fx';
UPDATE t_dp_who SET usr = auth WHERE who = 'fx';

-- Context: groups, segments and people the probes ask about.
CREATE TEMP TABLE t_dp_ctx ON COMMIT DROP AS
SELECT (SELECT gm.grupo_id FROM public.grupo_miembros gm
         WHERE gm.usuario_id = (SELECT usr FROM t_dp_who WHERE who = 'leader')
           AND gm.rol = 'Líder' AND gm.fecha_salida IS NULL
         ORDER BY gm.grupo_id LIMIT 1) AS g1,
       NULL::uuid AS g2, NULL::uuid AS gdg,
       (SELECT dgs.segmento_id FROM public.director_general_segmentos dgs
         WHERE dgs.usuario_id = (SELECT usr FROM t_dp_who WHERE who = 'dg')
         ORDER BY dgs.segmento_id LIMIT 1) AS seg_dg,
       (SELECT sl.segmento_id FROM public.segmento_lideres sl
         WHERE sl.usuario_id = (SELECT usr FROM t_dp_who WHERE who = 'de') AND sl.tipo_lider = 'director_etapa'
         ORDER BY sl.segmento_id LIMIT 1) AS seg_de,
       (SELECT s.id FROM public.segmentos s ORDER BY s.id LIMIT 1) AS seg_any,
       NULL::uuid AS seg_other,
       NULL::uuid AS t_in, NULL::uuid AS t_de, NULL::uuid AS t_other,
       (SELECT c.id FROM public.campus c ORDER BY c.id LIMIT 1) AS campus,
       (SELECT t.id FROM public.temporadas t ORDER BY t.id LIMIT 1) AS temporada;

UPDATE t_dp_ctx c SET
  g2 = (SELECT g.id FROM public.grupos g
         WHERE g.id <> c.g1 AND NOT g.eliminado
           AND NOT EXISTS (SELECT 1 FROM public.grupo_miembros gm WHERE gm.grupo_id = g.id
                            AND gm.usuario_id = (SELECT usr FROM t_dp_who WHERE who = 'leader'))
         ORDER BY g.id LIMIT 1),
  gdg = (SELECT g.id FROM public.grupos g WHERE g.segmento_id = c.seg_dg AND NOT g.eliminado ORDER BY g.id LIMIT 1),
  seg_other = (SELECT s.id FROM public.segmentos s WHERE s.id NOT IN (c.seg_dg, c.seg_de) ORDER BY s.id LIMIT 1),
  t_in = (SELECT gm.usuario_id FROM public.grupo_miembros gm
           WHERE gm.grupo_id = c.g1 AND gm.estado = 'activo' AND gm.fecha_salida IS NULL
             AND gm.usuario_id <> (SELECT usr FROM t_dp_who WHERE who = 'leader')
           ORDER BY gm.usuario_id LIMIT 1),
  t_de = (SELECT gm.usuario_id FROM public.director_etapa_grupos deg
            JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
            JOIN public.grupo_miembros gm ON gm.grupo_id = deg.grupo_id
           WHERE sl.usuario_id = (SELECT usr FROM t_dp_who WHERE who = 'de')
             AND gm.estado = 'activo' AND gm.fecha_salida IS NULL AND gm.usuario_id <> sl.usuario_id
           ORDER BY gm.usuario_id LIMIT 1),
  t_other = (SELECT u.id FROM public.usuarios u
              WHERE u.id <> (SELECT usr FROM t_dp_who WHERE who = 'leader')
                AND NOT EXISTS (SELECT 1 FROM public.grupo_miembros gm WHERE gm.usuario_id = u.id AND gm.grupo_id = c.g1)
              ORDER BY u.id LIMIT 1);

-- Fixture rows of that person (only where the person probes run).
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT w.auth, c.campus, true FROM t_dp_who w, t_dp_ctx c WHERE w.who = 'fx' AND pg_temp.sec('fn');
INSERT INTO public.debug_toolbar_whitelist (usuario_id)
SELECT w.auth FROM t_dp_who w WHERE w.who = 'fx' AND pg_temp.sec('fn');
-- Two pending requests (staging has none), so contar_solicitudes_pendientes has
-- something to count: one in the general director's group, one in the leader's.
INSERT INTO public.solicitudes_grupo (tipo, solicitado_por, grupo_id)
SELECT (SELECT s.tipo FROM public.solicitudes_grupo s ORDER BY s.creado_en LIMIT 1),
       (SELECT usr FROM t_dp_who WHERE who = 'leader'), x.g
  FROM (SELECT c.gdg AS g FROM t_dp_ctx c UNION ALL SELECT c.g1 FROM t_dp_ctx c) x
 WHERE pg_temp.sec('fn');

-- Setup checks: every person and context value resolved.
SELECT pg_temp.assert_eq('setup: ' || w.who, format($q$SELECT (SELECT auth FROM t_dp_who WHERE who = %L) IS NOT NULL AND (SELECT usr FROM t_dp_who WHERE who = %L) IS NOT NULL$q$, w.who, w.who), 'true')
  FROM t_dp_who w;
SELECT pg_temp.assert_eq('setup: the admin has the admin role',
  $q$SELECT pg_temp.has_role((SELECT usr FROM t_dp_who WHERE who = 'admin'), ARRAY['admin'])$q$, 'true');
SELECT pg_temp.assert_eq('setup: context ' || k,
  format('SELECT (SELECT to_jsonb(c) ->> %L FROM t_dp_ctx c) IS NOT NULL', k), 'true')
  FROM unnest(ARRAY['g1', 'g2', 'gdg', 'seg_dg', 'seg_de', 'seg_any', 'seg_other', 't_in', 't_de', 't_other', 'campus', 'temporada']) k;

-- ---------------------------------------------------------------------------
-- Probes of the fifteen functions: the call for a given argument, and the value
-- the function must return for another person's identity (decision D3).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_dp_probes (probe text PRIMARY KEY, neutral_sql text) ON COMMIT DROP;
INSERT INTO t_dp_probes(probe, neutral_sql) VALUES
  ('roles_usuario',     'SELECT pg_temp.arr(NULL::text[]) AS v'),
  ('roles_sistema',     'SELECT pg_temp.arr(ARRAY[]::text[]) AS v'),
  ('liderazgo',         'SELECT ''false'' AS v'),
  ('admin_pastor',      'SELECT ''false'' AS v'),
  ('dg_g1',             'SELECT ''false'' AS v'),
  ('dg_gdg',            'SELECT ''false'' AS v'),
  ('campus_ids',        'SELECT pg_temp.arr(ARRAY[]::uuid[]) AS v'),
  ('campus_principal',  'SELECT NULL::text AS v'),
  ('crear_grupo_any',   'SELECT ''false'' AS v'),
  ('crear_grupo_dg',    'SELECT ''false'' AS v'),
  ('crear_grupo_de',    'SELECT ''false'' AS v'),
  ('crear_grupo_other', 'SELECT ''false'' AS v'),
  ('crear_usuario',     'SELECT ''false'' AS v'),
  ('editar_self',       'SELECT ''false'' AS v'),
  ('editar_in',         'SELECT ''false'' AS v'),
  ('editar_de',         'SELECT ''false'' AS v'),
  ('editar_other',      'SELECT ''false'' AS v'),
  ('casas',             'SELECT ''false'' AS v'),
  ('miembros_g1',       'SELECT ''false'' AS v'),
  ('miembros_g2',       'SELECT ''false'' AS v'),
  ('miembros_gdg',      'SELECT ''false'' AS v'),
  ('debug',             'SELECT ''false'' AS v'),
  ('solicitudes',       'SELECT ''0'' AS v'),
  ('segmentos',         'SELECT NULL::uuid AS id, NULL::text AS nombre WHERE false'),
  ('segmentos_campus',  'SELECT NULL::uuid AS id, NULL::text AS nombre WHERE false');

CREATE OR REPLACE FUNCTION pg_temp.sql_of(p_probe text, p_a uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT CASE p_probe
    WHEN 'roles_usuario'     THEN format('SELECT pg_temp.arr(public.obtener_roles_usuario(%L::uuid)) AS v', p_a)
    WHEN 'roles_sistema'     THEN format('SELECT pg_temp.arr(public.obtener_roles_sistema_usuario(%L::uuid)) AS v', p_a)
    WHEN 'liderazgo'         THEN format('SELECT public.tiene_rol_de_liderazgo(%L::uuid)::text AS v', p_a)
    WHEN 'admin_pastor'      THEN format('SELECT public.es_admin_o_pastor(%L::uuid)::text AS v', p_a)
    WHEN 'dg_g1'             THEN format('SELECT public.es_director_general_de_grupo(%L::uuid, %L::uuid)::text AS v', p_a, c.g1)
    WHEN 'dg_gdg'            THEN format('SELECT public.es_director_general_de_grupo(%L::uuid, %L::uuid)::text AS v', p_a, c.gdg)
    WHEN 'campus_ids'        THEN format('SELECT pg_temp.arr(public.mis_campus_ids(%L::uuid)) AS v', p_a)
    WHEN 'campus_principal'  THEN format('SELECT public.mi_campus_principal(%L::uuid)::text AS v', p_a)
    WHEN 'crear_grupo_any'   THEN format('SELECT public.puede_crear_grupo(%L::uuid, %L::uuid)::text AS v', p_a, c.seg_any)
    WHEN 'crear_grupo_dg'    THEN format('SELECT public.puede_crear_grupo(%L::uuid, %L::uuid)::text AS v', p_a, c.seg_dg)
    WHEN 'crear_grupo_de'    THEN format('SELECT public.puede_crear_grupo(%L::uuid, %L::uuid)::text AS v', p_a, c.seg_de)
    WHEN 'crear_grupo_other' THEN format('SELECT public.puede_crear_grupo(%L::uuid, %L::uuid)::text AS v', p_a, c.seg_other)
    WHEN 'crear_usuario'     THEN format('SELECT public.puede_crear_usuario(%L::uuid)::text AS v', p_a)
    WHEN 'editar_self'       THEN format('SELECT public.puede_editar_usuario(%L::uuid, (SELECT x.id FROM public.usuarios x WHERE x.auth_id = %L::uuid))::text AS v', p_a, p_a)
    WHEN 'editar_in'         THEN format('SELECT public.puede_editar_usuario(%L::uuid, %L::uuid)::text AS v', p_a, c.t_in)
    WHEN 'editar_de'         THEN format('SELECT public.puede_editar_usuario(%L::uuid, %L::uuid)::text AS v', p_a, c.t_de)
    WHEN 'editar_other'      THEN format('SELECT public.puede_editar_usuario(%L::uuid, %L::uuid)::text AS v', p_a, c.t_other)
    WHEN 'casas'             THEN format('SELECT public.puede_gestionar_casas(%L::uuid)::text AS v', p_a)
    WHEN 'miembros_g1'       THEN format('SELECT public.puede_gestionar_miembros(%L::uuid, %L::uuid)::text AS v', p_a, c.g1)
    WHEN 'miembros_g2'       THEN format('SELECT public.puede_gestionar_miembros(%L::uuid, %L::uuid)::text AS v', p_a, c.g2)
    WHEN 'miembros_gdg'      THEN format('SELECT public.puede_gestionar_miembros(%L::uuid, %L::uuid)::text AS v', p_a, c.gdg)
    WHEN 'debug'             THEN format('SELECT public.puede_ver_debug_toolbar(%L::uuid)::text AS v', p_a)
    WHEN 'solicitudes'       THEN format('SELECT public.contar_solicitudes_pendientes(%L::uuid)::text AS v', p_a)
    WHEN 'segmentos'         THEN format('SELECT * FROM public.obtener_segmentos_para_director(%L::uuid)', p_a)
    WHEN 'segmentos_campus'  THEN format('SELECT * FROM public.obtener_segmentos_para_director(%L::uuid, %L::uuid)', p_a, c.campus)
  END
  FROM t_dp_ctx c;
$$;

-- One digest: the session as p_mode / p_session, the argument p_arg.
CREATE OR REPLACE FUNCTION pg_temp.run(p_probe text, p_mode text, p_session uuid, p_arg uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  PERFORM pg_temp.set_session(p_mode, p_session);
  v := pg_temp.dig(pg_temp.sql_of(p_probe, p_arg));
  PERFORM pg_temp.set_session('nobody', NULL);
  RETURN v;
END;
$$;

-- The permission precondition of crear_grupo_con_director, as one probe: ok, or
-- the SQLSTATE it stops with. The group it creates is rolled back at once.
CREATE OR REPLACE FUNCTION pg_temp.try_crear(p_a uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
  v_seg uuid;
  v_dir uuid;
BEGIN
  SELECT CASE (SELECT who FROM t_dp_who WHERE auth = p_a)
           WHEN 'de' THEN c.seg_de WHEN 'dg' THEN c.seg_dg ELSE c.seg_any END INTO v_seg FROM t_dp_ctx c;
  SELECT sl.id INTO v_dir FROM public.segmento_lideres sl
   WHERE sl.segmento_id = v_seg AND sl.tipo_lider = 'director_etapa' ORDER BY sl.id LIMIT 1;
  BEGIN
    PERFORM public.crear_grupo_con_director('ZZ dp', (SELECT temporada FROM t_dp_ctx), v_seg, v_dir);
    v := 'ok';
    RAISE EXCEPTION 'dp_rollback' USING ERRCODE = 'ZZ001';
  EXCEPTION
    WHEN SQLSTATE 'ZZ001' THEN NULL;
    WHEN OTHERS THEN v := SQLSTATE;
  END;
  RETURN v;
END;
$$;

CREATE TEMP TABLE t_dp_dep (probe text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO t_dp_dep(probe) VALUES
  ('editar_grupo_g1'), ('editar_grupo_g2'), ('ficha_in'), ('ficha_other'), ('relacion'),
  ('detalle_g1'), ('detalle_gdg'), ('listar'), ('crear_con_director');

CREATE OR REPLACE FUNCTION pg_temp.dep_sql_of(p_probe text, p_a uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT CASE p_probe
    WHEN 'editar_grupo_g1'  THEN format('SELECT public.puede_editar_grupo(%L::uuid, %L::uuid)::text AS v', p_a, c.g1)
    WHEN 'editar_grupo_g2'  THEN format('SELECT public.puede_editar_grupo(%L::uuid, %L::uuid)::text AS v', p_a, c.g2)
    WHEN 'ficha_in'         THEN format('SELECT public.puede_ver_usuario_ficha(%L::uuid, %L::uuid)::text AS v', p_a, c.t_in)
    WHEN 'ficha_other'      THEN format('SELECT public.puede_ver_usuario_ficha(%L::uuid, %L::uuid)::text AS v', p_a, c.t_other)
    WHEN 'relacion'         THEN format('SELECT public.puede_gestionar_relacion_familiar(%L::uuid, %L::uuid, %L::uuid)::text AS v', p_a, c.t_in, c.t_other)
    WHEN 'detalle_g1'       THEN format('SELECT (public.obtener_detalle_grupo(%L::uuid, %L::uuid) ->> ''puede_gestionar_miembros'') AS v', p_a, c.g1)
    WHEN 'detalle_gdg'      THEN format('SELECT (public.obtener_detalle_grupo(%L::uuid, %L::uuid) ->> ''puede_gestionar_miembros'') AS v', p_a, c.gdg)
    WHEN 'listar'           THEN format('SELECT id, puede_ver, rol_nombre_interno, total_count FROM public.listar_usuarios_con_permisos(%L::uuid, '''', ARRAY[]::text[], NULL, NULL, NULL, 300, 0, false, NULL)', p_a)
    WHEN 'crear_con_director' THEN format('SELECT pg_temp.try_crear(%L::uuid) AS v', p_a)
  END
  FROM t_dp_ctx c;
$$;

CREATE OR REPLACE FUNCTION pg_temp.run_dep(p_probe text, p_mode text, p_session uuid, p_arg uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  PERFORM pg_temp.set_session(p_mode, p_session);
  v := pg_temp.dig(pg_temp.dep_sql_of(p_probe, p_arg));
  PERFORM pg_temp.set_session('nobody', NULL);
  RETURN v;
END;
$$;

-- RLS: what a person sees through the policies (role authenticated, with
-- claims): "count:md5 of the ordered primary keys" of a bounded sample.
CREATE OR REPLACE FUNCTION pg_temp.photo(p_who uuid, p_tbl text, p_lim int)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  PERFORM pg_temp.set_session('user', p_who);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE format('SELECT count(*)::text || '':'' || coalesce(md5(string_agg(id::text, '','' ORDER BY id)), ''-'') FROM (SELECT id FROM public.%I ORDER BY id LIMIT %s) x', p_tbl, p_lim) INTO v;
  EXCEPTION
    WHEN OTHERS THEN v := 'ERR ' || SQLSTATE;
  END;
  RESET ROLE;
  PERFORM pg_temp.set_session('nobody', NULL);
  RETURN v;
END;
$$;

-- One write attempt as role authenticated: rows affected or the SQLSTATE; the
-- statement is always rolled back.
CREATE OR REPLACE FUNCTION pg_temp.wprobe(p_who uuid, p_stmt text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
  n bigint;
BEGIN
  PERFORM pg_temp.set_session('user', p_who);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_stmt;
    GET DIAGNOSTICS n = ROW_COUNT;
    v := 'rows ' || n;
    RAISE EXCEPTION 'dp_rollback' USING ERRCODE = 'ZZ001';
  EXCEPTION
    WHEN SQLSTATE 'ZZ001' THEN NULL;
    WHEN OTHERS THEN v := 'ERR ' || SQLSTATE;
  END;
  RESET ROLE;
  PERFORM pg_temp.set_session('nobody', NULL);
  RETURN v;
END;
$$;

-- Tables whose policies call one of the fifteen (derived from the call-site
-- inventory), the sample bound, who is photographed, and the section.
-- Sampling: usuarios, grupo_miembros and the cheap tables are read in full or
-- up to the bound. grupos is sampled (3 rows) for the two people who see
-- everything: its SELECT policy costs about 100 ms per visible row on staging
-- and does not call these functions (only its INSERT policy does, covered by the
-- write probes). audit_grupo_miembros is sampled (5 rows) for the admin only
-- (about 20 s per run on staging, it goes through the grupos policies; the
-- admin sees no rows there because its policy compares an auth id with a
-- usuarios.id).
CREATE TEMP TABLE t_dp_tbl (tbl text PRIMARY KEY, lim int, whos text[], sec text) ON COMMIT DROP;
INSERT INTO t_dp_tbl(tbl, lim, whos, sec) VALUES
  ('casas_anfitrionas',           300,  ARRAY['admin','pastor','dg','de','leader','member'], 'rls_a'),
  ('dg_directores_etapa',         100,  ARRAY['admin','pastor','dg','de','leader','member'], 'rls_a'),
  ('direcciones',                 400,  ARRAY['admin','pastor','dg','de','leader','member'], 'rls_a'),
  ('disponibilidad_liderazgo',    200,  ARRAY['admin','pastor','dg','de','leader','member'], 'rls_a'),
  ('historial_movimientos_grupo', 300,  ARRAY['admin','pastor','dg','de','leader','member'], 'rls_a'),
  ('segmentos',                   100,  ARRAY['admin','pastor','dg','de','leader','member'], 'rls_a'),
  ('segmento_lideres',            100,  ARRAY['admin','pastor','dg','de','leader','member'], 'rls_a'),
  ('solicitudes_grupo',           200,  ARRAY['admin','pastor','dg','de','leader','member'], 'rls_a'),
  ('temporadas',                  100,  ARRAY['admin','pastor','dg','de','leader','member'], 'rls_a'),
  ('usuario_roles',               1100, ARRAY['admin','pastor','dg','de','leader','member'], 'rls_a'),
  ('usuarios',                    1100, ARRAY['admin','pastor','dg','de','leader','member'], 'rls_usr'),
  ('grupo_miembros',              2200, ARRAY['admin','pastor','dg','de','leader','member'], 'rls_gm'),
  ('grupos',                      3,    ARRAY['admin','pastor'],                             'rls_gr'),
  ('audit_grupo_miembros',        5,    ARRAY['admin'],                                      'rls_au');

-- Write probes: one per table and command governed by a policy that uses them.
CREATE TEMP TABLE t_dp_wr (probe text PRIMARY KEY, tbl text, kind text, sec text) ON COMMIT DROP;
INSERT INTO t_dp_wr(probe, tbl, kind, sec) VALUES
  ('casas_upd',  'casas_anfitrionas',           'upd', 'w1'),
  ('dgde_ins',   'dg_directores_etapa',         'ins', 'w1'),
  ('dgde_upd',   'dg_directores_etapa',         'upd', 'w1'),
  ('dgde_del',   'dg_directores_etapa',         'del', 'w1'),
  ('dir_upd',    'direcciones',                 'upd', 'w1'),
  ('dir_del',    'direcciones',                 'del', 'w1'),
  ('gm_ins',     'grupo_miembros',              'ins', 'w1'),
  ('gm_upd',     'grupo_miembros',              'upd', 'w1'),
  ('gm_del',     'grupo_miembros',              'del', 'w1'),
  ('gr_ins',     'grupos',                      'ins', 'w1'),
  ('hist_ins',   'historial_movimientos_grupo', 'ins', 'w1'),
  ('seg_ins',    'segmentos',                   'ins', 'w2'),
  ('seg_upd',    'segmentos',                   'upd', 'w2'),
  ('seg_del',    'segmentos',                   'del', 'w2'),
  ('sol_ins',    'solicitudes_grupo',           'ins', 'w2'),
  ('sol_upd',    'solicitudes_grupo',           'upd', 'w2'),
  ('temp_ins',   'temporadas',                  'ins', 'w2'),
  ('temp_upd',   'temporadas',                  'upd', 'w2'),
  ('ur_ins',     'usuario_roles',               'ins', 'w2'),
  ('ur_upd',     'usuario_roles',               'upd', 'w2'),
  ('ur_del',     'usuario_roles',               'del', 'w2'),
  ('usr_upd',    'usuarios',                    'upd', 'w2');

-- Rows the UPDATE and DELETE probes aim at: three per table (for grupo_miembros,
-- three of the leader's group so the leader's own policies have rows to act on).
CREATE TEMP TABLE t_dp_samp (tbl text PRIMARY KEY, ids uuid[]) ON COMMIT DROP;
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT tbl FROM t_dp_wr WHERE kind <> 'ins' LOOP
    IF r.tbl = 'grupo_miembros' THEN
      INSERT INTO t_dp_samp SELECT r.tbl, array_agg(x.id) FROM (
        SELECT gm.id FROM public.grupo_miembros gm WHERE gm.grupo_id = (SELECT g1 FROM t_dp_ctx) ORDER BY gm.id LIMIT 3) x;
    ELSE
      EXECUTE format('INSERT INTO t_dp_samp SELECT %L, array_agg(x.id) FROM (SELECT id FROM public.%I ORDER BY id LIMIT 3) x', r.tbl, r.tbl);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wstmt(p_probe text)
RETURNS text LANGUAGE sql AS $$
  SELECT CASE w.kind
           WHEN 'ins' THEN format('INSERT INTO public.%I DEFAULT VALUES', w.tbl)
           WHEN 'upd' THEN format('UPDATE public.%I SET id = id WHERE id = ANY (%L::uuid[])', w.tbl, (SELECT ids FROM t_dp_samp WHERE tbl = w.tbl))
           WHEN 'del' THEN format('DELETE FROM public.%I WHERE id = ANY (%L::uuid[])', w.tbl, (SELECT ids FROM t_dp_samp WHERE tbl = w.tbl))
         END
    FROM t_dp_wr w WHERE w.probe = p_probe;
$$;

-- Catalog before the migration.
CREATE TEMP TABLE t_dp_fns (sig text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO t_dp_fns(sig) VALUES
  ('public.obtener_roles_usuario(uuid)'),
  ('public.obtener_roles_sistema_usuario(uuid)'),
  ('public.tiene_rol_de_liderazgo(uuid)'),
  ('public.es_admin_o_pastor(uuid)'),
  ('public.es_director_general_de_grupo(uuid,uuid)'),
  ('public.mis_campus_ids(uuid)'),
  ('public.mi_campus_principal(uuid)'),
  ('public.puede_crear_grupo(uuid,uuid)'),
  ('public.puede_crear_usuario(uuid)'),
  ('public.puede_editar_usuario(uuid,uuid)'),
  ('public.puede_gestionar_casas(uuid)'),
  ('public.puede_gestionar_miembros(uuid,uuid)'),
  ('public.puede_ver_debug_toolbar(uuid)'),
  ('public.contar_solicitudes_pendientes(uuid)'),
  ('public.obtener_segmentos_para_director(uuid,uuid)');

CREATE OR REPLACE FUNCTION pg_temp.cat_of(p_sig text)
RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws(' | ',
           p.oid::regprocedure::text,
           pg_get_function_arguments(p.oid),
           pg_get_function_result(p.oid),
           p.provolatile::text,
           p.prosecdef::text,
           p.proowner::regrole::text,
           l.lanname,
           p.proisstrict::text,
           p.proparallel::text,
           (SELECT string_agg(CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || ':' || a.privilege_type,
                              ',' ORDER BY CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, a.privilege_type)
              FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a))
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.oid = p_sig::regprocedure;
$$;

-- Since 20261003110000 new postgres functions carry no PUBLIC EXECUTE, and these helpers run under SET LOCAL ROLE.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

CREATE TEMP TABLE t_dp_cat_old AS
SELECT sig, pg_temp.cat_of(sig) AS cat FROM t_dp_fns;

CREATE TEMP TABLE t_dp_src_old AS
SELECT f.sig, p.prosrc AS src FROM t_dp_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure;

-- The six functions that receive usuarios.id are out of scope: they must not change.
CREATE TEMP TABLE t_dp_other_old AS
SELECT p.oid::regprocedure::text AS sig, md5(pg_get_functiondef(p.oid)) AS md5
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('es_superadmin', 'puede_ver_grupo', 'es_director_de_grupo', 'es_lider_de_grupo',
                     'obtener_conyugue', 'puede_ver_usuario');

-- ---------------------------------------------------------------------------
-- Results BEFORE the migration, from the live text.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_dp_old (probe text, who text, val text, PRIMARY KEY (probe, who)) ON COMMIT DROP;
INSERT INTO t_dp_old(probe, who, val)
SELECT p.probe, w.who, pg_temp.run(p.probe, 'user', w.auth, w.auth)
  FROM t_dp_probes p CROSS JOIN t_dp_who w WHERE pg_temp.sec('fn');

-- What the live functions return for an id nobody has (the neutral value must be
-- exactly that, so the app sees no new shape).
CREATE TEMP TABLE t_dp_unk (probe text PRIMARY KEY, val text) ON COMMIT DROP;
INSERT INTO t_dp_unk(probe, val)
SELECT p.probe, pg_temp.run(p.probe, 'service', NULL, gen_random_uuid())
  FROM t_dp_probes p WHERE pg_temp.sec('fn');

INSERT INTO t_dp_failures
SELECT 'setup: neutral value differs from the live unknown-id value for ' || p.probe
       || ': neutral ' || pg_temp.dig(p.neutral_sql) || ', live ' || u.val
  FROM t_dp_probes p JOIN t_dp_unk u USING (probe)
 WHERE pg_temp.dig(p.neutral_sql) IS DISTINCT FROM u.val;

-- The fixture must make some person's own answer differ from the neutral value,
-- otherwise case b would prove nothing.
INSERT INTO t_dp_failures
SELECT 'setup: nobody has a non-neutral own answer for ' || p.probe
  FROM t_dp_probes p
 WHERE pg_temp.sec('fn')
   AND NOT EXISTS (SELECT 1 FROM t_dp_old o WHERE o.probe = p.probe AND o.val IS DISTINCT FROM pg_temp.dig(p.neutral_sql));

CREATE TEMP TABLE t_dp_dep_old (probe text, who text, val text, PRIMARY KEY (probe, who)) ON COMMIT DROP;
INSERT INTO t_dp_dep_old(probe, who, val)
SELECT d.probe, w.who, pg_temp.run_dep(d.probe, 'user', w.auth, w.auth)
  FROM t_dp_dep d CROSS JOIN t_dp_who w WHERE w.who <> 'fx' AND pg_temp.sec('dep');

INSERT INTO t_dp_failures
SELECT 'setup: dependent probe ' || d.probe || ' is identical for every person (it proves nothing)'
  FROM t_dp_dep d
 WHERE pg_temp.sec('dep') AND d.probe <> 'crear_con_director'
   AND (SELECT count(DISTINCT val) FROM t_dp_dep_old o WHERE o.probe = d.probe) < 2;

CREATE TEMP TABLE t_dp_rls_old (tbl text, who text, val text, PRIMARY KEY (tbl, who)) ON COMMIT DROP;
INSERT INTO t_dp_rls_old(tbl, who, val)
SELECT t.tbl, w.who, pg_temp.photo(w.auth, t.tbl, t.lim)
  FROM t_dp_tbl t JOIN t_dp_who w ON w.who = ANY (t.whos)
 WHERE pg_temp.sec(t.sec) AND pg_temp.who_on(w.who);

INSERT INTO t_dp_failures
SELECT 'setup: RLS photo of ' || tbl || ' for ' || who || ' failed before the migration: ' || val
  FROM t_dp_rls_old WHERE val LIKE 'ERR%';

CREATE TEMP TABLE t_dp_wold (probe text, who text, val text, PRIMARY KEY (probe, who)) ON COMMIT DROP;
INSERT INTO t_dp_wold(probe, who, val)
SELECT w.probe, p.who, pg_temp.wprobe(p.auth, pg_temp.wstmt(w.probe))
  FROM t_dp_wr w CROSS JOIN t_dp_who p
 WHERE p.who <> 'fx' AND pg_temp.sec(w.sec) AND pg_temp.who_on(p.who);

-- >>> BEGIN migration 20261002120000_definer_identidad_predicados.sql (byte-identical copy)
-- Identity guard for the role and permission predicates that take the caller as
-- an argument (security phase 2, batch 3).
--
-- What was wrong in the live functions:
--   * They run with the definer's rights and take the caller's identity as an
--     argument (p_auth_id, or p_auth_uid for the two campus helpers) but never
--     compared it with the session. Any logged-in person who knew another person's auth id
--     could ask "which roles does X have" (obtener_roles_usuario,
--     obtener_roles_sistema_usuario), "is X an admin / a leader / a general
--     director", "which campuses does X belong to", "what can X create, edit or
--     manage", "which segments does X direct" and "how many requests can X
--     approve", for anybody.
--
-- What changes (signature, argument names and defaults, return type, language,
-- volatility, definer flag, owner and grants are unchanged, so the app needs
-- no change):
--   * Identity: the argument must equal auth.uid(), unless the call comes from
--     service_role. This is the pattern of 20260930100000 and of the batch 1
--     migration 20261002100000. The rest of every body is the live text.
--   * search_path is pinned to public where the function had none (seven
--     functions). Every object those bodies use is either qualified (public.*,
--     auth.*) or lives in public, so the pin changes no resolution.
--   * Grants are restated at the end of the file; they are exactly today's state
--     (no anon, no PUBLIC; postgres, authenticated, service_role, supabase_admin).
--
-- Form of the guard, per function. The plpgsql functions get
-- "v_request_role text := auth.role();" as the last declaration and the guard as
-- the first statement. The LANGUAGE sql functions stay LANGUAGE sql with the same
-- volatility (they sit in RLS policies, where the planner relies on STABLE): the
-- guard is an extra predicate inside the original query, and the original query
-- text is kept as it is. The guard expression has no column of the query in it,
-- so it costs a constant amount per call.
--
--   function                            lang  guard form             neutral value
--   obtener_roles_usuario               sql   AND in WHERE           NULL (no rows)
--   obtener_roles_sistema_usuario       sql   AND in WHERE           '{}'
--   tiene_rol_de_liderazgo              sql   COALESCE(...) AND (..) false
--   es_admin_o_pastor                   sql   AND inside EXISTS      false
--   es_director_general_de_grupo        plpgsql  IF ... RETURN       false
--   mis_campus_ids(p_auth_uid)          sql   AND in WHERE           '{}'
--   mi_campus_principal(p_auth_uid)     sql   AND in WHERE           NULL (no rows)
--   puede_crear_grupo                   plpgsql  IF ... RETURN       false
--   puede_crear_usuario                 plpgsql  IF ... RETURN       false
--   puede_editar_usuario                plpgsql  IF ... RETURN       false
--   puede_gestionar_casas               plpgsql  IF ... RETURN       false
--   puede_gestionar_miembros            plpgsql  IF ... RETURN       false
--   puede_ver_debug_toolbar             sql   AND inside EXISTS      false
--   contar_solicitudes_pendientes       plpgsql  IF ... RETURN       0
--   obtener_segmentos_para_director     sql   AND in WHERE           no rows
-- Each neutral value is what the live function returns today for an unknown id
-- (checked on staging with a random uuid), so the app sees no new shape.
--
-- Call sites (inventory on staging, all schemas, RLS policies, views, triggers,
-- column defaults, check constraints and indexes):
--   * RLS policies pass auth.uid() or (select auth.uid()): tiene_rol_de_liderazgo
--     (20 policies on casas_anfitrionas, direcciones, disponibilidad_liderazgo,
--     grupo_miembros, grupos, historial_movimientos_grupo, segmentos,
--     solicitudes_grupo, temporadas, usuario_roles), es_admin_o_pastor
--     (dg_directores_etapa), es_director_general_de_grupo (solicitudes_grupo),
--     mis_campus_ids (audit_grupo_miembros), obtener_roles_usuario (usuarios).
--     The usuarios policies also call puede_ver_usuario(auth.uid(), id), which
--     calls obtener_roles_usuario(p_viewer_id): the viewer is auth.uid() there.
--   * Other functions pass their own p_auth_id through (it is already guarded in
--     the batch 1, 2 and 4 functions and in the ones that had their own guard) or
--     auth.uid() (crear_grupo_con_director). puede_editar_usuario passes its
--     p_auth_id to es_director_general_de_grupo, so both agree.
--   * No view, trigger, column default, check constraint or index uses any of
--     the fifteen. The app calls them with the session client and the person's
--     own id; service-role callers stay exempt.
--   * The roles that bypass RLS (service_role, postgres, supabase_admin and the
--     two internal ones) never evaluate the policies; anon cannot execute any of
--     the fifteen, so no policy runs them without a JWT.
--
-- Not touched: es_superadmin, puede_ver_grupo, es_director_de_grupo,
-- es_lider_de_grupo, obtener_conyugue and puede_ver_usuario receive usuarios.id,
-- not the auth id (a later phase).
--
-- Blast radius: these run per statement or per row inside RLS policies, so a
-- wrong guard would break every signed-in user. With a person's own id (the only
-- thing the app and the policies pass) the guard is a no-op: the new functions
-- return exactly what the old ones returned. Only a caller that passes somebody
-- else's id changes, and that is the point.
--
-- Rollback: recreate the previous definitions. The live text before this file is
-- kept as the "ORIGINAL md5" list in the production apply script, and the latest
-- migration that defined each function is in the repository history
-- (git log -S "<name>" -- supabase/migrations); some were later overridden by a
-- live edit, so restore from the backup table the operator creates before
-- applying this file.

CREATE OR REPLACE FUNCTION public.contar_solicitudes_pendientes(p_auth_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN 0;
  END IF;

  IF public.es_superadmin(
    (SELECT id FROM public.usuarios WHERE auth_id = p_auth_id)
  ) THEN
    SELECT COUNT(*) INTO v_count FROM public.solicitudes_grupo WHERE estado = 'pendiente';
  ELSE
    SELECT COUNT(*) INTO v_count FROM public.solicitudes_grupo s
    JOIN public.grupos g ON g.id = s.grupo_id
    WHERE s.estado = 'pendiente'
      AND public.es_director_general_de_grupo(p_auth_id, s.grupo_id);
  END IF;
  RETURN v_count;
END; $function$;

CREATE OR REPLACE FUNCTION public.es_admin_o_pastor(p_auth_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.usuario_roles ur ON ur.usuario_id = u.id
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE u.auth_id = p_auth_id
      AND rs.nombre_interno IN ('admin', 'pastor')
      -- The caller is the person in the session; only service_role may act for
      -- somebody else.
      AND (
        coalesce(auth.role(), '') = 'service_role'
        OR (auth.uid() IS NOT NULL AND p_auth_id IS NOT DISTINCT FROM auth.uid())
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.es_director_general_de_grupo(p_auth_id uuid, p_grupo_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid;
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_user_id FROM public.usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;
  IF public.es_superadmin(v_user_id) THEN RETURN TRUE; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_user_id AND rs.nombre_interno = 'director-general'
  ) THEN RETURN FALSE; END IF;
  RETURN public.gdv_dg_ve_grupo(v_user_id, p_grupo_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.mi_campus_principal(p_auth_uid uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT uc.campus_id
  FROM usuario_campus uc
  WHERE uc.usuario_id = p_auth_uid
    AND uc.es_campus_principal = true
    -- The caller is the person in the session; only service_role may act for
    -- somebody else.
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND p_auth_uid IS NOT DISTINCT FROM auth.uid())
    )
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.mis_campus_ids(p_auth_uid uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    array_agg(uc.campus_id),
    ARRAY[]::uuid[]
  )
  FROM usuario_campus uc
  WHERE uc.usuario_id = p_auth_uid
    -- The caller is the person in the session; only service_role may act for
    -- somebody else.
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND p_auth_uid IS NOT DISTINCT FROM auth.uid())
    );
$function$;

CREATE OR REPLACE FUNCTION public.obtener_roles_sistema_usuario(p_auth_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(rs.nombre_interno), ARRAY[]::text[])
  FROM usuario_roles ur
  JOIN roles_sistema rs ON ur.rol_id = rs.id
  JOIN usuarios u ON u.id = ur.usuario_id
  WHERE u.auth_id = p_auth_id
    -- The caller is the person in the session; only service_role may act for
    -- somebody else.
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND p_auth_id IS NOT DISTINCT FROM auth.uid())
    );
$function$;

CREATE OR REPLACE FUNCTION public.obtener_roles_usuario(p_auth_id uuid)
 RETURNS text[]
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT array_agg(rs.nombre_interno)
  FROM public.roles_sistema rs
  JOIN public.usuario_roles ur ON rs.id = ur.rol_id
  JOIN public.usuarios u ON ur.usuario_id = u.id
  WHERE u.auth_id = p_auth_id
    -- The caller is the person in the session; only service_role may act for
    -- somebody else.
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND p_auth_id IS NOT DISTINCT FROM auth.uid())
    );
$function$;

CREATE OR REPLACE FUNCTION public.obtener_segmentos_para_director(p_auth_id uuid, p_campus_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, nombre text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.nombre
  FROM public.usuarios u
  JOIN public.segmento_lideres sl ON sl.usuario_id = u.id AND sl.tipo_lider = 'director_etapa'
  JOIN public.segmentos s ON s.id = sl.segmento_id
  WHERE u.auth_id = p_auth_id
    -- NUEVO: filtro campus
    AND (p_campus_id IS NULL OR s.campus_id = p_campus_id)
    -- The caller is the person in the session; only service_role may act for
    -- somebody else.
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND p_auth_id IS NOT DISTINCT FROM auth.uid())
    )
  ORDER BY s.nombre;
$function$;

CREATE OR REPLACE FUNCTION public.puede_crear_grupo(p_auth_id uuid, p_segmento_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_es_admin boolean := false;
  v_es_director_general boolean := false;
  v_es_director_etapa boolean := false;
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN FALSE;
  END IF;

  IF p_auth_id IS NULL OR p_segmento_id IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT TRUE INTO v_es_admin
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin','pastor')
  LIMIT 1;
  IF v_es_admin THEN
    RETURN TRUE;
  END IF;

  -- A general director creates only in the segments assigned to them.
  SELECT TRUE INTO v_es_director_general
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno = 'director-general'
  LIMIT 1;
  IF v_es_director_general THEN
    IF EXISTS (
      SELECT 1 FROM public.director_general_segmentos dgs
      WHERE dgs.usuario_id = v_user_id
        AND dgs.segmento_id = p_segmento_id
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  SELECT TRUE INTO v_es_director_etapa
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id AND rs.nombre_interno = 'director-etapa'
  LIMIT 1;
  IF v_es_director_etapa THEN
    -- Debe supervisar el segmento (segmento_lideres) para poder crear en él
    IF EXISTS (
      SELECT 1 FROM public.segmento_lideres sl
      WHERE sl.usuario_id = v_user_id
        AND sl.segmento_id = p_segmento_id
        AND sl.tipo_lider = 'director_etapa'
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.puede_crear_usuario(p_auth_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_permitido boolean := false;
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN FALSE;
  END IF;

  IF p_auth_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Mapear auth_id a id interno
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Verificar si tiene alguno de los roles permitidos
  SELECT TRUE INTO v_permitido
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = v_user_id
    AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa')
  LIMIT 1;

  RETURN COALESCE(v_permitido, FALSE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.puede_editar_usuario(p_auth_id uuid, p_target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN FALSE;
  END IF;

  IF p_auth_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_actor_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_actor_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Autoedición
  IF v_actor_id = p_target_user_id THEN
    RETURN TRUE;
  END IF;

  -- El usuario objetivo debe existir
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = p_target_user_id) THEN
    RETURN FALSE;
  END IF;

  -- Regla global: Admin/Pastor
  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_actor_id
      AND rs.nombre_interno IN ('admin', 'pastor')
  ) THEN
    RETURN TRUE;
  END IF;

  -- Regla: Líder puede editar usuarios activos del mismo grupo
  IF EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm_actor
    JOIN public.grupo_miembros gm_objetivo
      ON gm_objetivo.grupo_id = gm_actor.grupo_id
    JOIN public.grupos g
      ON g.id = gm_actor.grupo_id
    WHERE gm_actor.usuario_id = v_actor_id
      AND gm_actor.rol = 'Líder'
      AND gm_actor.estado = 'activo'
      AND gm_actor.fecha_salida IS NULL
      AND gm_objetivo.usuario_id = p_target_user_id
      AND gm_objetivo.estado = 'activo'
      AND gm_objetivo.fecha_salida IS NULL
      AND g.activo = true
      AND g.eliminado = false
  ) THEN
    RETURN TRUE;
  END IF;

  -- Regla: Director de etapa puede editar usuarios activos en sus grupos asignados
  IF EXISTS (
    SELECT 1
    FROM public.director_etapa_grupos deg
    JOIN public.segmento_lideres sl
      ON sl.id = deg.director_etapa_id
    JOIN public.grupo_miembros gm_objetivo
      ON gm_objetivo.grupo_id = deg.grupo_id
    JOIN public.grupos g
      ON g.id = gm_objetivo.grupo_id
    WHERE sl.usuario_id = v_actor_id
      AND sl.tipo_lider = 'director_etapa'
      AND gm_objetivo.usuario_id = p_target_user_id
      AND gm_objetivo.estado = 'activo'
      AND gm_objetivo.fecha_salida IS NULL
      AND g.activo = true
      AND g.eliminado = false
  ) THEN
    RETURN TRUE;
  END IF;

  -- Regla: Director general (scoped) via función existente por grupo
  IF EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm_objetivo
    JOIN public.grupos g
      ON g.id = gm_objetivo.grupo_id
    WHERE gm_objetivo.usuario_id = p_target_user_id
      AND gm_objetivo.estado = 'activo'
      AND gm_objetivo.fecha_salida IS NULL
      AND g.activo = true
      AND g.eliminado = false
      AND public.es_director_general_de_grupo(p_auth_id, gm_objetivo.grupo_id)
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.puede_gestionar_casas(p_auth_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  internal_user_id uuid;
  es_gestor boolean;
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN FALSE;
  END IF;

  SELECT u.id INTO internal_user_id
  FROM public.usuarios u
  WHERE u.auth_id = p_auth_id;

  IF internal_user_id IS NULL THEN RETURN FALSE; END IF;

  -- Verificar roles de gestión (incluye lider para asignar casas a miembros de su grupo)
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id
      AND rs.nombre_interno IN ('admin','pastor','director-general','director-etapa','lider')
  ) INTO es_gestor;

  RETURN es_gestor;
END;
$function$;

CREATE OR REPLACE FUNCTION public.puede_gestionar_miembros(p_auth_id uuid, p_grupo_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  internal_user_id uuid;
  es_superior boolean;
  es_lider_del_grupo boolean;
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN FALSE;
  END IF;

  -- Resolver usuario interno
  SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF internal_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Roles con permiso explícito a nivel sistema
  SELECT EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id
      AND rs.nombre_interno IN ('admin','pastor','director-general','director-etapa')
  ) INTO es_superior;

  IF es_superior THEN
    -- Validar visibilidad mínima del grupo
    IF public.puede_ver_grupo(internal_user_id, p_grupo_id) IS NOT TRUE THEN
      RETURN FALSE;
    END IF;
    RETURN TRUE;
  END IF;

  -- Permitir a líderes del propio grupo
  SELECT EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm
    WHERE gm.grupo_id = p_grupo_id
      AND gm.usuario_id = internal_user_id
      AND gm.rol = 'Líder'
  ) INTO es_lider_del_grupo;

  IF es_lider_del_grupo THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.puede_ver_debug_toolbar(p_auth_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.debug_toolbar_whitelist w ON w.usuario_id = u.id
    WHERE u.auth_id = p_auth_id
      -- The caller is the person in the session; only service_role may act for
      -- somebody else.
      AND (
        coalesce(auth.role(), '') = 'service_role'
        OR (auth.uid() IS NOT NULL AND p_auth_id IS NOT DISTINCT FROM auth.uid())
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.tiene_rol_de_liderazgo(p_auth_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    obtener_roles_usuario(p_auth_id) && ARRAY['lider', 'director-etapa', 'director-general', 'pastor', 'admin'],
    false
  )
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  AND (
    coalesce(auth.role(), '') = 'service_role'
    OR (auth.uid() IS NOT NULL AND p_auth_id IS NOT DISTINCT FROM auth.uid())
  );
$function$;

-- Execution rights: signed-in people and the service client only (today's state).
REVOKE ALL ON FUNCTION public.contar_solicitudes_pendientes(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.es_admin_o_pastor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.es_director_general_de_grupo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mi_campus_principal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mis_campus_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_roles_sistema_usuario(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_roles_usuario(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_segmentos_para_director(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_crear_grupo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_crear_usuario(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_editar_usuario(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_gestionar_casas(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_gestionar_miembros(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_ver_debug_toolbar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tiene_rol_de_liderazgo(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.contar_solicitudes_pendientes(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.es_admin_o_pastor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.es_director_general_de_grupo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mi_campus_principal(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mis_campus_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_roles_sistema_usuario(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_roles_usuario(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_segmentos_para_director(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_crear_grupo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_crear_usuario(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_editar_usuario(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_casas(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_miembros(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_ver_debug_toolbar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tiene_rol_de_liderazgo(uuid) TO authenticated, service_role;
-- <<< END migration 20261002120000_definer_identidad_predicados.sql

-- ---------------------------------------------------------------------------
-- a. Own identity: the same as before, with both claim formats.
-- ---------------------------------------------------------------------------
INSERT INTO t_dp_failures
SELECT format('a own %s %s: before %s, after %s', o.probe, o.who, o.val, n.val)
  FROM t_dp_old o JOIN t_dp_who w ON w.who = o.who,
       LATERAL (SELECT pg_temp.run(o.probe, 'user', w.auth, w.auth) AS val) n
 WHERE n.val IS DISTINCT FROM o.val;

INSERT INTO t_dp_failures
SELECT format('a own (json claims) %s %s: before %s, after %s', o.probe, o.who, o.val, n.val)
  FROM t_dp_old o JOIN t_dp_who w ON w.who = o.who,
       LATERAL (SELECT pg_temp.run(o.probe, 'user_json', w.auth, w.auth) AS val) n
 WHERE n.val IS DISTINCT FROM o.val;

-- b. Foreign identity: the neutral value (the RED: before it was the other
-- person's answer).
INSERT INTO t_dp_failures
SELECT format('b foreign %s: session %s asks for %s, expected neutral %s, got %s', p.probe, c.s, c.t, pg_temp.dig(p.neutral_sql), x.val)
  FROM t_dp_probes p
  CROSS JOIN (VALUES ('leader', 'admin'), ('member', 'admin'), ('fx', 'admin'), ('admin', 'leader'), ('pastor', 'dg')) c(s, t),
       LATERAL (SELECT pg_temp.run(p.probe, 'user',
                                   (SELECT auth FROM t_dp_who WHERE who = c.s),
                                   (SELECT auth FROM t_dp_who WHERE who = c.t)) AS val) x
 WHERE pg_temp.sec('fn') AND x.val IS DISTINCT FROM pg_temp.dig(p.neutral_sql);

INSERT INTO t_dp_failures
SELECT format('b foreign (json claims) %s: leader asks for the admin, expected neutral, got %s', p.probe, x.val)
  FROM t_dp_probes p,
       LATERAL (SELECT pg_temp.run(p.probe, 'user_json',
                                   (SELECT auth FROM t_dp_who WHERE who = 'leader'),
                                   (SELECT auth FROM t_dp_who WHERE who = 'admin')) AS val) x
 WHERE pg_temp.sec('fn') AND x.val IS DISTINCT FROM pg_temp.dig(p.neutral_sql);

-- c. Service client, with anybody's id: the old answer for that person.
INSERT INTO t_dp_failures
SELECT format('c service %s %s (%s): before %s, after %s', o.probe, o.who, m.mode, o.val, n.val)
  FROM t_dp_old o JOIN t_dp_who w ON w.who = o.who
  CROSS JOIN (VALUES ('service'), ('service_json')) m(mode),
       LATERAL (SELECT pg_temp.run(o.probe, m.mode, NULL, w.auth) AS val) n
 WHERE n.val IS DISTINCT FROM o.val;

-- d. No session: neutral. A NULL argument inside a session: neutral.
INSERT INTO t_dp_failures
SELECT format('d nobody %s: expected neutral, got %s', p.probe, x.val)
  FROM t_dp_probes p,
       LATERAL (SELECT pg_temp.run(p.probe, 'nobody', NULL, (SELECT auth FROM t_dp_who WHERE who = 'admin')) AS val) x
 WHERE pg_temp.sec('fn') AND x.val IS DISTINCT FROM pg_temp.dig(p.neutral_sql);

INSERT INTO t_dp_failures
SELECT format('d null argument %s: expected neutral, got %s', p.probe, x.val)
  FROM t_dp_probes p,
       LATERAL (SELECT pg_temp.run(p.probe, 'user', (SELECT auth FROM t_dp_who WHERE who = 'admin'), NULL) AS val) x
 WHERE pg_temp.sec('fn') AND x.val IS DISTINCT FROM pg_temp.dig(p.neutral_sql);

-- d'. anon cannot execute any of the fifteen (42501): a call with NULL arguments.
INSERT INTO t_dp_failures
SELECT format('d anon %s: expected 42501, got %s', f.sig, x.st)
  FROM t_dp_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure,
       LATERAL (SELECT pg_temp.as_anon_state(format('SELECT * FROM public.%I(%s)', p.proname,
                  (SELECT string_agg('NULL::' || format_type(t, NULL), ', ') FROM unnest(p.proargtypes::oid[]) t))) AS st) x
 WHERE x.st IS DISTINCT FROM '42501';

-- e. Catalog.
INSERT INTO t_dp_failures
SELECT format('e catalog changed for %s: before [%s], after [%s]', o.sig, o.cat, pg_temp.cat_of(o.sig))
  FROM t_dp_cat_old o
 WHERE pg_temp.cat_of(o.sig) IS DISTINCT FROM o.cat;

INSERT INTO t_dp_failures
SELECT 'e search_path is not pinned to public for ' || f.sig
  FROM t_dp_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure
 WHERE p.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[];

INSERT INTO t_dp_failures
SELECT 'e the guard is missing from ' || f.sig
  FROM t_dp_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure JOIN pg_language l ON l.oid = p.prolang
 WHERE (l.lanname = 'plpgsql'
        AND (p.prosrc NOT LIKE '%v_request_role text := auth.role()%'
             OR p.prosrc NOT LIKE '%p_auth_id IS DISTINCT FROM auth.uid()%'
             OR p.prosrc NOT LIKE '%coalesce(v_request_role, '''') <> ''service_role''%'))
    OR (l.lanname = 'sql'
        AND (p.prosrc NOT LIKE '%coalesce(auth.role(), '''') = ''service_role''%'
             OR p.prosrc NOT LIKE '%IS NOT DISTINCT FROM auth.uid()%'));

INSERT INTO t_dp_failures
SELECT format('e %s privilege on %s: expected %s', r.priv_role, f.sig, r.expected)
  FROM t_dp_fns f
  CROSS JOIN (VALUES ('anon', false), ('authenticated', true), ('service_role', true)) r(priv_role, expected)
 WHERE has_function_privilege(r.priv_role, f.sig, 'execute') IS DISTINCT FROM r.expected;

INSERT INTO t_dp_failures
SELECT 'e PUBLIC can execute ' || f.sig
  FROM t_dp_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure,
       aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
 WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE';

-- e. Nothing else changed in the bodies: every line of the live body is still
-- there, in the same order (a trailing ';' is ignored: in the LANGUAGE sql
-- bodies the guard is added before the closing semicolon).
CREATE OR REPLACE FUNCTION pg_temp.lost_line(p_old text, p_new text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  o text[] := string_to_array(p_old, E'\n');
  n text[] := string_to_array(p_new, E'\n');
  i int;
  j int := 1;
BEGIN
  FOR i IN 1 .. coalesce(array_length(o, 1), 0) LOOP
    WHILE j <= array_length(n, 1)
          AND regexp_replace(n[j], ';\s*$', '') IS DISTINCT FROM regexp_replace(o[i], ';\s*$', '') LOOP
      j := j + 1;
    END LOOP;
    IF j > array_length(n, 1) THEN
      RETURN 'line ' || i || ': ' || o[i];
    END IF;
    j := j + 1;
  END LOOP;
  RETURN NULL;
END;
$$;

INSERT INTO t_dp_failures
SELECT 'e a line of the live body was changed or lost in ' || o.sig || ': '
       || pg_temp.lost_line(o.src, (SELECT p.prosrc FROM pg_proc p WHERE p.oid = o.sig::regprocedure))
  FROM t_dp_src_old o
 WHERE pg_temp.lost_line(o.src, (SELECT p.prosrc FROM pg_proc p WHERE p.oid = o.sig::regprocedure)) IS NOT NULL;

INSERT INTO t_dp_failures
SELECT 'e an out-of-scope function changed: ' || o.sig
  FROM t_dp_other_old o
 WHERE o.md5 IS DISTINCT FROM (SELECT md5(pg_get_functiondef(o.sig::regprocedure)));

-- f. RLS photo: the same rows through the policies, per person and table.
INSERT INTO t_dp_failures
SELECT format('f rls %s %s: before %s, after %s', o.tbl, o.who, o.val, n.val)
  FROM t_dp_rls_old o JOIN t_dp_who w ON w.who = o.who JOIN t_dp_tbl t ON t.tbl = o.tbl,
       LATERAL (SELECT pg_temp.photo(w.auth, o.tbl, t.lim) AS val) n
 WHERE n.val IS DISTINCT FROM o.val;

-- f. Write policies: the same outcome per person, table and command.
INSERT INTO t_dp_failures
SELECT format('f write %s %s: before %s, after %s', o.probe, o.who, o.val, n.val)
  FROM t_dp_wold o JOIN t_dp_who w ON w.who = o.who,
       LATERAL (SELECT pg_temp.wprobe(w.auth, pg_temp.wstmt(o.probe)) AS val) n
 WHERE n.val IS DISTINCT FROM o.val;

-- g. Dependents (not recreated here): the same for the person's own identity.
INSERT INTO t_dp_failures
SELECT format('g dependent %s %s: before %s, after %s', o.probe, o.who, o.val, n.val)
  FROM t_dp_dep_old o JOIN t_dp_who w ON w.who = o.who,
       LATERAL (SELECT pg_temp.run_dep(o.probe, 'user', w.auth, w.auth) AS val) n
 WHERE n.val IS DISTINCT FROM o.val;

SELECT count(*) AS failing_cases,
       coalesce((SELECT string_agg(k || ' x' || n, ', ' ORDER BY k)
                   FROM (SELECT split_part(case_name, ' ', 1) AS k, count(*) AS n FROM t_dp_failures GROUP BY 1) s), 'none') AS by_case,
       coalesce((SELECT string_agg(case_name, E'\n') FROM (SELECT case_name FROM t_dp_failures ORDER BY case_name LIMIT 30) f), 'all cases ok') AS first_30
  FROM t_dp_failures;

ROLLBACK;
