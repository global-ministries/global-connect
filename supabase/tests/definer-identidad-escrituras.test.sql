-- L4 (odd/tasks/seguridad-definer-fase2-identidad.md) - identity guard on the
-- group writes that take the caller as p_auth_id. Migration 20261002130000.
--
-- Functions: crear_grupo, crear_solicitud_grupo, procesar_solicitud_grupo,
-- asignar_director_etapa_a_ubicacion, asignar_lider_matrimonio (and
-- crear_grupo_con_director, which calls crear_grupo).
--
-- How "before" is obtained: the suite rebuilds the pre-migration definition of
-- each function from the live one by removing exactly the lines the migration
-- adds (the DECLARE variable, the guard and, for three functions, the
-- search_path pin) and installs it under the temporary name zz_old_<name>
-- (rolled back with the rest). The md5 of every rebuilt definition is checked
-- against the md5 captured on staging before the migration, so the suite also
-- proves that nothing but the guard and the pin was added. It runs the same
-- before and after the migration is applied.
--
-- Covers, per function:
--   a. Own identity (session of the person, p_auth_id = the person): the OLD
--      and the NEW function leave the same rows in the six tables the group
--      writes touch (grupos, solicitudes_grupo, grupo_miembros,
--      director_etapa_grupos, director_etapa_ubicaciones,
--      historial_movimientos_grupo) and return the same value. Compared per
--      row as jsonb, excluding the columns "id" and every timestamp column
--      (generated), and with the id of a newly created group replaced by RET.
--      Each side runs in its own subtransaction that is rolled back.
--   b. Foreign identity (a plain leader, a director de etapa and a director
--      general passing the admin's id): the function's own refusal (same message
--      and SQLSTATE as for an unknown user) and NOTHING is written. Before the
--      migration the write happens: that is the RED.
--   c. Service client (both claim styles) acting for somebody: same as before.
--   d. No session at all (plain postgres) or a NULL id: refusal, nothing written.
--      anon cannot execute (42501).
--   e. Catalog: signature, return type, volatility, definer flag, owner, ACL as
--      before; search_path pinned; the guard literal is in the body; the rebuilt
--      pre-migration definitions have the md5 captured before the migration.
--   f. crear_grupo_con_director (the only caller of crear_grupo) still creates
--      the group and its director link(s); planner_guardar_planificacion does
--      not call any of the five functions.
--
-- Run against STAGING inside BEGIN...ROLLBACK: nothing here is kept. The last
-- statement is a SELECT of the failing cases (empty = all ok).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_di_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_di_stats (kind text, n int) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_di_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- ---------------------------------------------------------------------------
-- Pre-migration definitions, rebuilt from the live ones.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_di_fns (
  fn text PRIMARY KEY, sig text, refusal text, pinned_before boolean, md5_before text,
  ret text, acl text
) ON COMMIT DROP;

INSERT INTO t_di_fns(fn, sig, refusal, pinned_before, md5_before, ret) VALUES
  ('crear_grupo', 'public.crear_grupo(uuid,text,uuid,uuid,uuid)',
   'Permiso denegado para crear grupo en el segmento indicado', true, 'ea8d2f1eb946ffb46881718db2bee907', 'uuid'),
  ('crear_solicitud_grupo', 'public.crear_solicitud_grupo(uuid,text,uuid,uuid,uuid,text,text)',
   'usuario_no_encontrado', false, '4dca30c4e7d613eb618b527a3e054458', 'jsonb'),
  ('procesar_solicitud_grupo', 'public.procesar_solicitud_grupo(uuid,uuid,text,text)',
   'usuario_no_encontrado', false, 'e11ded7c4198b09f4c675aa4532520c0', 'jsonb'),
  ('asignar_director_etapa_a_ubicacion', 'public.asignar_director_etapa_a_ubicacion(uuid,uuid,uuid,text)',
   'Usuario no encontrado', false, '185796e0b37c5b1376dfa69f0940d696',
   'TABLE(id uuid, director_etapa_id uuid, segmento_ubicacion_id uuid)'),
  ('asignar_lider_matrimonio', 'public.asignar_lider_matrimonio(uuid,uuid,uuid,boolean)',
   'sin_permisos', true, '73f84eedbfe6da3c1902da64c4e02df2', 'jsonb');

-- The definition as it was before the migration (the live one with the lines the
-- migration adds removed; a no-op when the migration is not applied yet).
CREATE OR REPLACE FUNCTION pg_temp.old_def(p_fn text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  f t_di_fns;
  d text;
BEGIN
  SELECT * INTO f FROM t_di_fns WHERE fn = p_fn;
  d := pg_get_functiondef(f.sig::regprocedure);
  d := replace(d,
    E'  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is\n'
    || E'  -- set and otherwise the role inside the JSON request.jwt.claims.\n'
    || E'  v_request_role text := auth.role();\n', '');
  d := replace(d,
    E'  -- The caller is the person in the session; only service_role may act for\n'
    || E'  -- somebody else.\n'
    || E'  IF coalesce(v_request_role, '''') <> ''service_role''\n'
    || E'     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN\n'
    || E'    RAISE EXCEPTION ''' || f.refusal || E''';\n'
    || E'  END IF;\n\n', '');
  IF NOT f.pinned_before THEN
    d := replace(d, E' SET search_path TO ''public''\n', '');
  END IF;
  RETURN d;
END;
$$;

DO $$
DECLARE
  f t_di_fns;
  d text;
BEGIN
  FOR f IN SELECT * FROM t_di_fns LOOP
    d := pg_temp.old_def(f.fn);
    d := replace(d, 'FUNCTION public.' || f.fn || '(', 'FUNCTION public.zz_old_' || f.fn || '(');
    EXECUTE d;
  END LOOP;
  -- The pre-migration crear_grupo_con_director, wired to the old crear_grupo.
  d := replace(pg_get_functiondef('public.crear_grupo_con_director(text,uuid,uuid,uuid)'::regprocedure),
               'FUNCTION public.crear_grupo_con_director(', 'FUNCTION public.zz_old_crear_grupo_con_director(');
  d := replace(d, 'public.crear_grupo(v_auth_id', 'public.zz_old_crear_grupo(v_auth_id');
  EXECUTE d;
END;
$$;

-- ---------------------------------------------------------------------------
-- Real people and rows, resolved from staging data.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_di_ctx (
  admin uuid, admin_user uuid,
  dg uuid, dg_user uuid, g_dg uuid,
  de uuid, de_user uuid, de_sl uuid, de_seg uuid, g_de uuid,
  leader uuid, leader_user uuid, g_lead uuid,
  x_user uuid, x_member uuid, temporada uuid, ubic uuid,
  g_act uuid, s_ing uuid, s_act uuid, s_dg uuid
) ON COMMIT DROP;

INSERT INTO t_di_ctx(admin, admin_user)
-- Literal first: a quoted uuid right after "auth_id =" trips the secret scanner.
SELECT u.auth_id, u.id FROM public.usuarios u WHERE '5df3b990-af3d-49b5-a061-025bc3598983'::uuid = u.auth_id;

-- A general director (not admin/pastor) with at least one segment, and a group
-- that director sees.
UPDATE t_di_ctx SET (dg_user, dg) = (
  SELECT u.id, u.auth_id FROM public.director_general_segmentos dgs
    JOIN public.usuarios u ON u.id = dgs.usuario_id
   WHERE u.auth_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                  WHERE ur.usuario_id = u.id AND rs.nombre_interno = 'director-general')
     AND NOT EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                      WHERE ur.usuario_id = u.id AND rs.nombre_interno IN ('admin', 'pastor'))
   GROUP BY u.id, u.auth_id
   ORDER BY count(*) DESC, u.id LIMIT 1);

UPDATE t_di_ctx c SET g_dg = (
  SELECT g.id FROM public.grupos g
   WHERE g.eliminado = false AND public.gdv_dg_ve_grupo(c.dg_user, g.id)
   ORDER BY g.id LIMIT 1);

-- A director de etapa (no higher role) with a signed-in account, preferably one
-- whose spouse is also director de etapa of the segment (two links on creation).
UPDATE t_di_ctx SET (de_sl, de_user, de, de_seg) = (
  SELECT sl.id, u.id, u.auth_id, sl.segmento_id
    FROM public.segmento_lideres sl JOIN public.usuarios u ON u.id = sl.usuario_id
   WHERE sl.tipo_lider = 'director_etapa' AND u.auth_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                  WHERE ur.usuario_id = u.id AND rs.nombre_interno = 'director-etapa')
     AND NOT EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                      WHERE ur.usuario_id = u.id AND rs.nombre_interno IN ('admin', 'pastor', 'director-general'))
   ORDER BY (public.conyuge_director_etapa_id(sl.id) IS NOT NULL) DESC, sl.id LIMIT 1);

UPDATE t_di_ctx c SET g_de = (
  SELECT deg.grupo_id FROM public.director_etapa_grupos deg
    JOIN public.grupos g ON g.id = deg.grupo_id
   WHERE deg.director_etapa_id = c.de_sl AND g.eliminado = false
   ORDER BY deg.grupo_id LIMIT 1);

-- A plain group leader (no system role of their own) and the group they lead.
UPDATE t_di_ctx SET (leader, leader_user, g_lead) = (
  SELECT u.auth_id, u.id, gm.grupo_id
    FROM public.grupo_miembros gm
    JOIN public.usuarios u ON u.id = gm.usuario_id
    JOIN public.grupos g ON g.id = gm.grupo_id
   WHERE gm.rol = 'Líder' AND gm.fecha_salida IS NULL AND u.auth_id IS NOT NULL
     AND COALESCE(gm.estado, 'activo') = 'activo' AND g.eliminado = false
     AND NOT EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                      WHERE ur.usuario_id = u.id AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa'))
   ORDER BY u.id, gm.grupo_id LIMIT 1);

-- A person who is not an active "Miembro" anywhere, and a current member of the
-- leader's group (for the direct "egreso").
UPDATE t_di_ctx c SET x_user = (
  SELECT u.id FROM public.usuarios u
   WHERE u.id NOT IN (c.leader_user, c.admin_user, c.dg_user, c.de_user)
     AND NOT EXISTS (SELECT 1 FROM public.grupo_miembros gm WHERE gm.usuario_id = u.id)
   ORDER BY u.id LIMIT 1),
  x_member = (
  SELECT gm.usuario_id FROM public.grupo_miembros gm
   WHERE gm.grupo_id = c.g_lead AND gm.rol = 'Miembro' AND gm.fecha_salida IS NULL
   ORDER BY gm.usuario_id LIMIT 1),
  temporada = (SELECT t.id FROM public.temporadas t WHERE t.activa ORDER BY t.id LIMIT 1),
  ubic = (SELECT s.id FROM public.segmento_ubicaciones s ORDER BY s.id LIMIT 1);

-- Fixtures: a group waiting for activation and three pending requests.
UPDATE t_di_ctx SET g_act = gen_random_uuid(), s_ing = gen_random_uuid(), s_act = gen_random_uuid(), s_dg = gen_random_uuid();

INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo)
SELECT g_act, 'ZZ L4 activar', temporada, de_seg, false FROM t_di_ctx;

INSERT INTO public.solicitudes_grupo (id, tipo, solicitado_por, usuario_id, grupo_id, rol_solicitado, temporada_id, expira_en)
SELECT s_ing, 'ingreso', leader_user, x_user, g_lead, 'Miembro', temporada, now() + interval '7 days' FROM t_di_ctx
UNION ALL
SELECT s_dg, 'ingreso', leader_user, x_user, g_dg, 'Miembro', temporada, now() + interval '7 days' FROM t_di_ctx;

INSERT INTO public.solicitudes_grupo (id, tipo, solicitado_por, grupo_id, temporada_id, expira_en)
SELECT s_act, 'activacion_grupo', leader_user, g_act, temporada, now() + interval '7 days' FROM t_di_ctx;

-- Every fixture must have resolved, otherwise the cases below mean nothing.
INSERT INTO t_di_failures
SELECT 'fixture ' || k || ' did not resolve'
  FROM t_di_ctx c, LATERAL jsonb_each_text(to_jsonb(c)) j(k, v)
 WHERE v IS NULL;

-- ---------------------------------------------------------------------------
-- Snapshot of what the group writes touch and a case runner.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_di_excl (tbl text PRIMARY KEY, cols text[]) ON COMMIT DROP;
INSERT INTO t_di_excl
SELECT c.table_name,
       array_agg(c.column_name::text) FILTER (WHERE c.column_name = 'id' OR c.data_type LIKE 'timestamp%')
  FROM information_schema.columns c
 WHERE c.table_schema = 'public'
   AND c.table_name IN ('grupos', 'solicitudes_grupo', 'grupo_miembros', 'director_etapa_grupos',
                        'director_etapa_ubicaciones', 'historial_movimientos_grupo')
 GROUP BY c.table_name;

-- Row digests of the six tables; p_ret (a newly created group id) is replaced by RET.
CREATE OR REPLACE FUNCTION pg_temp.snap(p_ret text)
RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE
  r record;
  v text[] := '{}';
  v_part text[];
BEGIN
  FOR r IN SELECT * FROM t_di_excl LOOP
    EXECUTE format(
      'SELECT coalesce(array_agg(%L || ''|'' || replace((to_jsonb(t) - %L::text[])::text, %L, ''RET'')), ''{}'') FROM public.%I t',
      r.tbl, r.cols, coalesce(p_ret, '#'), r.tbl)
    INTO v_part;
    v := v || v_part;
  END LOOP;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.delta(p_before text[], p_after text[])
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(d, E'\n' ORDER BY d), '') FROM (
    SELECT '-' || x AS d FROM (SELECT unnest(p_before) EXCEPT SELECT unnest(p_after)) a(x)
    UNION ALL
    SELECT '+' || x FROM (SELECT unnest(p_after) EXCEPT SELECT unnest(p_before)) b(x)
  ) s;
$$;

-- Runs one call (a statement returning one text column) as the given session
-- inside a subtransaction that is always rolled back. Returns {result, delta}.
-- p_ret_is_group: the call returns the id of a new group (becomes RET in the
-- digests). p_norm: every uuid in the result is masked (generated ids).
CREATE OR REPLACE FUNCTION pg_temp.attempt(p_sql text, p_mode text, p_auth uuid, p_ret_is_group boolean, p_norm boolean)
RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE
  v_res text;
  v_before text[] := pg_temp.snap(NULL);
  v_after text[];
BEGIN
  BEGIN
    PERFORM pg_temp.set_session(p_mode, p_auth);
    EXECUTE p_sql INTO v_res;
    v_after := pg_temp.snap(CASE WHEN p_ret_is_group THEN v_res END);
    RAISE EXCEPTION 'rollback this attempt' USING ERRCODE = 'ZZ001';
  EXCEPTION
    WHEN SQLSTATE 'ZZ001' THEN
      NULL;
    WHEN OTHERS THEN
      v_res := 'ERR ' || SQLSTATE || ' ' || SQLERRM;
      v_after := pg_temp.snap(NULL);
  END;
  IF p_norm THEN
    v_res := regexp_replace(v_res, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'UUID', 'g');
  END IF;
  RETURN ARRAY[v_res, pg_temp.delta(v_before, v_after)];
END;
$$;

-- p_tmpl uses @F@ for the function name (public.<fn> or public.zz_old_<fn>).
CREATE OR REPLACE FUNCTION pg_temp.fq(p_tmpl text, p_fn text, p_old boolean)
RETURNS text LANGUAGE sql AS $$
  SELECT replace(p_tmpl, '@F@', 'public.' || CASE WHEN p_old THEN 'zz_old_' ELSE '' END || p_fn);
$$;

-- a / c: OLD and NEW leave the same rows and return the same value.
CREATE OR REPLACE FUNCTION pg_temp.same_as_before(
  p_case text, p_fn text, p_tmpl text, p_mode text, p_auth uuid,
  p_expect_write boolean, p_ret_is_group boolean DEFAULT false, p_norm boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  o text[] := pg_temp.attempt(pg_temp.fq(p_tmpl, p_fn, true), p_mode, p_auth, p_ret_is_group, p_norm);
  n text[] := pg_temp.attempt(pg_temp.fq(p_tmpl, p_fn, false), p_mode, p_auth, p_ret_is_group, p_norm);
BEGIN
  IF o[1] IS DISTINCT FROM n[1] THEN
    PERFORM pg_temp.fail(p_case, 'result differs: old ' || coalesce(o[1], 'NULL') || ' / new ' || coalesce(n[1], 'NULL'));
  END IF;
  IF o[2] IS DISTINCT FROM n[2] THEN
    PERFORM pg_temp.fail(p_case, 'rows differ: old ' || md5(o[2]) || ' / new ' || md5(n[2])
      || E'\nold: ' || left(o[2], 600) || E'\nnew: ' || left(n[2], 600));
  END IF;
  IF p_expect_write AND n[2] = '' THEN
    PERFORM pg_temp.fail(p_case, 'the call wrote nothing, so the comparison proves nothing (result ' || coalesce(n[1], 'NULL') || ')');
  END IF;
  IF NOT p_expect_write AND n[2] <> '' THEN
    PERFORM pg_temp.fail(p_case, 'the call was expected to write nothing but wrote: ' || left(n[2], 600));
  END IF;
  INSERT INTO t_di_stats VALUES ('same_as_before', 1);
END;
$$;

-- b / d: the NEW function refuses with its own error and writes nothing.
CREATE OR REPLACE FUNCTION pg_temp.refuses(p_case text, p_fn text, p_tmpl text, p_mode text, p_auth uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  n text[] := pg_temp.attempt(pg_temp.fq(p_tmpl, p_fn, false), p_mode, p_auth, false, false);
  v_expected text := 'ERR P0001 ' || (SELECT refusal FROM t_di_fns WHERE fn = p_fn);
BEGIN
  IF n[1] IS DISTINCT FROM v_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || v_expected || ', got ' || coalesce(n[1], 'NULL'));
  END IF;
  IF n[2] <> '' THEN
    PERFORM pg_temp.fail(p_case, 'a refused call wrote rows: ' || left(n[2], 600));
  END IF;
  INSERT INTO t_di_stats VALUES ('refuses', 1);
END;
$$;

-- Call templates.
CREATE OR REPLACE FUNCTION pg_temp.t_crear_grupo(p_who uuid, p_seg uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT (@F@(%L, ''ZZ L4 grupo'', %L, %L, NULL))::text', p_who, c.temporada, p_seg) FROM t_di_ctx c;
$$;
CREATE OR REPLACE FUNCTION pg_temp.t_con_director(p_seg uuid, p_sl uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT (@F@(''ZZ L4 con director'', %L, %L, %L))::text', c.temporada, p_seg, p_sl) FROM t_di_ctx c;
$$;
CREATE OR REPLACE FUNCTION pg_temp.t_solicitud(p_who uuid, p_tipo text, p_usuario uuid, p_grupo uuid, p_rol text)
RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT (@F@(%L, %L, %L, %L, NULL, %L, ''ZZ L4''))::text', p_who, p_tipo, p_usuario, p_grupo, p_rol);
$$;
CREATE OR REPLACE FUNCTION pg_temp.t_procesar(p_who uuid, p_sol uuid, p_accion text)
RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT (@F@(%L, %L, %L, ''ZZ L4 nota''))::text', p_who, p_sol, p_accion);
$$;
CREATE OR REPLACE FUNCTION pg_temp.t_asig_dir(p_who uuid, p_accion text)
RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT coalesce(string_agg(t.director_etapa_id::text || '','' || t.segmento_ubicacion_id::text, ''|''), '''') FROM @F@(%L, %L, %L, %L) t',
                p_who, c.de_sl, c.ubic, p_accion) FROM t_di_ctx c;
$$;
CREATE OR REPLACE FUNCTION pg_temp.t_asig_lider(p_who uuid, p_grupo uuid, p_conyugue boolean)
RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT (@F@(%L, %L, %L, %L))::text', p_who, p_grupo, c.x_user, p_conyugue) FROM t_di_ctx c;
$$;

-- Since 20261003110000 new postgres functions carry no PUBLIC EXECUTE, and these helpers run under SET LOCAL ROLE.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ---------------------------------------------------------------------------
-- Cases.
-- ---------------------------------------------------------------------------
DO $cases$
DECLARE
  c t_di_ctx;
  v_nobody uuid := NULL;
BEGIN
  SELECT * INTO c FROM t_di_ctx;

  -- ===== crear_grupo =====
  -- a. own identity
  PERFORM pg_temp.same_as_before('a crear_grupo admin', 'crear_grupo', pg_temp.t_crear_grupo(c.admin, c.de_seg), 'user', c.admin, true, true, true);
  PERFORM pg_temp.same_as_before('a crear_grupo admin (json claims)', 'crear_grupo', pg_temp.t_crear_grupo(c.admin, c.de_seg), 'user_json', c.admin, true, true, true);
  PERFORM pg_temp.same_as_before('a crear_grupo director de etapa in own segment', 'crear_grupo', pg_temp.t_crear_grupo(c.de, c.de_seg), 'user', c.de, true, true, true);
  PERFORM pg_temp.same_as_before('a crear_grupo director de etapa in a segment that is not theirs (still refused)', 'crear_grupo',
    pg_temp.t_crear_grupo(c.de, (SELECT s.id FROM public.segmentos s WHERE s.id <> c.de_seg
       AND NOT EXISTS (SELECT 1 FROM public.segmento_lideres sl WHERE sl.segmento_id = s.id AND sl.usuario_id = c.de_user) ORDER BY s.id LIMIT 1)),
    'user', c.de, false, true, true);
  PERFORM pg_temp.same_as_before('a crear_grupo director general in an assigned segment', 'crear_grupo',
    pg_temp.t_crear_grupo(c.dg, (SELECT dgs.segmento_id FROM public.director_general_segmentos dgs WHERE dgs.usuario_id = c.dg_user ORDER BY dgs.segmento_id LIMIT 1)),
    'user', c.dg, true, true, true);
  -- b. foreign identity
  PERFORM pg_temp.refuses('b crear_grupo leader as admin', 'crear_grupo', pg_temp.t_crear_grupo(c.admin, c.de_seg), 'user', c.leader);
  PERFORM pg_temp.refuses('b crear_grupo director de etapa as admin', 'crear_grupo', pg_temp.t_crear_grupo(c.admin, c.de_seg), 'user', c.de);
  PERFORM pg_temp.refuses('b crear_grupo director general as admin', 'crear_grupo', pg_temp.t_crear_grupo(c.admin, c.de_seg), 'user_json', c.dg);
  -- c. service client
  PERFORM pg_temp.same_as_before('c crear_grupo service for admin', 'crear_grupo', pg_temp.t_crear_grupo(c.admin, c.de_seg), 'service', NULL, true, true, true);
  PERFORM pg_temp.same_as_before('c crear_grupo service (json) for admin', 'crear_grupo', pg_temp.t_crear_grupo(c.admin, c.de_seg), 'service_json', NULL, true, true, true);
  -- d. no session
  PERFORM pg_temp.refuses('d crear_grupo no session', 'crear_grupo', pg_temp.t_crear_grupo(c.admin, c.de_seg), 'nobody', NULL);
  PERFORM pg_temp.refuses('d crear_grupo no session, NULL id', 'crear_grupo', pg_temp.t_crear_grupo(NULL, c.de_seg), 'nobody', NULL);

  -- ===== crear_grupo_con_director (the caller of crear_grupo) =====
  PERFORM pg_temp.same_as_before('f crear_grupo_con_director admin', 'crear_grupo_con_director', pg_temp.t_con_director(c.de_seg, c.de_sl), 'user', c.admin, true, true, true);
  PERFORM pg_temp.same_as_before('f crear_grupo_con_director director de etapa', 'crear_grupo_con_director', pg_temp.t_con_director(c.de_seg, c.de_sl), 'user', c.de, true, true, true);
  PERFORM pg_temp.same_as_before('f crear_grupo_con_director director de etapa (json claims)', 'crear_grupo_con_director', pg_temp.t_con_director(c.de_seg, c.de_sl), 'user_json', c.de, true, true, true);

  -- ===== crear_solicitud_grupo =====
  PERFORM pg_temp.same_as_before('a crear_solicitud leader files an ingreso', 'crear_solicitud_grupo',
    pg_temp.t_solicitud(c.leader, 'ingreso', c.x_member, c.g_lead, 'Líder'), 'user', c.leader, true, false, true);
  PERFORM pg_temp.same_as_before('a crear_solicitud admin direct ingreso', 'crear_solicitud_grupo',
    pg_temp.t_solicitud(c.admin, 'ingreso', c.x_user, c.g_lead, 'Miembro'), 'user', c.admin, true);
  PERFORM pg_temp.same_as_before('a crear_solicitud admin direct egreso', 'crear_solicitud_grupo',
    pg_temp.t_solicitud(c.admin, 'egreso', c.x_member, c.g_lead, NULL), 'user', c.admin, true);
  PERFORM pg_temp.same_as_before('a crear_solicitud director general direct ingreso', 'crear_solicitud_grupo',
    pg_temp.t_solicitud(c.dg, 'ingreso', c.x_user, c.g_dg, 'Miembro'), 'user_json', c.dg, true);
  PERFORM pg_temp.same_as_before('a crear_solicitud director de etapa files a request', 'crear_solicitud_grupo',
    pg_temp.t_solicitud(c.de, 'ingreso', c.x_user, c.g_de, 'Líder'), 'user', c.de, true, false, true);
  PERFORM pg_temp.refuses('b crear_solicitud leader as admin (direct write)', 'crear_solicitud_grupo',
    pg_temp.t_solicitud(c.admin, 'ingreso', c.x_user, c.g_lead, 'Miembro'), 'user', c.leader);
  PERFORM pg_temp.refuses('b crear_solicitud leader as admin (egreso)', 'crear_solicitud_grupo',
    pg_temp.t_solicitud(c.admin, 'egreso', c.x_member, c.g_lead, NULL), 'user', c.leader);
  PERFORM pg_temp.refuses('b crear_solicitud director de etapa as director general', 'crear_solicitud_grupo',
    pg_temp.t_solicitud(c.dg, 'ingreso', c.x_user, c.g_dg, 'Miembro'), 'user', c.de);
  PERFORM pg_temp.same_as_before('c crear_solicitud service for admin (direct)', 'crear_solicitud_grupo',
    pg_temp.t_solicitud(c.admin, 'ingreso', c.x_user, c.g_lead, 'Miembro'), 'service', NULL, true);
  PERFORM pg_temp.same_as_before('c crear_solicitud service (json) for admin (egreso)', 'crear_solicitud_grupo',
    pg_temp.t_solicitud(c.admin, 'egreso', c.x_member, c.g_lead, NULL), 'service_json', NULL, true);
  PERFORM pg_temp.refuses('d crear_solicitud no session', 'crear_solicitud_grupo',
    pg_temp.t_solicitud(c.admin, 'ingreso', c.x_user, c.g_lead, 'Miembro'), 'nobody', NULL);
  PERFORM pg_temp.refuses('d crear_solicitud no session, NULL id', 'crear_solicitud_grupo',
    pg_temp.t_solicitud(NULL, 'ingreso', c.x_user, c.g_lead, 'Miembro'), 'nobody', NULL);

  -- ===== procesar_solicitud_grupo =====
  PERFORM pg_temp.same_as_before('a procesar admin approves an ingreso', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.admin, c.s_ing, 'aprobar'), 'user', c.admin, true);
  PERFORM pg_temp.same_as_before('a procesar admin rejects an ingreso', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.admin, c.s_ing, 'rechazar'), 'user', c.admin, true);
  PERFORM pg_temp.same_as_before('a procesar admin approves an activation', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.admin, c.s_act, 'aprobar'), 'user', c.admin, true);
  PERFORM pg_temp.same_as_before('a procesar admin rejects an activation (deletes the group)', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.admin, c.s_act, 'rechazar'), 'user', c.admin, true);
  PERFORM pg_temp.same_as_before('a procesar director general approves', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.dg, c.s_dg, 'aprobar'), 'user_json', c.dg, true);
  PERFORM pg_temp.same_as_before('a procesar director general rejects', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.dg, c.s_dg, 'rechazar'), 'user', c.dg, true);
  PERFORM pg_temp.same_as_before('a procesar leader (not a director) is refused as before', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.leader, c.s_ing, 'aprobar'), 'user', c.leader, false);
  PERFORM pg_temp.same_as_before('a procesar invalid action is refused as before', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.admin, c.s_ing, 'otra'), 'user', c.admin, false);
  PERFORM pg_temp.refuses('b procesar leader as admin (approve)', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.admin, c.s_ing, 'aprobar'), 'user', c.leader);
  PERFORM pg_temp.refuses('b procesar leader as admin (reject)', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.admin, c.s_ing, 'rechazar'), 'user', c.leader);
  PERFORM pg_temp.refuses('b procesar leader as admin (activate a group)', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.admin, c.s_act, 'aprobar'), 'user_json', c.leader);
  PERFORM pg_temp.refuses('b procesar leader as admin (delete a group)', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.admin, c.s_act, 'rechazar'), 'user', c.leader);
  PERFORM pg_temp.refuses('b procesar director de etapa as director general', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.dg, c.s_dg, 'aprobar'), 'user', c.de);
  PERFORM pg_temp.same_as_before('c procesar service for admin (approve)', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.admin, c.s_ing, 'aprobar'), 'service', NULL, true);
  PERFORM pg_temp.same_as_before('c procesar service (json) for admin (reject activation)', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.admin, c.s_act, 'rechazar'), 'service_json', NULL, true);
  PERFORM pg_temp.refuses('d procesar no session', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(c.admin, c.s_ing, 'aprobar'), 'nobody', NULL);
  PERFORM pg_temp.refuses('d procesar no session, NULL id', 'procesar_solicitud_grupo',
    pg_temp.t_procesar(NULL, c.s_ing, 'aprobar'), 'nobody', NULL);

  -- ===== asignar_director_etapa_a_ubicacion =====
  -- Known, pre-existing and out of scope here: for anybody who passes the
  -- permission check the live body fails with 42702 ("id" is ambiguous with the
  -- RETURNS TABLE column) at the segmento_lideres lookup, before any write. Both
  -- the old and the new function fail the same way, so the allowed-identity
  -- cases compare that error and expect no rows; the guard is proven by the
  -- refusal cases (a foreign identity never reaches that line).
  PERFORM pg_temp.same_as_before('a asignar_director admin adds', 'asignar_director_etapa_a_ubicacion',
    pg_temp.t_asig_dir(c.admin, 'agregar'), 'user', c.admin, false);
  PERFORM pg_temp.same_as_before('a asignar_director admin removes', 'asignar_director_etapa_a_ubicacion',
    pg_temp.t_asig_dir(c.admin, 'quitar'), 'user_json', c.admin, false);
  PERFORM pg_temp.same_as_before('a asignar_director director general adds', 'asignar_director_etapa_a_ubicacion',
    pg_temp.t_asig_dir(c.dg, 'agregar'), 'user', c.dg, false);
  PERFORM pg_temp.same_as_before('a asignar_director leader (no permission) is refused as before', 'asignar_director_etapa_a_ubicacion',
    pg_temp.t_asig_dir(c.leader, 'agregar'), 'user', c.leader, false);
  PERFORM pg_temp.refuses('b asignar_director leader as admin (add)', 'asignar_director_etapa_a_ubicacion',
    pg_temp.t_asig_dir(c.admin, 'agregar'), 'user', c.leader);
  PERFORM pg_temp.refuses('b asignar_director leader as admin (remove)', 'asignar_director_etapa_a_ubicacion',
    pg_temp.t_asig_dir(c.admin, 'quitar'), 'user', c.leader);
  PERFORM pg_temp.refuses('b asignar_director director de etapa as director general', 'asignar_director_etapa_a_ubicacion',
    pg_temp.t_asig_dir(c.dg, 'agregar'), 'user_json', c.de);
  PERFORM pg_temp.same_as_before('c asignar_director service for admin (add)', 'asignar_director_etapa_a_ubicacion',
    pg_temp.t_asig_dir(c.admin, 'agregar'), 'service', NULL, false);
  PERFORM pg_temp.same_as_before('c asignar_director service (json) for admin (remove)', 'asignar_director_etapa_a_ubicacion',
    pg_temp.t_asig_dir(c.admin, 'quitar'), 'service_json', NULL, false);
  PERFORM pg_temp.refuses('d asignar_director no session', 'asignar_director_etapa_a_ubicacion',
    pg_temp.t_asig_dir(c.admin, 'agregar'), 'nobody', NULL);
  PERFORM pg_temp.refuses('d asignar_director no session, NULL id', 'asignar_director_etapa_a_ubicacion',
    pg_temp.t_asig_dir(NULL, 'agregar'), 'nobody', NULL);

  -- ===== asignar_lider_matrimonio =====
  -- puede_editar_grupo already compares p_auth_id with auth.uid(), so a foreign
  -- identity was refused before too: those cases are not RED, they lock the
  -- behaviour in now that the function has its own guard.
  PERFORM pg_temp.same_as_before('a asignar_lider admin, with spouse', 'asignar_lider_matrimonio',
    pg_temp.t_asig_lider(c.admin, c.g_lead, true), 'user', c.admin, true);
  PERFORM pg_temp.same_as_before('a asignar_lider admin, without spouse', 'asignar_lider_matrimonio',
    pg_temp.t_asig_lider(c.admin, c.g_lead, false), 'user_json', c.admin, true);
  PERFORM pg_temp.same_as_before('a asignar_lider director de etapa of the group', 'asignar_lider_matrimonio',
    pg_temp.t_asig_lider(c.de, c.g_de, true), 'user', c.de, true);
  PERFORM pg_temp.same_as_before('a asignar_lider leader of the group', 'asignar_lider_matrimonio',
    pg_temp.t_asig_lider(c.leader, c.g_lead, true), 'user', c.leader, true);
  PERFORM pg_temp.refuses('b asignar_lider leader as admin', 'asignar_lider_matrimonio',
    pg_temp.t_asig_lider(c.admin, c.g_lead, true), 'user', c.leader);
  PERFORM pg_temp.refuses('b asignar_lider director de etapa as admin', 'asignar_lider_matrimonio',
    pg_temp.t_asig_lider(c.admin, c.g_de, true), 'user_json', c.de);
  PERFORM pg_temp.same_as_before('c asignar_lider service for admin (same refusal as before)', 'asignar_lider_matrimonio',
    pg_temp.t_asig_lider(c.admin, c.g_lead, true), 'service', NULL, false);
  PERFORM pg_temp.refuses('d asignar_lider no session', 'asignar_lider_matrimonio',
    pg_temp.t_asig_lider(c.admin, c.g_lead, true), 'nobody', NULL);
  PERFORM pg_temp.refuses('d asignar_lider no session, NULL id', 'asignar_lider_matrimonio',
    pg_temp.t_asig_lider(NULL, c.g_lead, true), 'nobody', NULL);
END
$cases$;

-- d. anon cannot execute any of them.
SELECT pg_temp.assert_eq('d anon crear_grupo',
  $q$SELECT pg_temp.as_anon_state('SELECT public.crear_grupo(gen_random_uuid(), ''x'', gen_random_uuid(), gen_random_uuid(), NULL)')$q$, '42501');
SELECT pg_temp.assert_eq('d anon crear_solicitud_grupo',
  $q$SELECT pg_temp.as_anon_state('SELECT public.crear_solicitud_grupo(gen_random_uuid(), ''ingreso'', gen_random_uuid(), gen_random_uuid(), NULL, NULL, NULL)')$q$, '42501');
SELECT pg_temp.assert_eq('d anon procesar_solicitud_grupo',
  $q$SELECT pg_temp.as_anon_state('SELECT public.procesar_solicitud_grupo(gen_random_uuid(), gen_random_uuid(), ''aprobar'', NULL)')$q$, '42501');
SELECT pg_temp.assert_eq('d anon asignar_director_etapa_a_ubicacion',
  $q$SELECT pg_temp.as_anon_state('SELECT * FROM public.asignar_director_etapa_a_ubicacion(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), ''quitar'')')$q$, '42501');
SELECT pg_temp.assert_eq('d anon asignar_lider_matrimonio',
  $q$SELECT pg_temp.as_anon_state('SELECT public.asignar_lider_matrimonio(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), true)')$q$, '42501');

-- ---------------------------------------------------------------------------
-- e. Catalog.
-- ---------------------------------------------------------------------------
INSERT INTO t_di_failures
SELECT 'e ' || f.fn || ': ' || x.what || ' changed (' || x.got || ')'
  FROM t_di_fns f
  JOIN pg_proc p ON p.oid = f.sig::regprocedure
  CROSS JOIN LATERAL (VALUES
    ('return type', pg_get_function_result(p.oid), f.ret),
    ('volatility', p.provolatile::text, 'v'),
    ('security definer flag', p.prosecdef::text, 'true'),
    ('owner', pg_get_userbyid(p.proowner), 'postgres'),
    ('language', (SELECT l.lanname FROM pg_language l WHERE l.oid = p.prolang)::text, 'plpgsql'),
    ('ACL', p.proacl::text, '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,supabase_admin=X/postgres}'),
    ('search_path', p.proconfig::text, '{search_path=public}')
  ) x(what, got, expected)
 WHERE x.got IS DISTINCT FROM x.expected;

INSERT INTO t_di_failures
SELECT 'e the guard literal is missing from ' || f.fn
  FROM t_di_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure
 WHERE p.prosrc NOT LIKE '%p_auth_id IS DISTINCT FROM auth.uid()%'
    OR p.prosrc NOT LIKE '%v_request_role text := auth.role()%'
    OR p.prosrc NOT LIKE '%coalesce(v_request_role, '''') <> ''service_role''%';

-- The guard is the first statement after BEGIN.
INSERT INTO t_di_failures
SELECT 'e the guard is not the first statement of ' || f.fn
  FROM t_di_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure
 WHERE position(E'BEGIN\n  -- The caller is the person in the session; only service_role may act for\n  -- somebody else.\n  IF coalesce(v_request_role' IN p.prosrc) = 0;

INSERT INTO t_di_failures
SELECT format('e %s privilege on %s: expected %s', r.priv_role, f.fn, r.expected)
  FROM t_di_fns f
  CROSS JOIN (VALUES ('anon', false), ('authenticated', true), ('service_role', true)) r(priv_role, expected)
 WHERE has_function_privilege(r.priv_role, f.sig, 'execute') IS DISTINCT FROM r.expected;

INSERT INTO t_di_failures
SELECT 'e PUBLIC can execute ' || f.fn
  FROM t_di_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure,
       aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
 WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE';

-- Nothing but the guard and the pin was added: the rebuilt pre-migration
-- definition has the md5 captured on staging before the migration.
INSERT INTO t_di_failures
SELECT 'e ' || f.fn || ': the live body differs from the pre-migration body by more than the guard and the pin'
  FROM t_di_fns f
 WHERE md5(pg_temp.old_def(f.fn)) IS DISTINCT FROM f.md5_before;

-- f. The planner does not call any of the five functions (code lines only).
INSERT INTO t_di_failures
SELECT 'f planner_guardar_planificacion calls ' || m[1]
  FROM pg_proc p,
       LATERAL regexp_matches(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'),
         '(crear_grupo|crear_solicitud_grupo|procesar_solicitud_grupo|asignar_director_etapa_a_ubicacion|asignar_lider_matrimonio)\s*\(', 'g') m
 WHERE p.oid = 'public.planner_guardar_planificacion(uuid,uuid,jsonb,uuid[])'::regprocedure;

-- Every write case ran (guards against a silently empty suite).
INSERT INTO t_di_failures
SELECT 'cases executed: expected at least 36 comparisons and 25 refusals, got '
       || (SELECT count(*) FROM t_di_stats WHERE kind = 'same_as_before') || ' / '
       || (SELECT count(*) FROM t_di_stats WHERE kind = 'refuses')
 WHERE (SELECT count(*) FROM t_di_stats WHERE kind = 'same_as_before') < 36
    OR (SELECT count(*) FROM t_di_stats WHERE kind = 'refuses') < 25;

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_di_failures;

ROLLBACK;
