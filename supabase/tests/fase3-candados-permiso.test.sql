-- Permission gates and fixes of migration 20261003150000: the dashboard
-- summary, the two reports, the three event readers and the group-name
-- suggestion answer only to the people allowed to read them (unless the caller
-- is service_role); the one-argument kpis call resolves; and
-- asignar_director_etapa_a_ubicacion runs.
--
-- Covers:
--   a. Gated readers, every probe once before and once after the migration
--      block, as the admin, the general director, the director de etapa and
--      the leader (own session, role authenticated, both claim settings), as
--      service_role and, for the two functions without p_auth_id, with no
--      session:
--        resumen_dashboard_admin    global and for the campus with most groups
--        obtener_reporte_retencion  the latest season whose previous one has
--                                   members
--        obtener_reporte_crecimiento_neto  every group, and the leader's own
--                                   group as the leader
--        listar_eventos_grupo, obtener_evento_grupo, obtener_asistencia_evento
--                                   an event of a group the leader belongs to,
--                                   one of a group the director de etapa directs
--                                   and the leader cannot see, and one of a
--                                   group none of the three non-admins can see
--                                   (all with attendance rows); service_role
--                                   passes the leader's auth id
--        sugerir_nombre_grupo       the director de etapa's segment and a
--                                   segment neither director holds
--      The allowed set is computed before the block from the roles
--      (admin, pastor, director-general) or from puede_ver_grupo and
--      puede_crear_grupo asked through service_role. Allowed probes return the
--      same digest after as before; the others return the neutral value (NULL,
--      the zero retention object, {"timeline": []} or no rows). Before the
--      block, while the gates are not live, every denied probe must return
--      real data: that is the hole, the RED. On a run after the apply the
--      gates are live and the setup case expects the neutral value there.
--   b. obtener_kpis_grupos_para_usuario: the call with only p_auth_id (named,
--      as PostgREST sends it) fails with 42725 before and, after, equals the
--      two-argument call with p_campus_id NULL, which itself is unchanged.
--      The bodies of the two overloads are compared before the block: the
--      same text but the campus filter.
--   c. asignar_director_etapa_a_ubicacion, each call inside a subtransaction
--      that is rolled back: 'agregar' on a director that already has a row (the
--      ON CONFLICT path) and 'quitar', through service_role and as the general
--      director, fail with 42702 before and work after. The leader and the
--      director de etapa also fail with 42702 before (the broken permission
--      check let them through to it) and get 'Permiso denegado' after.
--      director_etapa_ubicaciones is unchanged at the end.
--   d. Catalog: signature, arguments, result, language, volatility, definer,
--      owner, strict, config, cost and ACL as before for the eight replaced
--      functions and the two-argument kpis; every line of each old body is
--      still in the new one, except the four lines asignar rewrites; anon
--      cannot execute, authenticated and service_role can, PUBLIC cannot; the
--      one-argument kpis is gone; md5 of every definition after the block.
--
-- Digests ignore nothing but the order of rows and of retention's
-- detalle_no_renovaron list, and kpis' fecha_ultima_actualizacion (now()). Every
-- probe goes through EXECUTE, so it resolves the functions afresh and the
-- probes after the migration block run the new bodies.
--
-- The migration is copied byte for byte between the two marker comments below.
--
-- Run against STAGING inside BEGIN...ROLLBACK: nothing here is kept and no row
-- is written outside temporary tables and the rolled-back subtransactions of
-- c. The last statement returns the failing cases (kind 'failure', none
-- expected; at most five per case plus a count), then the summary rows,
-- because the MCP tool returns only the last result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_cp_failures (case_name text, detail text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_cp_failures(case_name, detail) VALUES (p_case, p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.has_role(p_uid uuid, p_role text)
RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuario_roles ur
                   JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                  WHERE ur.usuario_id = p_uid AND rs.nombre_interno = p_role);
$$;

-- Identity simulation. Modes:
--   user     request.jwt.claim.sub plus the JSON request.jwt.claims (role
--            authenticated); runs as role authenticated
--   service  service_role in both claim settings, no sub; runs as role
--            service_role
--   nobody   no claims at all; stays postgres
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

-- One probe: p_sql (a statement returning one text value; $1 = the auth id
-- passed as p_auth_id, $2 and $3 = the other arguments) in the given session,
-- or the error.
CREATE OR REPLACE FUNCTION pg_temp.run(p_mode text, p_session uuid, p_sql text, p_auth uuid, p_a uuid, p_b uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  PERFORM pg_temp.set_session(p_mode, p_session);
  PERFORM pg_temp.as_role(p_mode);
  BEGIN
    EXECUTE p_sql INTO v USING p_auth, p_a, p_b;
  EXCEPTION
    WHEN OTHERS THEN v := 'ERR ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.set_session('nobody', NULL);
  RETURN v;
END;
$$;

-- Digest statements, built only from built-in functions so the probes need
-- nothing from pg_temp while they run as authenticated or service_role.
-- A json(b) value: 'NULL', or the md5 of its text with retention's
-- detalle_no_renovaron list sorted (jsonb_agg there has no ORDER BY).
CREATE OR REPLACE FUNCTION pg_temp.json_sql(p_call text)
RETURNS text LANGUAGE sql AS $$
  SELECT format($q$SELECT CASE WHEN x IS NULL THEN 'NULL' ELSE md5((x - 'detalle_no_renovaron')::text || '|'
           || coalesce((SELECT string_agg(e::text, ',' ORDER BY e::text)
                          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x -> 'detalle_no_renovaron') = 'array'
                                                         THEN x -> 'detalle_no_renovaron' ELSE '[]'::jsonb END) e), '')) END
           FROM (SELECT (%s)::jsonb AS x) s$q$, p_call);
$$;

-- A set of rows: "count:md5 of the sorted row texts", '0:-' when empty; kpis
-- rows drop fecha_ultima_actualizacion (now()).
CREATE OR REPLACE FUNCTION pg_temp.set_sql(p_call text)
RETURNS text LANGUAGE sql AS $$
  SELECT format($q$SELECT count(*) || ':' || coalesce(md5(string_agg(r, '|' ORDER BY r)), '-')
           FROM (SELECT (to_jsonb(t) - 'fecha_ultima_actualizacion')::text AS r FROM %s t) s$q$, p_call);
$$;

CREATE OR REPLACE FUNCTION pg_temp.eval(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  EXECUTE p_sql INTO v;
  RETURN v;
END;
$$;

-- c. One call of asignar_director_etapa_a_ubicacion inside a subtransaction
-- that is always rolled back: "<n> rows: id kept|new, director <bool>,
-- ubicacion <bool>", or the error.
CREATE OR REPLACE FUNCTION pg_temp.asignar(p_mode text, p_session uuid, p_auth uuid, p_de uuid, p_su uuid,
                                           p_accion text, p_existing uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  PERFORM pg_temp.set_session(p_mode, p_session);
  PERFORM pg_temp.as_role(p_mode);
  BEGIN
    EXECUTE 'SELECT count(*) || '' rows'' || coalesce('': '' || string_agg(format(''id %s, director %s, ubicacion %s'','
            || ' CASE WHEN t.id = $5 THEN ''kept'' ELSE ''new'' END, (t.director_etapa_id = $2)::text, (t.segmento_ubicacion_id = $3)::text), ''; ''), '''')'
            || ' FROM public.asignar_director_etapa_a_ubicacion($1, $2, $3, $4) t'
       INTO v USING p_auth, p_de, p_su, p_accion, p_existing;
    RAISE EXCEPTION USING ERRCODE = 'ZR001', MESSAGE = v;
  EXCEPTION
    WHEN SQLSTATE 'ZR001' THEN v := SQLERRM;
    WHEN OTHERS THEN v := 'ERR ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.set_session('nobody', NULL);
  RETURN v;
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ---------------------------------------------------------------------------
-- People and context.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_cp_who (who text PRIMARY KEY, auth uuid, uid uuid) ON COMMIT DROP;
INSERT INTO t_cp_who(who, auth, uid)
SELECT 'admin', u.auth_id, u.id FROM public.usuarios u
 WHERE '5df3b990-af3d-49b5-a061-025bc3598983'::uuid = u.auth_id;
INSERT INTO t_cp_who(who, auth, uid)
SELECT 'dg', u.auth_id, u.id FROM public.usuarios u
 WHERE '9f23ae7c-7008-4bd6-b449-89c326f8d1af'::uuid = u.auth_id;
INSERT INTO t_cp_who(who, auth, uid)
SELECT 'de', u.auth_id, u.id FROM public.usuarios u
 WHERE 'ee0efdea-2d85-479a-88ab-85720903aa2a'::uuid = u.auth_id;
INSERT INTO t_cp_who(who, auth, uid)
SELECT 'leader', u.auth_id, u.id FROM public.usuarios u
 WHERE '2efa6e21-bbf0-4fb3-a8fa-96e16b3e881d'::uuid = u.auth_id;

SELECT pg_temp.fail('setup', 'person not found: ' || w.who)
  FROM (VALUES ('admin'), ('dg'), ('de'), ('leader')) w(who)
 WHERE (SELECT uid FROM t_cp_who t WHERE t.who = w.who) IS NULL;

-- Each person holds the role the cases rely on, and only the admin and the
-- general director hold one of the roles of the global readers.
SELECT pg_temp.fail('setup', format('%s: role %s expected %s', c.who, c.rol, c.expected))
  FROM (VALUES ('admin', 'admin', true), ('dg', 'director-general', true), ('de', 'director-etapa', true),
               ('leader', 'lider', true),
               ('de', 'admin', false), ('de', 'pastor', false), ('de', 'director-general', false),
               ('leader', 'admin', false), ('leader', 'pastor', false), ('leader', 'director-general', false)) c(who, rol, expected)
 WHERE pg_temp.has_role((SELECT uid FROM t_cp_who WHERE who = c.who), c.rol) IS DISTINCT FROM c.expected;

CREATE OR REPLACE FUNCTION pg_temp.uid_of(p_who text)
RETURNS uuid LANGUAGE sql AS $$ SELECT uid FROM t_cp_who WHERE who = p_who; $$;
CREATE OR REPLACE FUNCTION pg_temp.auth_of(p_who text)
RETURNS uuid LANGUAGE sql AS $$ SELECT auth FROM t_cp_who WHERE who = p_who; $$;

CREATE TEMP TABLE t_cp_ctx (k text PRIMARY KEY, v uuid) ON COMMIT DROP;

INSERT INTO t_cp_ctx(k, v)
SELECT 'campus', (SELECT g.campus_id FROM public.grupos g WHERE g.campus_id IS NOT NULL
                   GROUP BY g.campus_id ORDER BY count(*) DESC, g.campus_id LIMIT 1);

-- The latest season whose previous season (the one retention picks) has members.
INSERT INTO t_cp_ctx(k, v)
SELECT 'temporada_retencion',
       (SELECT t1.id
          FROM public.temporadas t1
         CROSS JOIN LATERAL (SELECT t2.id FROM public.temporadas t2
                              WHERE t2.fecha_inicio < t1.fecha_inicio
                              ORDER BY t2.fecha_inicio DESC LIMIT 1) prev
         WHERE EXISTS (SELECT 1 FROM public.grupo_miembros gm JOIN public.grupos g ON g.id = gm.grupo_id
                        WHERE g.temporada_id = t1.id)
           AND EXISTS (SELECT 1 FROM public.grupo_miembros gm JOIN public.grupos g ON g.id = gm.grupo_id
                        WHERE g.temporada_id = prev.id)
         ORDER BY t1.fecha_inicio DESC LIMIT 1);

-- The latest season with groups, for the name suggestion.
INSERT INTO t_cp_ctx(k, v)
SELECT 'temporada_nombre',
       (SELECT t.id FROM public.temporadas t
         WHERE EXISTS (SELECT 1 FROM public.grupos g WHERE g.temporada_id = t.id)
         ORDER BY t.fecha_inicio DESC LIMIT 1);

-- The director de etapa's segment, and a segment neither director holds.
INSERT INTO t_cp_ctx(k, v)
SELECT 'segmento_de',
       (SELECT sl.segmento_id FROM public.segmento_lideres sl
         WHERE sl.usuario_id = pg_temp.uid_of('de') AND sl.tipo_lider = 'director_etapa'
         ORDER BY sl.segmento_id LIMIT 1);
INSERT INTO t_cp_ctx(k, v)
SELECT 'segmento_otro',
       (SELECT s.id FROM public.segmentos s
         WHERE NOT EXISTS (SELECT 1 FROM public.director_general_segmentos dgs
                            WHERE dgs.segmento_id = s.id AND dgs.usuario_id = pg_temp.uid_of('dg'))
           AND NOT EXISTS (SELECT 1 FROM public.segmento_lideres sl
                            WHERE sl.segmento_id = s.id AND sl.usuario_id IN (pg_temp.uid_of('dg'), pg_temp.uid_of('de')))
         ORDER BY s.id LIMIT 1);

-- Events, with attendance rows. Group visibility is asked through
-- service_role, which puede_ver_grupo answers about anybody.
SELECT pg_temp.set_session('service', NULL);

CREATE TEMP TABLE t_cp_vis ON COMMIT DROP AS
SELECT g.id AS grupo,
       public.puede_ver_grupo(pg_temp.uid_of('dg'), g.id) AS dg,
       public.puede_ver_grupo(pg_temp.uid_of('de'), g.id) AS de,
       public.puede_ver_grupo(pg_temp.uid_of('leader'), g.id) AS leader
  FROM public.grupos g
 WHERE EXISTS (SELECT 1 FROM public.eventos_grupo eg JOIN public.asistencia a ON a.evento_grupo_id = eg.id
                WHERE eg.grupo_id = g.id);

INSERT INTO t_cp_ctx(k, v)
SELECT 'evento_lider',
       (SELECT eg.id FROM public.eventos_grupo eg JOIN t_cp_vis v ON v.grupo = eg.grupo_id
         WHERE v.leader
           AND EXISTS (SELECT 1 FROM public.grupo_miembros gm WHERE gm.grupo_id = eg.grupo_id AND gm.usuario_id = pg_temp.uid_of('leader'))
           AND EXISTS (SELECT 1 FROM public.asistencia a WHERE a.evento_grupo_id = eg.id)
         ORDER BY eg.fecha DESC, eg.id LIMIT 1);
INSERT INTO t_cp_ctx(k, v)
SELECT 'evento_de',
       (SELECT eg.id FROM public.eventos_grupo eg JOIN t_cp_vis v ON v.grupo = eg.grupo_id
         WHERE v.de AND NOT v.leader
           AND EXISTS (SELECT 1 FROM public.director_etapa_grupos deg JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
                        WHERE deg.grupo_id = eg.grupo_id AND sl.usuario_id = pg_temp.uid_of('de'))
           AND EXISTS (SELECT 1 FROM public.asistencia a WHERE a.evento_grupo_id = eg.id)
         ORDER BY eg.fecha DESC, eg.id LIMIT 1);
INSERT INTO t_cp_ctx(k, v)
SELECT 'evento_ajeno',
       (SELECT eg.id FROM public.eventos_grupo eg JOIN t_cp_vis v ON v.grupo = eg.grupo_id
         WHERE NOT v.dg AND NOT v.de AND NOT v.leader
           AND EXISTS (SELECT 1 FROM public.asistencia a WHERE a.evento_grupo_id = eg.id)
         ORDER BY eg.fecha DESC, eg.id LIMIT 1);

INSERT INTO t_cp_ctx(k, v)
SELECT replace(c.k, 'evento', 'grupo'), (SELECT eg.grupo_id FROM public.eventos_grupo eg WHERE eg.id = c.v)
  FROM t_cp_ctx c WHERE c.k LIKE 'evento_%';

-- c. A director de etapa that already has a ubicacion (the ON CONFLICT path),
-- and another ubicacion to move it to.
INSERT INTO t_cp_ctx(k, v)
SELECT 'asg_director', (SELECT deu.director_etapa_id FROM public.director_etapa_ubicaciones deu
                          JOIN public.segmento_lideres sl ON sl.id = deu.director_etapa_id AND sl.tipo_lider = 'director_etapa'
                         ORDER BY deu.id LIMIT 1);
INSERT INTO t_cp_ctx(k, v)
SELECT 'asg_fila', (SELECT deu.id FROM public.director_etapa_ubicaciones deu
                     WHERE deu.director_etapa_id = (SELECT v FROM t_cp_ctx WHERE k = 'asg_director'));
INSERT INTO t_cp_ctx(k, v)
SELECT 'asg_ubicacion', (SELECT su.id FROM public.segmento_ubicaciones su
                          WHERE su.id <> (SELECT deu.segmento_ubicacion_id FROM public.director_etapa_ubicaciones deu
                                           WHERE deu.id = (SELECT v FROM t_cp_ctx WHERE k = 'asg_fila'))
                          ORDER BY su.id LIMIT 1);

SELECT pg_temp.fail('setup', 'context not found: ' || k)
  FROM (VALUES ('campus'), ('temporada_retencion'), ('temporada_nombre'), ('segmento_de'), ('segmento_otro'),
               ('evento_lider'), ('evento_de'), ('evento_ajeno'), ('grupo_lider'), ('grupo_de'), ('grupo_ajeno'),
               ('asg_director'), ('asg_fila'), ('asg_ubicacion')) x(k)
 WHERE NOT EXISTS (SELECT 1 FROM t_cp_ctx c WHERE c.k = x.k AND c.v IS NOT NULL);

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text)
RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM t_cp_ctx WHERE k = p_k; $$;

-- ---------------------------------------------------------------------------
-- a. and b. Probes. who: admin, dg, de, leader (own session), service,
-- nobody. arg: whose auth id goes in p_auth_id.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_cp_fn (fn text PRIMARY KEY, gated boolean, sql text, neutral text) ON COMMIT DROP;
INSERT INTO t_cp_fn(fn, gated, sql) VALUES
  ('resumen',     true,  pg_temp.json_sql('public.resumen_dashboard_admin($2)')),
  ('retencion',   true,  pg_temp.json_sql('public.obtener_reporte_retencion($1, $2, NULL, NULL)')),
  ('crecimiento', true,  pg_temp.json_sql('public.obtener_reporte_crecimiento_neto($1, $2, NULL, 6)')),
  ('listar',      true,  pg_temp.set_sql('public.listar_eventos_grupo($1, $2, 50, 0)')),
  ('evento',      true,  pg_temp.set_sql('public.obtener_evento_grupo($1, $2)')),
  ('asistencia',  true,  pg_temp.set_sql('public.obtener_asistencia_evento($1, $2)')),
  ('sugerir',     true,  $q$SELECT coalesce(public.sugerir_nombre_grupo('Barquisimeto', $2, $3), 'NULL')$q$),
  ('kpis1',       false, pg_temp.set_sql('public.obtener_kpis_grupos_para_usuario(p_auth_id => $1)')),
  ('kpis2',       false, pg_temp.set_sql('public.obtener_kpis_grupos_para_usuario(p_auth_id => $1, p_campus_id => $2)'));

-- What a denied caller gets, digested like the answers.
UPDATE t_cp_fn SET neutral = 'NULL' WHERE fn IN ('resumen', 'sugerir');
UPDATE t_cp_fn SET neutral = '0:-' WHERE fn IN ('listar', 'evento', 'asistencia');
UPDATE t_cp_fn SET neutral = pg_temp.eval(pg_temp.json_sql($q$jsonb_build_object('miembros_que_continuaron', 0,
         'miembros_anteriores', 0, 'miembros_nuevos', 0, 'miembros_no_renovaron', 0, 'pct_retencion', 0,
         'detalle_no_renovaron', '[]'::jsonb)$q$))
 WHERE fn = 'retencion';
UPDATE t_cp_fn SET neutral = pg_temp.eval(pg_temp.json_sql($q$'{"timeline": []}'::jsonb$q$)) WHERE fn = 'crecimiento';

CREATE TEMP TABLE t_cp_case (case_name text PRIMARY KEY, fn text, mode text, s_who text, arg_who text,
                             a uuid, b uuid, allowed boolean) ON COMMIT DROP;

-- resumen: global and campus; everybody incl. no session.
INSERT INTO t_cp_case(case_name, fn, mode, s_who, arg_who, a)
SELECT format('resumen %s %s', w.who, s.label), 'resumen',
       CASE WHEN w.who IN ('service', 'nobody') THEN w.who ELSE 'user' END,
       CASE WHEN w.who IN ('service', 'nobody') THEN NULL ELSE w.who END, NULL, s.a
  FROM (VALUES ('admin'), ('dg'), ('de'), ('leader'), ('service'), ('nobody')) w(who)
 CROSS JOIN (VALUES ('global', NULL::uuid), ('campus', pg_temp.ctx('campus'))) s(label, a);

-- The reports: own session or service_role with the admin's auth id.
INSERT INTO t_cp_case(case_name, fn, mode, s_who, arg_who, a)
SELECT format('%s %s', f.fn, w.who), f.fn,
       CASE WHEN w.who = 'service' THEN 'service' ELSE 'user' END,
       CASE WHEN w.who = 'service' THEN NULL ELSE w.who END,
       CASE WHEN w.who = 'service' THEN 'admin' ELSE w.who END,
       CASE WHEN f.fn = 'retencion' THEN pg_temp.ctx('temporada_retencion') END
  FROM (VALUES ('retencion'), ('crecimiento'), ('kpis1'), ('kpis2')) f(fn)
 CROSS JOIN (VALUES ('admin'), ('dg'), ('de'), ('leader'), ('service')) w(who);
INSERT INTO t_cp_case(case_name, fn, mode, s_who, arg_who, a) VALUES
  ('crecimiento leader own group', 'crecimiento', 'user', 'leader', 'leader', pg_temp.ctx('grupo_lider'));

-- The event readers: three events; service_role passes the leader's auth id.
INSERT INTO t_cp_case(case_name, fn, mode, s_who, arg_who, a)
SELECT format('%s %s %s', f.fn, w.who, e.label), f.fn,
       CASE WHEN w.who = 'service' THEN 'service' ELSE 'user' END,
       CASE WHEN w.who = 'service' THEN NULL ELSE w.who END,
       CASE WHEN w.who = 'service' THEN 'leader' ELSE w.who END,
       CASE WHEN f.fn = 'listar' THEN pg_temp.ctx('grupo_' || e.label) ELSE pg_temp.ctx('evento_' || e.label) END
  FROM (VALUES ('listar'), ('evento'), ('asistencia')) f(fn)
 CROSS JOIN (VALUES ('admin'), ('dg'), ('de'), ('leader'), ('service')) w(who)
 CROSS JOIN (VALUES ('lider'), ('de'), ('ajeno')) e(label);

-- sugerir: two segments; everybody incl. no session.
INSERT INTO t_cp_case(case_name, fn, mode, s_who, arg_who, a, b)
SELECT format('sugerir %s %s', w.who, s.label), 'sugerir',
       CASE WHEN w.who IN ('service', 'nobody') THEN w.who ELSE 'user' END,
       CASE WHEN w.who IN ('service', 'nobody') THEN NULL ELSE w.who END, NULL,
       pg_temp.ctx('temporada_nombre'), pg_temp.ctx('segmento_' || s.label)
  FROM (VALUES ('admin'), ('dg'), ('de'), ('leader'), ('service'), ('nobody')) w(who)
 CROSS JOIN (VALUES ('de'), ('otro')) s(label);

-- Who is allowed, from the live rules (service_role claims, still set, so
-- puede_ver_grupo and puede_crear_grupo answer about anybody).
UPDATE t_cp_case c SET allowed = CASE
  WHEN c.fn IN ('kpis1', 'kpis2') THEN true
  WHEN c.mode = 'service' THEN true
  WHEN c.mode = 'nobody' THEN false
  WHEN c.fn IN ('resumen', 'retencion', 'crecimiento') THEN
       pg_temp.has_role(pg_temp.uid_of(c.s_who), 'admin') OR pg_temp.has_role(pg_temp.uid_of(c.s_who), 'pastor')
       OR pg_temp.has_role(pg_temp.uid_of(c.s_who), 'director-general')
  WHEN c.fn = 'listar' THEN public.puede_ver_grupo(pg_temp.uid_of(c.s_who), c.a)
  WHEN c.fn IN ('evento', 'asistencia') THEN
       public.puede_ver_grupo(pg_temp.uid_of(c.s_who), (SELECT eg.grupo_id FROM public.eventos_grupo eg WHERE eg.id = c.a))
  WHEN c.fn = 'sugerir' THEN public.puede_crear_grupo(pg_temp.auth_of(c.s_who), c.b)
END;

SELECT pg_temp.set_session('nobody', NULL);

-- ---------------------------------------------------------------------------
-- BEFORE the migration, from the live text.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_cp_fns (sig text PRIMARY KEY, marker text) ON COMMIT DROP;
INSERT INTO t_cp_fns(sig, marker) VALUES
  ('public.resumen_dashboard_admin(uuid)',                          $m$IN ('admin', 'pastor', 'director-general')$m$),
  ('public.obtener_reporte_retencion(uuid,uuid,uuid,uuid)',         $m$IN ('admin', 'pastor', 'director-general')$m$),
  ('public.obtener_reporte_crecimiento_neto(uuid,uuid,uuid,integer)', $m$IN ('admin', 'pastor', 'director-general')$m$),
  ('public.listar_eventos_grupo(uuid,uuid,integer,integer)',        'public.puede_ver_grupo(v_usuario_id, p_grupo_id)'),
  ('public.obtener_evento_grupo(uuid,uuid)',                        'public.puede_ver_grupo(v_usuario_id, v_grupo_id)'),
  ('public.obtener_asistencia_evento(uuid,uuid)',                   'public.puede_ver_grupo(v_usuario_id, v_grupo_id)'),
  ('public.sugerir_nombre_grupo(text,uuid,uuid)',                   'public.puede_crear_grupo(auth.uid(), p_segmento_id)'),
  ('public.asignar_director_etapa_a_ubicacion(uuid,uuid,uuid,text)', 'ON CONFLICT ON CONSTRAINT director_etapa_ubicaciones_director_unique'),
  ('public.obtener_kpis_grupos_para_usuario(uuid,uuid)',            NULL);

-- Everything of the catalog row that must not change.
CREATE OR REPLACE FUNCTION pg_temp.cat_of(p_sig text)
RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws(' | ',
           p.oid::regprocedure::text,
           pg_get_function_arguments(p.oid),
           pg_get_function_result(p.oid),
           'language=' || l.lanname,
           'volatile=' || p.provolatile::text,
           'definer=' || p.prosecdef::text,
           'owner=' || p.proowner::regrole::text,
           'strict=' || p.proisstrict::text,
           'config=' || coalesce(p.proconfig::text, 'NULL'),
           'cost=' || p.procost::text,
           'acl=' || coalesce(p.proacl::text, 'NULL'))
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.oid = to_regprocedure(p_sig);
$$;

CREATE TEMP TABLE t_cp_cat_old ON COMMIT DROP AS
SELECT f.sig, pg_temp.cat_of(f.sig) AS cat, p.prosrc AS src,
       f.marker IS NOT NULL AND strpos(p.prosrc, f.marker) > 0 AS fixed
  FROM t_cp_fns f JOIN pg_proc p ON p.oid = to_regprocedure(f.sig);

SELECT pg_temp.fail('setup', 'function not found: ' || f.sig)
  FROM t_cp_fns f WHERE to_regprocedure(f.sig) IS NULL;

-- The seven gates and the 42702 fix are live in none of the bodies (before the
-- apply) or in all eight (a run after it); anything in between is broken.
SELECT pg_temp.fail('setup', 'the migration is live in some functions only: '
                    || string_agg(sig, ', ' ORDER BY sig) FILTER (WHERE fixed))
  FROM t_cp_cat_old WHERE sig <> 'public.obtener_kpis_grupos_para_usuario(uuid,uuid)'
HAVING count(*) FILTER (WHERE fixed) NOT IN (0, 8);

CREATE OR REPLACE FUNCTION pg_temp.applied()
RETURNS boolean LANGUAGE sql AS $$
  SELECT coalesce(bool_or(fixed), false) FROM t_cp_cat_old;
$$;

SELECT pg_temp.fail('setup', format('one-argument kpis overload: expected %s', CASE WHEN pg_temp.applied() THEN 'gone' ELSE 'present' END))
 WHERE (to_regprocedure('public.obtener_kpis_grupos_para_usuario(uuid)') IS NULL) IS DISTINCT FROM pg_temp.applied();

-- b. The two kpis overloads are the same text but the campus filter (and the
-- newline before $function$).
SELECT pg_temp.fail('setup', 'the kpis overloads differ beyond the campus filter')
  FROM pg_proc p1, pg_proc p2
 WHERE p1.oid = to_regprocedure('public.obtener_kpis_grupos_para_usuario(uuid)')
   AND p2.oid = to_regprocedure('public.obtener_kpis_grupos_para_usuario(uuid,uuid)')
   AND rtrim(p1.prosrc, E'\n') IS DISTINCT FROM rtrim(replace(p2.prosrc,
         E'\n    -- NUEVO: filtro campus\n    AND (p_campus_id IS NULL OR v.grupo_id IN (\n'
         || E'      SELECT g.id FROM public.grupos g WHERE g.campus_id = p_campus_id\n    ))', ''), E'\n');
SELECT pg_temp.fail('setup', 'the two-argument kpis has no campus filter to remove')
  FROM pg_proc p2
 WHERE p2.oid = to_regprocedure('public.obtener_kpis_grupos_para_usuario(uuid,uuid)')
   AND strpos(p2.prosrc, '-- NUEVO: filtro campus') = 0;

CREATE TEMP TABLE t_cp_old (case_name text PRIMARY KEY, val text) ON COMMIT DROP;
INSERT INTO t_cp_old(case_name, val)
SELECT c.case_name, pg_temp.run(c.mode, pg_temp.auth_of(c.s_who), f.sql, pg_temp.auth_of(c.arg_who), c.a, c.b)
  FROM t_cp_case c JOIN t_cp_fn f USING (fn);

SELECT pg_temp.fail('setup', format('live %s raised: %s', o.case_name, o.val))
  FROM t_cp_old o JOIN t_cp_case c USING (case_name)
 WHERE o.val LIKE 'ERR%' AND c.fn <> 'kpis1';

-- Every gated function has allowed probes with real answers and denied probes.
SELECT pg_temp.fail('setup', format('%s: %s allowed with data, %s denied', f.fn,
                    count(*) FILTER (WHERE c.allowed AND o.val <> f.neutral), count(*) FILTER (WHERE NOT c.allowed)))
  FROM t_cp_fn f JOIN t_cp_case c USING (fn) JOIN t_cp_old o USING (case_name)
 WHERE f.gated
 GROUP BY f.fn
HAVING count(*) FILTER (WHERE c.allowed AND o.val <> f.neutral) = 0 OR count(*) FILTER (WHERE NOT c.allowed) = 0;

-- The leader sees the event of its own group and not the other two; the
-- director de etapa sees its group's event and not the third.
SELECT pg_temp.fail('setup', format('%s: allowed %s, expected %s', c.case_name, c.allowed, x.expected))
  FROM (VALUES ('listar leader lider', true), ('listar leader de', false), ('listar leader ajeno', false),
               ('listar de de', true), ('listar de ajeno', false), ('listar dg ajeno', false),
               ('sugerir leader de', false), ('sugerir de de', true), ('sugerir de otro', false),
               ('sugerir admin otro', true)) x(case_name, expected)
  JOIN t_cp_case c USING (case_name)
 WHERE c.allowed IS DISTINCT FROM x.expected;

-- The RED: without the gates a denied caller gets real data. On a run after the
-- apply the gates are live and it gets the neutral value already.
SELECT pg_temp.fail('setup', format('live %s: expected %s, got %s', o.case_name,
                    CASE WHEN pg_temp.applied() THEN 'the neutral value ' || f.neutral ELSE 'real data' END, o.val))
  FROM t_cp_old o JOIN t_cp_case c USING (case_name) JOIN t_cp_fn f USING (fn)
 WHERE f.gated AND NOT c.allowed
   AND (o.val = f.neutral) IS DISTINCT FROM pg_temp.applied();

-- b. Before: the one-argument call is ambiguous (42725); after the apply it
-- answers like the two-argument call.
SELECT pg_temp.fail('setup', format('live %s: expected %s, got %s', o.case_name,
                    CASE WHEN pg_temp.applied() THEN 'the answer of ' || o2.case_name ELSE 'ERR 42725' END, o.val))
  FROM t_cp_old o JOIN t_cp_case c USING (case_name)
  JOIN t_cp_old o2 ON o2.case_name = replace(o.case_name, 'kpis1', 'kpis2')
 WHERE c.fn = 'kpis1'
   AND CASE WHEN pg_temp.applied() THEN o.val IS DISTINCT FROM o2.val ELSE o.val NOT LIKE 'ERR 42725 %' END;

-- c. asignar_director_etapa_a_ubicacion before.
CREATE TEMP TABLE t_cp_asg (case_name text PRIMARY KEY, mode text, s_who text, arg_who text, accion text, expected text) ON COMMIT DROP;
INSERT INTO t_cp_asg(case_name, mode, s_who, arg_who, accion, expected) VALUES
  ('asignar service agregar', 'service', NULL,     'admin',  'agregar', '1 rows: id kept, director true, ubicacion true'),
  ('asignar service quitar',  'service', NULL,     'admin',  'quitar',  '0 rows'),
  ('asignar dg agregar',      'user',    'dg',     'dg',     'agregar', '1 rows: id kept, director true, ubicacion true'),
  ('asignar leader agregar',  'user',    'leader', 'leader', 'agregar', 'ERR P0001 Permiso denegado'),
  ('asignar de agregar',      'user',    'de',     'de',     'agregar', 'ERR P0001 Permiso denegado');

CREATE OR REPLACE FUNCTION pg_temp.run_asg(p_case text)
RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.asignar(a.mode, pg_temp.auth_of(a.s_who), pg_temp.auth_of(a.arg_who),
                         pg_temp.ctx('asg_director'), pg_temp.ctx('asg_ubicacion'), a.accion, pg_temp.ctx('asg_fila'))
    FROM t_cp_asg a WHERE a.case_name = p_case;
$$;

CREATE TEMP TABLE t_cp_deu_old ON COMMIT DROP AS
SELECT count(*) AS n, md5(string_agg(d::text, '|' ORDER BY d.id)) AS digest FROM public.director_etapa_ubicaciones d;

CREATE TEMP TABLE t_cp_asg_old (case_name text PRIMARY KEY, val text) ON COMMIT DROP;
INSERT INTO t_cp_asg_old(case_name, val) SELECT a.case_name, pg_temp.run_asg(a.case_name) FROM t_cp_asg a;

-- The RED: before the fix the function fails with 42702 for everybody, the
-- leader and the director de etapa included (the permission check let them
-- through).
SELECT pg_temp.fail('setup', format('live %s: expected %s, got %s', a.case_name,
                    CASE WHEN pg_temp.applied() THEN a.expected
                         ELSE 'ERR 42702 column reference "id" is ambiguous' END, o.val))
  FROM t_cp_asg a JOIN t_cp_asg_old o USING (case_name)
 WHERE o.val IS DISTINCT FROM CASE WHEN pg_temp.applied() THEN a.expected
                                   ELSE 'ERR 42702 column reference "id" is ambiguous' END;

-- >>> BEGIN migration 20261003150000_candados_permiso_y_arreglos.sql (byte-identical copy)
-- Permission gates on readers that every signed-in person could run over the
-- whole database, and fixes to two broken functions (security phase 3,
-- batch L3).
--
-- Phase 2 pinned p_auth_id to auth.uid() in these functions, so nobody can ask
-- as somebody else any more. But being yourself was enough: any signed-in
-- person read global totals, retention and growth over every group, and the
-- events and attendance of any group. This file adds the missing permission
-- check to each one. Unless the request role is service_role, a caller without
-- the permission gets the value the function already returns when there is
-- nothing to show, never an error, so the app renders an empty state:
--
--   resumen_dashboard_admin(p_campus_id)
--     Gate: the session person (auth.uid()) holds admin, pastor or
--     director-general, the roles app/(auth)/dashboard/page.tsx renders
--     DashboardAdmin for. Callers: components/dashboard/roles/DashboardAdmin.tsx
--     (campus refresh) and lib/dashboard/obtenerDatosDashboard.ts
--     (obtenerKpisCampus, only for admin and pastor). Neutral value: NULL.
--     It had no check at all; with no session it also returns NULL now.
--   obtener_reporte_retencion, obtener_reporte_crecimiento_neto
--     Gate: the person of p_auth_id (already pinned to the session) holds
--     admin, pastor or director-general. The server actions in
--     lib/actions/asistencia-avanzada.actions.ts that call them have no caller
--     in the app today, so there is no page gate to mirror; these are the
--     roles of the global dashboard. Neutral values: retention returns the
--     all-zero object it returns for a season without a previous one;
--     growth returns {"timeline": []}, what its COALESCE falls back to when no
--     month is listed. Both parse with the app's zod schemas.
--   listar_eventos_grupo, obtener_evento_grupo, obtener_asistencia_evento
--     Gate: public.puede_ver_grupo(<usuarios.id of p_auth_id>, <group>), the
--     rule of the grupos policies, bound to the session person since batch
--     L2. The two readers by event take the group from the event row. Callers:
--     app/(auth)/grupos-vida/[id]/asistencia/[eventoId]/page.tsx and
--     .../asistencia/editar/[eventoId]/page.tsx (the last two);
--     listar_eventos_grupo only in scripts/test-rpc-asistencia.ts. Neutral
--     value: no rows, what an unknown group or event returns.
--   sugerir_nombre_grupo(p_ubicacion, p_temporada_id, p_segmento_id)
--     Gate: public.puede_crear_grupo(auth.uid(), p_segmento_id), the check
--     crear_grupo_con_director runs when the group is created. Caller:
--     app/api/grupos/sugerir-nombre/route.ts with the session client, for
--     components/forms/GroupCreateForm.tsx; whoever may create the group gets
--     the same name as before. Neutral value: NULL. The check runs after the
--     parameter check, so invalid parameters still raise as before.
--
-- service_role skips every gate, as it skips the identity guard of phase 2, so
-- the service client keeps its answers. For the event readers that means it
-- still reads any group for any p_auth_id.
--
-- Fixes:
--   * obtener_kpis_grupos_para_usuario had two overloads, (p_auth_id) and
--     (p_auth_id, p_campus_id DEFAULT NULL). A call with only p_auth_id, which
--     app/api/grupos/kpis/route.ts sends when no campus is selected, matches
--     both and fails with 42725. The two bodies are the same text except the
--     campus filter "AND (p_campus_id IS NULL OR ...)", true when p_campus_id
--     is NULL, and the newline before the closing $function$. The
--     one-argument overload is dropped, so that call resolves to the other
--     with p_campus_id NULL and returns what the dropped one returned.
--   * asignar_director_etapa_a_ubicacion returns TABLE(id, director_etapa_id,
--     segmento_ubicacion_id). Those OUT columns are plpgsql variables, so
--     "WHERE id = ...", "ON CONFLICT (director_etapa_id)" and the DELETE's
--     "WHERE director_etapa_id = ..." were ambiguous (42702) and the function
--     never ran past its permission check. The SELECT and the DELETE now use
--     table aliases. An ON CONFLICT column list cannot be qualified, so it
--     names the unique constraint on director_etapa_id instead
--     (director_etapa_ubicaciones_director_unique, from
--     20251006214500_enforce_unique_director_ciudad.sql); the block before
--     the function fails the migration if that constraint is missing. No app
--     code calls the function.
--     Its permission check was broken too, hidden behind the 42702: "SELECT
--     TRUE INTO v_es_superior ... LIMIT 1" sets the variable to NULL when the
--     caller is not admin, pastor or director-general, and "IF NOT NULL" does
--     not raise, so any signed-in person reached the INSERT and the DELETE (the
--     suite showed a leader moving a director's ubicacion). The check now reads
--     coalesce(v_es_superior, false). Without it, fixing the 42702 alone would
--     have opened director_etapa_ubicaciones to every signed-in person.
--
-- What does not change: signatures, parameter names and defaults, return
-- types, LANGUAGE plpgsql, the definer flag, owner, volatility (the reports
-- STABLE, the rest VOLATILE), search_path, and the rest of every body, line for
-- line (the suite checks it; asignar_director_etapa_a_ubicacion rewrites only
-- the four lines named above). Grants are restated at the end, today's state:
-- no anon, no PUBLIC; authenticated and service_role execute.
--
-- Rollback: recreate the eight replaced functions and the dropped overload from
-- the backup taken before the apply (pg_get_functiondef). The one-argument kpis
-- overload was last defined in
-- 20261002100000_definer_identidad_lecturas_grupos.sql; restoring it brings the
-- 42725 back.

-- ---------------------------------------------------------------------------
-- resumen_dashboard_admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resumen_dashboard_admin(p_campus_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
  resultado json;
BEGIN
  -- Global totals are for admin, pastor and the general director, the roles
  -- that render DashboardAdmin; anybody else gets NULL. Only service_role
  -- skips the check.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND NOT EXISTS (
       SELECT 1
       FROM public.usuarios u
       JOIN public.usuario_roles ur ON ur.usuario_id = u.id
       JOIN public.roles_sistema rs ON rs.id = ur.rol_id
       WHERE u.auth_id = auth.uid()
         AND rs.nombre_interno IN ('admin', 'pastor', 'director-general')
     ) THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'total_usuarios', (
      SELECT count(*) FROM usuarios u
      WHERE (p_campus_id IS NULL OR u.id IN (
        SELECT uc.usuario_id FROM usuario_campus uc WHERE uc.campus_id = p_campus_id
      ))
    ),
    'total_grupos', (
      SELECT count(*) FROM grupos g
      WHERE (p_campus_id IS NULL OR g.campus_id = p_campus_id)
    ),
    'total_asistencias', (SELECT count(*) FROM asistencia)
  ) INTO resultado;

  RETURN resultado;
END;
$function$;

-- ---------------------------------------------------------------------------
-- obtener_reporte_retencion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_reporte_retencion(p_auth_id uuid, p_temporada_actual_id uuid, p_temporada_anterior_id uuid DEFAULT NULL::uuid, p_campus_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_user_id uuid;
  v_resultado jsonb;
  v_anterior_id uuid;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  SELECT id INTO v_user_id FROM usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  -- The report reads the members of every group: admin, pastor and the
  -- general director only. Anybody else gets the answer for a season without
  -- a previous one (all zeros). Only service_role skips the check.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND NOT EXISTS (
       SELECT 1
       FROM public.usuario_roles ur
       JOIN public.roles_sistema rs ON rs.id = ur.rol_id
       WHERE ur.usuario_id = v_user_id
         AND rs.nombre_interno IN ('admin', 'pastor', 'director-general')
     ) THEN
    RETURN jsonb_build_object(
      'miembros_que_continuaron', 0,
      'miembros_anteriores', 0,
      'miembros_nuevos', 0,
      'miembros_no_renovaron', 0,
      'pct_retencion', 0,
      'detalle_no_renovaron', '[]'::jsonb
    );
  END IF;

  IF p_temporada_anterior_id IS NULL THEN
    SELECT t2.id INTO v_anterior_id
    FROM temporadas t1
    JOIN temporadas t2 ON t2.fecha_inicio < t1.fecha_inicio
    WHERE t1.id = p_temporada_actual_id
    ORDER BY t2.fecha_inicio DESC
    LIMIT 1;
  ELSE
    v_anterior_id := p_temporada_anterior_id;
  END IF;

  IF v_anterior_id IS NULL THEN
    RETURN jsonb_build_object(
      'miembros_que_continuaron', 0,
      'miembros_anteriores', 0,
      'miembros_nuevos', 0,
      'miembros_no_renovaron', 0,
      'pct_retencion', 0,
      'detalle_no_renovaron', '[]'::jsonb
    );
  END IF;

  WITH miembros_anterior AS (
    SELECT DISTINCT gm.usuario_id
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE g.temporada_id = v_anterior_id
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
  ),
  miembros_actual AS (
    SELECT DISTINCT gm.usuario_id
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE g.temporada_id = p_temporada_actual_id
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
  ),
  continuaron AS (
    SELECT ma.usuario_id
    FROM miembros_anterior ma
    INNER JOIN miembros_actual mc ON ma.usuario_id = mc.usuario_id
  ),
  no_renovaron AS (
    SELECT ma.usuario_id
    FROM miembros_anterior ma
    LEFT JOIN miembros_actual mc ON ma.usuario_id = mc.usuario_id
    WHERE mc.usuario_id IS NULL
  ),
  nuevos AS (
    SELECT mc.usuario_id
    FROM miembros_actual mc
    LEFT JOIN miembros_anterior ma ON mc.usuario_id = ma.usuario_id
    WHERE ma.usuario_id IS NULL
  )
  SELECT jsonb_build_object(
    'miembros_que_continuaron', (SELECT COUNT(*) FROM continuaron),
    'miembros_anteriores', (SELECT COUNT(*) FROM miembros_anterior),
    'miembros_nuevos', (SELECT COUNT(*) FROM nuevos),
    'miembros_no_renovaron', (SELECT COUNT(*) FROM no_renovaron),
    'pct_retencion', CASE
      WHEN (SELECT COUNT(*) FROM miembros_anterior) > 0
      THEN ROUND((SELECT COUNT(*) FROM continuaron)::numeric / (SELECT COUNT(*) FROM miembros_anterior) * 100, 1)
      ELSE 0
    END,
    'detalle_no_renovaron', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'usuario_id', nr.usuario_id,
        'nombre', u.nombre || ' ' || u.apellido
      ))
      FROM no_renovaron nr
      JOIN usuarios u ON u.id = nr.usuario_id
      LIMIT 50),
      '[]'::jsonb
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

-- ---------------------------------------------------------------------------
-- obtener_reporte_crecimiento_neto
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_reporte_crecimiento_neto(p_auth_id uuid, p_grupo_id uuid DEFAULT NULL::uuid, p_campus_id uuid DEFAULT NULL::uuid, p_meses integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_user_id uuid;
  v_resultado jsonb;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  SELECT id INTO v_user_id FROM usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  -- The report reads the members of every group: admin, pastor and the
  -- general director only. Anybody else gets an empty timeline, what the
  -- COALESCE below returns when no month is listed. Only service_role skips
  -- the check.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND NOT EXISTS (
       SELECT 1
       FROM public.usuario_roles ur
       JOIN public.roles_sistema rs ON rs.id = ur.rol_id
       WHERE ur.usuario_id = v_user_id
         AND rs.nombre_interno IN ('admin', 'pastor', 'director-general')
     ) THEN
    RETURN jsonb_build_object('timeline', '[]'::jsonb);
  END IF;

  WITH meses AS (
    SELECT generate_series(
      date_trunc('month', now() - (p_meses || ' months')::interval),
      date_trunc('month', now()),
      '1 month'::interval
    )::date AS mes
  ),
  ingresos AS (
    SELECT
      date_trunc('month', gm.creado_en)::date AS mes,
      COUNT(*) AS total
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE gm.creado_en >= now() - (p_meses || ' months')::interval
    AND (p_grupo_id IS NULL OR gm.grupo_id = p_grupo_id)
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
    GROUP BY 1
  ),
  egresos AS (
    SELECT
      date_trunc('month', gm.actualizado_en)::date AS mes,
      COUNT(*) AS total
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE gm.estado = 'inactivo'
    AND gm.actualizado_en >= now() - (p_meses || ' months')::interval
    AND (p_grupo_id IS NULL OR gm.grupo_id = p_grupo_id)
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'timeline', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'mes', to_char(m.mes, 'YYYY-MM'),
        'etiqueta', to_char(m.mes, 'Mon YYYY'),
        'ingresos', COALESCE(i.total, 0),
        'egresos', COALESCE(e.total, 0),
        'neto', COALESCE(i.total, 0) - COALESCE(e.total, 0)
      ) ORDER BY m.mes)
      FROM meses m
      LEFT JOIN ingresos i ON i.mes = m.mes
      LEFT JOIN egresos e ON e.mes = m.mes),
      '[]'::jsonb
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

-- ---------------------------------------------------------------------------
-- listar_eventos_grupo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_eventos_grupo(p_auth_id uuid, p_grupo_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, fecha date, hora text, tema text, notas text, total integer, presentes integer, porcentaje integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_usuario_id uuid;
begin
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN;
  END IF;

  -- Only the events of a group the person may see, by the rule of the grupos
  -- policies (puede_ver_grupo, bound to the session person); anybody else gets
  -- no rows, as for an unknown group. Only service_role skips the check.
  IF coalesce(v_request_role, '') <> 'service_role' THEN
    SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
    IF NOT public.puede_ver_grupo(v_usuario_id, p_grupo_id) THEN
      RETURN;
    END IF;
  END IF;

  return query
    with base as (
      select eg.id, eg.fecha::date, eg.hora::text, eg.tema, eg.notas
        from public.eventos_grupo eg
       where eg.grupo_id = p_grupo_id
    ), agg as (
      select a.evento_grupo_id as id,
             count(*)::int as total,
             count(*) filter (where a.presente) :: int as presentes
        from public.asistencia a
       where a.evento_grupo_id in (select b.id from base b)
       group by a.evento_grupo_id
    )
    select b.id, b.fecha, b.hora, b.tema, b.notas,
           coalesce(ag.total,0) as total,
           coalesce(ag.presentes,0) as presentes,
           case when coalesce(ag.total,0) = 0 then 0 else round((ag.presentes::numeric / ag.total::numeric) * 100)::int end as porcentaje
      from base b
      left join agg ag on ag.id = b.id
      order by b.fecha desc, b.id desc
      limit coalesce(p_limit, 50) offset coalesce(p_offset, 0);
end;
$function$;

-- ---------------------------------------------------------------------------
-- obtener_evento_grupo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_evento_grupo(p_auth_id uuid, p_evento_id uuid)
 RETURNS TABLE(id uuid, grupo_id uuid, fecha date, hora text, tema text, notas text, descripcion text, puntos_oracion text, notas_privadas_lider text, conteo_visitantes integer, no_hubo_reunion boolean, motivo_no_reunion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_usuario_id uuid;
  v_grupo_id uuid;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN;
  END IF;

  -- Only an event of a group the person may see, by the rule of the grupos
  -- policies (puede_ver_grupo, bound to the session person); anybody else gets
  -- no rows, as for an unknown event. Only service_role skips the check.
  IF coalesce(v_request_role, '') <> 'service_role' THEN
    SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
    SELECT eg.grupo_id INTO v_grupo_id FROM public.eventos_grupo eg WHERE eg.id = p_evento_id;
    IF NOT public.puede_ver_grupo(v_usuario_id, v_grupo_id) THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
    SELECT eg.id, eg.grupo_id, eg.fecha::date, eg.hora::text, eg.tema, eg.notas,
           eg.descripcion, eg.puntos_oracion, eg.notas_privadas_lider,
           COALESCE(eg.conteo_visitantes, 0) as conteo_visitantes,
           COALESCE(eg.no_hubo_reunion, false) as no_hubo_reunion,
           eg.motivo_no_reunion
      FROM public.eventos_grupo eg
     WHERE eg.id = p_evento_id
     LIMIT 1;
END;
$function$;

-- ---------------------------------------------------------------------------
-- obtener_asistencia_evento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_asistencia_evento(p_auth_id uuid, p_evento_id uuid)
 RETURNS TABLE(usuario_id uuid, presente boolean, motivo_inasistencia text, registrado_por_usuario_id uuid, fecha_registro timestamp with time zone, nombre text, apellido text, rol text, tipo_presencia text, nota text, tiempo_tardanza smallint, motivo_tardanza text, motivo_tardanza_otro text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_usuario_id uuid;
  v_grupo_id uuid;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN;
  END IF;

  -- Only the attendance of an event of a group the person may see, by the rule
  -- of the grupos policies (puede_ver_grupo, bound to the session person);
  -- anybody else gets no rows, as for an unknown event. Only service_role
  -- skips the check.
  IF coalesce(v_request_role, '') <> 'service_role' THEN
    SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
    SELECT eg.grupo_id INTO v_grupo_id FROM public.eventos_grupo eg WHERE eg.id = p_evento_id;
    IF NOT public.puede_ver_grupo(v_usuario_id, v_grupo_id) THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
    SELECT a.usuario_id, a.presente, a.motivo_inasistencia, a.registrado_por_usuario_id, a.fecha_registro,
           u.nombre, u.apellido,
           COALESCE((SELECT gm.rol::text FROM public.grupo_miembros gm WHERE gm.grupo_id = eg.grupo_id AND gm.usuario_id = u.id LIMIT 1), 'Miembro') as rol,
           COALESCE(a.tipo_presencia, CASE WHEN a.presente THEN 'presente' ELSE 'ausente' END) as tipo_presencia,
           a.nota,
           a.tiempo_tardanza,
           a.motivo_tardanza,
           a.motivo_tardanza_otro
      FROM public.asistencia a
      JOIN public.eventos_grupo eg ON eg.id = p_evento_id
      JOIN public.usuarios u ON u.id = a.usuario_id
     WHERE a.evento_grupo_id = p_evento_id
     ORDER BY u.nombre, u.apellido;
END;
$function$;

-- ---------------------------------------------------------------------------
-- sugerir_nombre_grupo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sugerir_nombre_grupo(p_ubicacion text, p_temporada_id uuid, p_segmento_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
  v_segmento_nombre text;
  v_base text;
  v_ends_with_number boolean;
  v_max integer := 0;
  r record;
  v_nombre text;
  v_rem text;
BEGIN
  IF p_ubicacion IS NULL OR p_temporada_id IS NULL OR p_segmento_id IS NULL THEN
    RAISE EXCEPTION 'Parametros invalidos';
  END IF;

  -- A name is suggested only to somebody who may create a group in this
  -- segment (puede_crear_grupo, the check crear_grupo_con_director runs);
  -- anybody else gets NULL. Only service_role skips the check.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND NOT public.puede_crear_grupo(auth.uid(), p_segmento_id) THEN
    RETURN NULL;
  END IF;

  -- Obtener nombre de segmento
  SELECT s.nombre INTO v_segmento_nombre FROM public.segmentos s WHERE s.id = p_segmento_id;
  IF v_segmento_nombre IS NULL THEN
    RAISE EXCEPTION 'Segmento invalido';
  END IF;

  v_base := trim(p_ubicacion || ' ' || v_segmento_nombre);
  v_ends_with_number := right(trim(v_segmento_nombre), 1) ~ '^[0-9]$';

  FOR r IN
    SELECT g.nombre
    FROM public.grupos g
    WHERE g.temporada_id = p_temporada_id
      AND g.segmento_id = p_segmento_id
      AND g.nombre ILIKE v_base || '%'
  LOOP
    v_nombre := trim(coalesce(r.nombre, ''));
    -- Si empieza con la base, tomamos el resto y detectamos sufijo numérico con o sin guion
    IF position(v_base in v_nombre) = 1 THEN
      v_rem := btrim(substring(v_nombre from char_length(v_base) + 1), ' ');
      IF v_rem ~ '^\-\s*\d+$' THEN
        v_rem := btrim(substring(v_rem from 2), ' '); -- quitar '-'
      END IF;
      IF v_rem ~ '^\d+$' THEN
        v_max := greatest(v_max, v_rem::int);
      END IF;
    END IF;
  END LOOP;

  v_max := v_max + 1;
  IF v_ends_with_number THEN
    RETURN v_base || ' - ' || v_max;
  ELSE
    RETURN v_base || ' ' || v_max;
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- obtener_kpis_grupos_para_usuario: one overload
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.obtener_kpis_grupos_para_usuario(uuid);

-- ---------------------------------------------------------------------------
-- asignar_director_etapa_a_ubicacion
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.director_etapa_ubicaciones'::regclass
       AND c.conname = 'director_etapa_ubicaciones_director_unique'
       AND c.contype = 'u'
  ) THEN
    RAISE EXCEPTION 'director_etapa_ubicaciones_director_unique is missing; asignar_director_etapa_a_ubicacion needs it';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.asignar_director_etapa_a_ubicacion(p_auth_id uuid, p_director_etapa_id uuid, p_segmento_ubicacion_id uuid, p_accion text)
 RETURNS TABLE(id uuid, director_etapa_id uuid, segmento_ubicacion_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims.
  v_request_role text := auth.role();
  v_user_id uuid;
  v_es_superior boolean := false;
  v_tipo text;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  IF p_auth_id IS NULL OR p_director_etapa_id IS NULL OR p_segmento_ubicacion_id IS NULL OR p_accion IS NULL THEN
    RAISE EXCEPTION 'Parametros invalidos';
  END IF;
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
  SELECT TRUE INTO v_es_superior FROM public.usuario_roles ur JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin','pastor','director-general') LIMIT 1;
  -- SELECT INTO with no row sets v_es_superior to NULL, and IF NOT NULL does
  -- not raise: without coalesce anybody passed this check.
  IF NOT coalesce(v_es_superior, false) THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  -- The OUT columns id, director_etapa_id and segmento_ubicacion_id are
  -- variables here: every column below is qualified, and ON CONFLICT names the
  -- constraint because its column list cannot be qualified (42702 otherwise).
  SELECT sl.tipo_lider INTO v_tipo FROM public.segmento_lideres sl WHERE sl.id = p_director_etapa_id;
  IF v_tipo IS DISTINCT FROM 'director_etapa' THEN RAISE EXCEPTION 'No es director_etapa'; END IF;

  IF p_accion = 'agregar' THEN
    INSERT INTO public.director_etapa_ubicaciones(director_etapa_id, segmento_ubicacion_id)
    VALUES(p_director_etapa_id, p_segmento_ubicacion_id)
    ON CONFLICT ON CONSTRAINT director_etapa_ubicaciones_director_unique DO UPDATE SET segmento_ubicacion_id = EXCLUDED.segmento_ubicacion_id;
  ELSIF p_accion = 'quitar' THEN
    DELETE FROM public.director_etapa_ubicaciones deu WHERE deu.director_etapa_id = p_director_etapa_id;
  ELSE
    RAISE EXCEPTION 'Accion desconocida';
  END IF;

  RETURN QUERY
    SELECT deu.id, deu.director_etapa_id, deu.segmento_ubicacion_id
    FROM public.director_etapa_ubicaciones deu
    WHERE deu.director_etapa_id = p_director_etapa_id;
END;$function$;

-- Execution rights: signed-in people and the service client only (today's state).
REVOKE ALL ON FUNCTION public.resumen_dashboard_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_reporte_retencion(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_reporte_crecimiento_neto(uuid, uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listar_eventos_grupo(uuid, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_evento_grupo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_asistencia_evento(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sugerir_nombre_grupo(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.asignar_director_etapa_a_ubicacion(uuid, uuid, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.resumen_dashboard_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_reporte_retencion(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_reporte_crecimiento_neto(uuid, uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_eventos_grupo(uuid, uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_evento_grupo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_asistencia_evento(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sugerir_nombre_grupo(text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.asignar_director_etapa_a_ubicacion(uuid, uuid, uuid, text) TO authenticated, service_role;
-- <<< END migration 20261003150000_candados_permiso_y_arreglos.sql

-- ---------------------------------------------------------------------------
-- AFTER the migration.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_cp_new (case_name text PRIMARY KEY, val text) ON COMMIT DROP;
INSERT INTO t_cp_new(case_name, val)
SELECT c.case_name, pg_temp.run(c.mode, pg_temp.auth_of(c.s_who), f.sql, pg_temp.auth_of(c.arg_who), c.a, c.b)
  FROM t_cp_case c JOIN t_cp_fn f USING (fn);

-- a. Allowed: the answer from before; denied: the neutral value.
SELECT pg_temp.fail('a gates', format('%s (%s): before %s, after %s, expected %s', c.case_name,
                    CASE WHEN c.allowed THEN 'allowed' ELSE 'denied' END, o.val, n.val,
                    CASE WHEN c.allowed THEN 'the same' ELSE f.neutral END))
  FROM t_cp_case c JOIN t_cp_fn f USING (fn) JOIN t_cp_old o USING (case_name) JOIN t_cp_new n USING (case_name)
 WHERE f.gated
   AND n.val IS DISTINCT FROM CASE WHEN c.allowed THEN o.val ELSE f.neutral END;

-- b. The two-argument kpis is unchanged; the one-argument call answers like it.
SELECT pg_temp.fail('b kpis', format('%s: before %s, after %s', o.case_name, o.val, n.val))
  FROM t_cp_old o JOIN t_cp_new n USING (case_name) JOIN t_cp_case c USING (case_name)
 WHERE c.fn = 'kpis2' AND n.val IS DISTINCT FROM o.val;

SELECT pg_temp.fail('b kpis', format('%s: %s, two-argument call %s', n.case_name, n.val, n2.val))
  FROM t_cp_new n JOIN t_cp_case c USING (case_name)
  JOIN t_cp_new n2 ON n2.case_name = replace(n.case_name, 'kpis1', 'kpis2')
 WHERE c.fn = 'kpis1' AND (n.val IS DISTINCT FROM n2.val OR n.val LIKE 'ERR%');

-- c. asignar_director_etapa_a_ubicacion runs; the table is as it was.
CREATE TEMP TABLE t_cp_asg_new (case_name text PRIMARY KEY, val text) ON COMMIT DROP;
INSERT INTO t_cp_asg_new(case_name, val) SELECT a.case_name, pg_temp.run_asg(a.case_name) FROM t_cp_asg a;

SELECT pg_temp.fail('c asignar', format('%s: expected %s, got %s', a.case_name, a.expected, n.val))
  FROM t_cp_asg a JOIN t_cp_asg_new n USING (case_name)
 WHERE n.val IS DISTINCT FROM a.expected;

SELECT pg_temp.fail('c asignar', format('director_etapa_ubicaciones changed: before %s rows %s, now %s rows %s',
                    o.n, o.digest, d.n, d.digest))
  FROM t_cp_deu_old o,
       (SELECT count(*) AS n, md5(string_agg(x::text, '|' ORDER BY x.id)) AS digest
          FROM public.director_etapa_ubicaciones x) d
 WHERE (d.n, d.digest) IS DISTINCT FROM (o.n, o.digest);

-- d. Catalog.
SELECT pg_temp.fail('d catalog', format('%s changed: before [%s], after [%s]', o.sig, o.cat, pg_temp.cat_of(o.sig)))
  FROM t_cp_cat_old o
 WHERE pg_temp.cat_of(o.sig) IS DISTINCT FROM o.cat;

SELECT pg_temp.fail('d catalog', 'the change is missing from ' || f.sig)
  FROM t_cp_fns f JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)
 WHERE f.marker IS NOT NULL AND strpos(p.prosrc, f.marker) = 0;

-- Every line of each old body is still in the new one, except the four lines
-- asignar rewrites (42702 and the permission check).
SELECT pg_temp.fail('d catalog', format('%s lost the line: %s', o.sig, l.line))
  FROM t_cp_cat_old o
 CROSS JOIN LATERAL unnest(string_to_array(o.src, E'\n')) AS l(line)
 WHERE btrim(l.line) <> ''
   AND strpos(E'\n' || (SELECT p.prosrc FROM pg_proc p WHERE p.oid = to_regprocedure(o.sig)) || E'\n',
              E'\n' || l.line || E'\n') = 0
   AND NOT (o.sig = 'public.asignar_director_etapa_a_ubicacion(uuid,uuid,uuid,text)'
            AND l.line IN ('  SELECT tipo_lider INTO v_tipo FROM public.segmento_lideres WHERE id = p_director_etapa_id;',
                           '    ON CONFLICT (director_etapa_id) DO UPDATE SET segmento_ubicacion_id = EXCLUDED.segmento_ubicacion_id;',
                           '    DELETE FROM public.director_etapa_ubicaciones WHERE director_etapa_id = p_director_etapa_id;',
                           '  IF NOT v_es_superior THEN RAISE EXCEPTION ''Permiso denegado''; END IF;'));

SELECT pg_temp.fail('d catalog', format('%s privilege on %s: expected %s', r.priv_role, f.sig, r.expected))
  FROM t_cp_fns f
 CROSS JOIN (VALUES ('anon', false), ('authenticated', true), ('service_role', true)) r(priv_role, expected)
 WHERE has_function_privilege(r.priv_role, f.sig, 'execute') IS DISTINCT FROM r.expected;

SELECT pg_temp.fail('d catalog', 'PUBLIC can execute ' || f.sig)
  FROM t_cp_fns f JOIN pg_proc p ON p.oid = to_regprocedure(f.sig),
       aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
 WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE';

SELECT pg_temp.fail('d catalog', 'the one-argument kpis overload still exists')
 WHERE to_regprocedure('public.obtener_kpis_grupos_para_usuario(uuid)') IS NOT NULL;

-- Failing cases first (none expected; at most five per case, then a count),
-- then one summary row per gated function, kpis, asignar and the catalog.
SELECT kind, name, detail
  FROM (SELECT 1 AS ord, 'failure' AS kind, f.case_name AS name, f.detail
          FROM (SELECT case_name, detail, row_number() OVER (PARTITION BY case_name ORDER BY detail) AS rn
                  FROM t_cp_failures) f
         WHERE f.rn <= 5
        UNION ALL
        SELECT 1, 'failure', case_name, format('(%s more like these)', count(*) - 5)
          FROM t_cp_failures GROUP BY case_name HAVING count(*) > 5
        UNION ALL
        SELECT 2, 'summary', 'compared',
               format('%s probes before and after, %s asignar calls, %s failing cases; migration live before the block: %s',
                      (SELECT count(*) FROM t_cp_case), (SELECT count(*) FROM t_cp_asg),
                      (SELECT count(*) FROM t_cp_failures), CASE WHEN pg_temp.applied() THEN 'yes' ELSE 'no' END)
        UNION ALL
        SELECT 3, 'gate', f.fn,
               format('allowed %s, same after %s; denied %s (%s), real data before %s, neutral after %s',
                      count(*) FILTER (WHERE c.allowed),
                      count(*) FILTER (WHERE c.allowed AND n.val = o.val),
                      count(*) FILTER (WHERE NOT c.allowed),
                      string_agg(regexp_replace(c.case_name, '^\S+ ', ''), ', ' ORDER BY c.case_name) FILTER (WHERE NOT c.allowed),
                      count(*) FILTER (WHERE NOT c.allowed AND o.val <> f.neutral),
                      count(*) FILTER (WHERE NOT c.allowed AND n.val = f.neutral))
          FROM t_cp_fn f JOIN t_cp_case c USING (fn) JOIN t_cp_old o USING (case_name) JOIN t_cp_new n USING (case_name)
         WHERE f.gated
         GROUP BY f.fn
        UNION ALL
        SELECT 4, 'kpis', 'one-argument call',
               format('before: %s; after: equal to the two-argument call for %s of %s; two-argument unchanged %s of %s',
                      (SELECT left(val, 80) FROM t_cp_old WHERE case_name = 'kpis1 admin'),
                      (SELECT count(*) FROM t_cp_new n JOIN t_cp_new n2 ON n2.case_name = replace(n.case_name, 'kpis1', 'kpis2')
                        WHERE n.case_name LIKE 'kpis1 %' AND n.val = n2.val AND n.val NOT LIKE 'ERR%'),
                      (SELECT count(*) FROM t_cp_case WHERE fn = 'kpis1'),
                      (SELECT count(*) FROM t_cp_old o JOIN t_cp_new n USING (case_name) WHERE o.case_name LIKE 'kpis2 %' AND o.val = n.val),
                      (SELECT count(*) FROM t_cp_case WHERE fn = 'kpis2'))
        UNION ALL
        SELECT 5, 'asignar', a.case_name, format('before %s; after %s', o.val, n.val)
          FROM t_cp_asg a JOIN t_cp_asg_old o USING (case_name) JOIN t_cp_asg_new n USING (case_name)
        UNION ALL
        SELECT 6, 'summary', 'md5(pg_get_functiondef) after the block',
               (SELECT string_agg(p.proname || ' ' || md5(pg_get_functiondef(p.oid)), ', ' ORDER BY p.proname)
                  FROM t_cp_fns f JOIN pg_proc p ON p.oid = to_regprocedure(f.sig))) x
 ORDER BY ord, name, detail;

ROLLBACK;
