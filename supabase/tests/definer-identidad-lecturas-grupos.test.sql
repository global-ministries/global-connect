-- L1 (odd/tasks/seguridad-definer-fase2-identidad.md) - identity guard on the
-- group, event and attendance reads that take the caller as p_auth_id.
--
-- Covers, for every function in the migration 20261002100000:
--   a. Own identity: with the session of person A and p_auth_id = A, the result
--      equals what the function returned BEFORE the migration (an md5 of the
--      ordered rows, captured at the top of this file from the live functions,
--      before the migration block below recreates them inside the transaction).
--      Run for an admin, a director general with two segments, a director de
--      etapa and a group leader (all real staging people, resolved by role).
--   b. Foreign identity: with the session of a leader and p_auth_id = the
--      admin's, the result is the function's own "no permission" exit (before
--      the migration it returned the admin's data: that is the RED).
--   c. Service client (both claim styles) with p_auth_id = the admin's: the
--      same as the old result for the admin.
--   d. No session (and a null p_auth_id): the no-permission exit. anon cannot
--      execute (42501).
--   e. Catalog: signature, argument names, return type, volatility, definer
--      flag, owner, language and ACL as before; search_path pinned to public;
--      anon and PUBLIC hold nothing; authenticated and service_role execute;
--      the guard literal is in the body; the four casas map functions that
--      already had their own guard are untouched.
--   f. Directors and leaders keep their own view (covered by case a).
--
-- The migration is copied byte for byte between the two marker comments below.
--
-- Run against STAGING inside BEGIN...ROLLBACK: nothing here is kept. One
-- fixture row (an event with notes, fecha = today, in the leader's group) is
-- inserted so the leaders' notes have data; it is rolled back. The last
-- statement is a SELECT of the failing cases (empty = all ok), because the MCP
-- tool returns only the last result-producing statement.
--
-- Optional: SELECT set_config('di.only', 'probe1,probe2', false); before the
-- BEGIN restricts the per-function cases (a, b, c, d) to those probes, so a slow
-- project can run the suite in several batches. Catalog cases always run.
-- obtener_kpis_grupos_para_usuario(uuid) is only callable while the
-- two-argument overload is absent, so its probe runs alone (see below).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_di_failures (case_name text) ON COMMIT DROP;

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

-- Real people, resolved by role (no hard-coded ids).
CREATE TEMP TABLE t_di_who (who text PRIMARY KEY, auth uuid) ON COMMIT DROP;

INSERT INTO t_di_who(who, auth)
SELECT 'admin', (
  SELECT u.auth_id FROM public.usuarios u
   WHERE u.auth_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                  WHERE ur.usuario_id = u.id AND rs.nombre_interno = 'admin')
     AND NOT EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                      WHERE ur.usuario_id = u.id AND rs.nombre_interno IN ('pastor', 'director-general', 'director-etapa'))
   ORDER BY u.id LIMIT 1);

INSERT INTO t_di_who(who, auth)
SELECT 'dg', (
  SELECT u.auth_id FROM public.director_general_segmentos dgs
    JOIN public.usuarios u ON u.id = dgs.usuario_id
   WHERE u.auth_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                      WHERE ur.usuario_id = u.id AND rs.nombre_interno = 'admin')
   GROUP BY u.id, u.auth_id
  HAVING count(DISTINCT dgs.segmento_id) >= 2
   ORDER BY u.id LIMIT 1);

INSERT INTO t_di_who(who, auth)
SELECT 'de', (
  SELECT u.auth_id FROM (
           SELECT v.director_etapa_usuario_id AS uid, count(*) AS n
             FROM public.v_grupos_supervisiones v
            WHERE v.director_etapa_usuario_id IS NOT NULL
            GROUP BY 1) x
    JOIN public.usuarios u ON u.id = x.uid
   WHERE u.auth_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                  WHERE ur.usuario_id = u.id AND rs.nombre_interno = 'director-etapa')
     AND NOT EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                      WHERE ur.usuario_id = u.id AND rs.nombre_interno IN ('admin', 'pastor', 'director-general'))
   ORDER BY x.n DESC, u.id LIMIT 1);

-- The leader and the group and event the leader can see.
CREATE TEMP TABLE t_di_ctx (g uuid, e uuid, e_notas uuid) ON COMMIT DROP;

INSERT INTO t_di_who(who, auth)
SELECT 'leader', l.auth_id FROM (
  SELECT u.auth_id, gm.grupo_id
    FROM public.grupo_miembros gm
    JOIN public.usuarios u ON u.id = gm.usuario_id
   WHERE gm.rol = 'Líder' AND gm.fecha_salida IS NULL AND u.auth_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                      WHERE ur.usuario_id = u.id AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa'))
   ORDER BY (SELECT count(*) FROM public.asistencia a JOIN public.eventos_grupo e ON e.id = a.evento_grupo_id
              WHERE e.grupo_id = gm.grupo_id) DESC, u.id, gm.grupo_id
   LIMIT 1) l;

INSERT INTO t_di_ctx(g, e)
SELECT gm.grupo_id,
       (SELECT e.id FROM public.eventos_grupo e
         WHERE e.grupo_id = gm.grupo_id
           AND EXISTS (SELECT 1 FROM public.asistencia a WHERE a.evento_grupo_id = e.id)
         ORDER BY e.fecha DESC, e.id DESC LIMIT 1)
  FROM public.grupo_miembros gm
  JOIN public.usuarios u ON u.id = gm.usuario_id
 WHERE u.auth_id = (SELECT auth FROM t_di_who WHERE who = 'leader')
   AND gm.rol = 'Líder' AND gm.fecha_salida IS NULL
 ORDER BY (SELECT count(*) FROM public.asistencia a JOIN public.eventos_grupo e ON e.id = a.evento_grupo_id
            WHERE e.grupo_id = gm.grupo_id) DESC, gm.grupo_id
 LIMIT 1;

-- Fixture: an event with notes today, so obtener_eventos_con_notas has data.
UPDATE t_di_ctx SET e_notas = gen_random_uuid();
INSERT INTO public.eventos_grupo (id, grupo_id, fecha, tema, notas)
SELECT e_notas, g, current_date, 'ZZ Di tema', 'ZZ Di nota' FROM t_di_ctx;

CREATE TEMP TABLE t_di_probes (probe text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO t_di_probes(probe)
SELECT p FROM unnest(ARRAY[
  'buscar_usuarios_para_grupo',
  'listar_eventos_grupo',
  'obtener_evento_grupo',
  'obtener_asistencia_evento',
  'obtener_auditoria_miembros',
  'obtener_detalle_grupo',
  'obtener_grupos_para_usuario',
  'obtener_kpis_grupos_para_usuario_1',
  'obtener_kpis_grupos_para_usuario_2',
  'obtener_eventos_con_notas'
]) p
WHERE (coalesce(nullif(current_setting('di.only', true), ''), '') = ''
       AND p <> 'obtener_kpis_grupos_para_usuario_1')
   OR p = ANY (string_to_array(current_setting('di.only', true), ','));

-- The call of each probe for a given p_auth_id. The KPI timestamp column is
-- left out (it is now()).
CREATE OR REPLACE FUNCTION pg_temp.sql_of(p_probe text, p_arg uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT CASE p_probe
    WHEN 'buscar_usuarios_para_grupo' THEN
      format('SELECT * FROM public.buscar_usuarios_para_grupo(%L, %L, '''', 1000)', p_arg, c.g)
    WHEN 'listar_eventos_grupo' THEN
      format('SELECT * FROM public.listar_eventos_grupo(%L, %L, 50, 0)', p_arg, c.g)
    WHEN 'obtener_evento_grupo' THEN
      format('SELECT * FROM public.obtener_evento_grupo(%L, %L)', p_arg, c.e)
    WHEN 'obtener_asistencia_evento' THEN
      format('SELECT * FROM public.obtener_asistencia_evento(%L, %L)', p_arg, c.e)
    WHEN 'obtener_auditoria_miembros' THEN
      format('SELECT * FROM public.obtener_auditoria_miembros(%L, NULL, NULL, NULL, NULL, NULL, 200, 0, NULL)', p_arg)
    WHEN 'obtener_detalle_grupo' THEN
      format('SELECT public.obtener_detalle_grupo(%L, %L) AS j', p_arg, c.g)
    WHEN 'obtener_grupos_para_usuario' THEN
      format('SELECT * FROM public.obtener_grupos_para_usuario(%L, p_limit => 300)', p_arg)
    WHEN 'obtener_kpis_grupos_para_usuario_1' THEN
      format('SELECT total_grupos, total_con_lider, pct_con_lider, total_aprobados, pct_aprobados, promedio_miembros, desviacion_miembros, total_sin_director, pct_sin_director FROM public.obtener_kpis_grupos_para_usuario(%L::uuid)', p_arg)
    WHEN 'obtener_kpis_grupos_para_usuario_2' THEN
      format('SELECT total_grupos, total_con_lider, pct_con_lider, total_aprobados, pct_aprobados, promedio_miembros, desviacion_miembros, total_sin_director, pct_sin_director FROM public.obtener_kpis_grupos_para_usuario(%L::uuid, NULL::uuid)', p_arg)
    WHEN 'obtener_eventos_con_notas' THEN
      format('SELECT public.obtener_eventos_con_notas(%L, 50) AS j', p_arg)
  END
  FROM t_di_ctx c;
$$;

-- What each function returns for "no permission" (decision D3).
CREATE OR REPLACE FUNCTION pg_temp.exit_of(p_probe text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN CASE p_probe
    WHEN 'buscar_usuarios_para_grupo' THEN 'ERR P0001 permiso_denegado'
    WHEN 'obtener_auditoria_miembros' THEN 'ERR 28000 Usuario no encontrado'
    WHEN 'obtener_kpis_grupos_para_usuario_1' THEN 'ERR P0001 Usuario interno no encontrado'
    WHEN 'obtener_kpis_grupos_para_usuario_2' THEN 'ERR P0001 Usuario interno no encontrado'
    WHEN 'obtener_detalle_grupo' THEN pg_temp.dig('SELECT NULL::jsonb AS j')
    WHEN 'obtener_eventos_con_notas' THEN pg_temp.dig('SELECT ''[]''::jsonb AS j')
    ELSE '0:-'
  END;
END;
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

-- Setup checks: every person and the group and event resolved.
SELECT pg_temp.assert_eq('setup: ' || w, format($q$SELECT (SELECT auth FROM t_di_who WHERE who = %L) IS NOT NULL$q$, w), 'true')
  FROM unnest(ARRAY['admin', 'dg', 'de', 'leader']) w;
SELECT pg_temp.assert_eq('setup: leader group and event resolved',
  $q$SELECT (SELECT g IS NOT NULL AND e IS NOT NULL AND e_notas IS NOT NULL FROM t_di_ctx)$q$, 'true');

-- Catalog before the migration.
CREATE TEMP TABLE t_di_fns (sig text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO t_di_fns(sig) VALUES
  ('public.buscar_usuarios_para_grupo(uuid,uuid,text,integer)'),
  ('public.listar_eventos_grupo(uuid,uuid,integer,integer)'),
  ('public.obtener_evento_grupo(uuid,uuid)'),
  ('public.obtener_asistencia_evento(uuid,uuid)'),
  ('public.obtener_auditoria_miembros(uuid,uuid,uuid,text,timestamp with time zone,timestamp with time zone,integer,integer,text)'),
  ('public.obtener_detalle_grupo(uuid,uuid)'),
  ('public.obtener_grupos_para_usuario(uuid,uuid,uuid,boolean,uuid,uuid,integer,integer,boolean,text,boolean)'),
  ('public.obtener_kpis_grupos_para_usuario(uuid)'),
  ('public.obtener_kpis_grupos_para_usuario(uuid,uuid)'),
  ('public.obtener_eventos_con_notas(uuid,integer)');

-- obtener_kpis_grupos_para_usuario(uuid) cannot be called by SQL while the
-- (uuid, uuid DEFAULT NULL) overload exists: a call with one argument fails
-- with 42725 "function ... is not unique". So its cases run alone, with
-- di.only = 'obtener_kpis_grupos_para_usuario_1', after dropping the two-argument
-- overload inside this transaction (it is dropped again after the migration
-- block recreates it; everything is rolled back).
DO $$
BEGIN
  IF current_setting('di.only', true) = 'obtener_kpis_grupos_para_usuario_1' THEN
    DROP FUNCTION public.obtener_kpis_grupos_para_usuario(uuid, uuid);
    DELETE FROM t_di_fns WHERE sig = 'public.obtener_kpis_grupos_para_usuario(uuid,uuid)';
  END IF;
END;
$$;

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

CREATE TEMP TABLE t_di_cat_old AS
SELECT sig, pg_temp.cat_of(sig) AS cat FROM t_di_fns;

-- The four casas functions that already had their own guard must not change.
CREATE TEMP TABLE t_di_casas_old AS
SELECT p.oid::regprocedure::text AS sig, md5(pg_get_functiondef(p.oid)) AS md5
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('obtener_casas_revision_pendiente', 'obtener_grupos_sin_casa_anfitriona',
                     'obtener_mapa_grupos_vida_host_homes', 'obtener_mapa_miembros');

-- The live bodies, to prove the migration only adds lines (see case e below).
CREATE TEMP TABLE t_di_src_old AS
SELECT f.sig, p.prosrc AS src
  FROM t_di_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure;

-- Results BEFORE the migration, per person and function, from the live text.
CREATE TEMP TABLE t_di_old (probe text, who text, val text, PRIMARY KEY (probe, who)) ON COMMIT DROP;
INSERT INTO t_di_old(probe, who, val)
SELECT p.probe, w.who, pg_temp.run(p.probe, 'user', w.auth, w.auth)
  FROM t_di_probes p CROSS JOIN t_di_who w;

-- The fixture must make the admin's data differ from the "no permission" exit,
-- otherwise case b would prove nothing.
INSERT INTO t_di_failures
SELECT 'setup: admin data is not the exit for ' || o.probe
  FROM t_di_old o
 WHERE o.who = 'admin' AND o.val = pg_temp.exit_of(o.probe);

-- >>> BEGIN migration 20261002100000_definer_identidad_lecturas_grupos.sql (byte-identical copy)
-- Identity guard for the group, event and attendance reads that take the
-- caller as an argument (security phase 2, batch 1).
--
-- What was wrong in the live functions:
--   * They are SECURITY DEFINER and take the caller's identity as p_auth_id, but
--     never compared it with the session. Any logged-in person who knew another
--     person's auth id could read what that person can read: the group list and
--     KPIs of an admin, the detail of any group the admin sees (members' email
--     and phone, private notes), the member audit trail, the leaders' notes,
--     and, for three functions that check nothing at all, any event of any group
--     (including the leader's private notes and the attendance sheet).
--
-- What changes (signature, argument names and defaults, return type, language,
-- volatility, SECURITY DEFINER and owner are unchanged, so the app needs no
-- change):
--   * Identity: p_auth_id must equal auth.uid(), unless the call comes from
--     service_role. This is the pattern of 20260930100000. The guard is the
--     first statement of each body; the rest of every body is the live text.
--   * search_path is pinned to public where the function had none. Every object
--     the bodies use is already schema-qualified (public.*, auth.*), so the pin
--     changes no resolution.
--   * Grants: anon and PUBLIC lose execute (they already hold nothing since the
--     anon lock-down); authenticated and service_role keep it. The grants are
--     restated at the end of the file.
--
-- Exit for another person's identity or no session (decision D3: the same shape
-- the function already uses for "no permission / unknown user"):
--   buscar_usuarios_para_grupo         RAISE 'permiso_denegado' (as today)
--   listar_eventos_grupo               RETURN (no rows); it has no denial today
--   obtener_evento_grupo               RETURN (no rows); it has no denial today
--   obtener_asistencia_evento          RETURN (no rows); it has no denial today
--   obtener_auditoria_miembros         RAISE 'Usuario no encontrado', SQLSTATE
--                                      28000 (as for an unknown user today)
--   obtener_detalle_grupo              RETURN NULL (as for no visibility today)
--   obtener_grupos_para_usuario        RETURN (no rows, as for an unknown user)
--   obtener_kpis_grupos_para_usuario   RAISE 'Usuario interno no encontrado'
--     (both overloads)                 (as for an unknown user today)
--   obtener_eventos_con_notas          RETURN '[]'::jsonb (as for no access)
--
-- Not touched: obtener_casas_revision_pendiente, obtener_grupos_sin_casa_anfitriona,
-- obtener_mapa_grupos_vida_host_homes and obtener_mapa_miembros already stop with
-- casas_map_auth_matches_actor(p_auth_id) as their first statement.
--
-- Blast radius: the app and the planner call these functions with the session
-- client and the person's own id (the guard lets that through). Scripts use the
-- service client, which stays exempt. Other functions that call these pass on
-- their own p_auth_id or auth.uid(). Only a caller that passes somebody else's
-- id changes, and that is the point.
--
-- Rollback: recreate the previous definitions. The latest migration that defined
-- each function is:
--   buscar_usuarios_para_grupo         20250906111510_grupo_detalle_y_miembros.sql
--   listar_eventos_grupo               20250909133000_fix_listar_eventos_ambiguity.sql
--   obtener_evento_grupo               20250909131500_asistencia_relax_perms.sql
--   obtener_asistencia_evento          20250909133500_fix_obtener_asistencia_evento_return.sql
--   obtener_auditoria_miembros         20250906131000_update_auditoria_add_names_and_filters.sql
--   obtener_detalle_grupo              20260314_004_fix_detalle_grupo_fecha_salida.sql
--   obtener_grupos_para_usuario        20260929150000_gdv_dg_regla_en_grupos.sql
--   obtener_kpis_grupos_para_usuario   20260929160000_gdv_dg_regla_en_tablero_y_casas.sql
--   obtener_eventos_con_notas          20260314_007_rpc_eventos_con_notas.sql
-- Some of those files were later overridden by a live edit, so production keeps
-- a backup table of the live definitions that the operator creates before
-- applying this file; restore from that table.

CREATE OR REPLACE FUNCTION public.buscar_usuarios_para_grupo(p_auth_id uuid, p_grupo_id uuid, p_query text, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, nombre text, apellido text, email text, telefono text, ya_es_miembro boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'permiso_denegado';
  END IF;

  IF NOT public.puede_gestionar_miembros(p_auth_id, p_grupo_id) THEN
    RAISE EXCEPTION 'permiso_denegado';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.nombre,
    u.apellido,
    u.email,
    u.telefono,
    EXISTS (
      SELECT 1 FROM public.grupo_miembros gm
      WHERE gm.grupo_id = p_grupo_id AND gm.usuario_id = u.id
    ) AS ya_es_miembro
  FROM public.usuarios u
  WHERE (
    p_query IS NULL OR p_query = '' OR
    u.nombre ILIKE '%' || p_query || '%' OR
    u.apellido ILIKE '%' || p_query || '%' OR
    u.email ILIKE '%' || p_query || '%' OR
    u.telefono ILIKE '%' || p_query || '%'
  )
  ORDER BY u.nombre, u.apellido
  LIMIT COALESCE(p_limit, 10);
END;
$function$;

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
begin
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN;
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
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN;
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
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN;
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

CREATE OR REPLACE FUNCTION public.obtener_auditoria_miembros(p_auth_id uuid, p_grupo_id uuid DEFAULT NULL::uuid, p_usuario_id uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone, p_hasta timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_actor_query text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, happened_at timestamp with time zone, action text, grupo_id uuid, usuario_id uuid, actor_auth_id uuid, actor_usuario_id uuid, actor_nombre text, usuario_nombre text, usuario_email text, old_data jsonb, new_data jsonb, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  internal_user_id uuid;
  is_admin boolean;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = '28000';
  END IF;

  SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF internal_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno = 'admin'
  ) INTO is_admin;

  RETURN QUERY
  WITH base AS (
    SELECT a.*
    FROM public.audit_grupo_miembros a
    WHERE
      (p_grupo_id IS NULL OR a.grupo_id = p_grupo_id)
      AND (p_usuario_id IS NULL OR a.usuario_id = p_usuario_id)
      AND (p_action IS NULL OR a.action = p_action)
      AND (p_desde IS NULL OR a.happened_at >= p_desde)
      AND (p_hasta IS NULL OR a.happened_at <= p_hasta)
  ), no_miembros AS (
    SELECT b.* FROM base b
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grupo_miembros gm
      WHERE gm.grupo_id = b.grupo_id AND gm.usuario_id = internal_user_id AND gm.rol = 'Miembro'
    )
  ), autorizada AS (
    SELECT b2.* FROM no_miembros b2
    WHERE is_admin OR public.puede_ver_grupo(internal_user_id, b2.grupo_id) = true
  ), joined AS (
    SELECT a.*, ua.nombre AS actor_nombre, ua.apellido AS actor_apellido,
           uu.nombre AS usuario_nombre, uu.apellido AS usuario_apellido, uu.email AS usuario_email
    FROM autorizada a
    LEFT JOIN public.usuarios ua ON ua.id = a.actor_usuario_id
    LEFT JOIN public.usuarios uu ON uu.id = a.usuario_id
    WHERE (
      p_actor_query IS NULL OR (
        ua.nombre ILIKE '%'||p_actor_query||'%' OR ua.apellido ILIKE '%'||p_actor_query||'%'
      )
    )
  ), counted AS (
    SELECT j.*, (SELECT count(*) FROM joined) AS total_count
    FROM joined j
  )
  SELECT c.id, c.happened_at, c.action, c.grupo_id, c.usuario_id, c.actor_auth_id, c.actor_usuario_id,
         trim(COALESCE(c.actor_nombre,'')||' '||COALESCE(c.actor_apellido,'')) AS actor_nombre,
         trim(COALESCE(c.usuario_nombre,'')||' '||COALESCE(c.usuario_apellido,'')) AS usuario_nombre,
         c.usuario_email,
         c.old_data, c.new_data, c.total_count
  FROM counted c
  ORDER BY c.happened_at DESC, c.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_detalle_grupo(p_auth_id uuid, p_grupo_id uuid)
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
  internal_user_id uuid;
  is_superior boolean := false;
  result jsonb;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN NULL;
  END IF;

  -- Mapear auth_id al id interno del usuario
  IF p_auth_id IS NOT NULL THEN
    SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
    IF internal_user_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.usuario_roles ur
        JOIN public.roles_sistema rs ON ur.rol_id = rs.id
        WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno IN ('admin','pastor','director-general')
      ) INTO is_superior;
    END IF;
  END IF;

  -- Validación de visibilidad
  IF NOT (is_superior OR public.puede_ver_grupo(internal_user_id, p_grupo_id) = true) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', g.id,
    'nombre', g.nombre,
    'segmento_id', g.segmento_id,
    'temporada_id', g.temporada_id,
    'segmento_nombre', s.nombre,
    'temporada_nombre', t.nombre,
    'dia_reunion', g.dia_reunion,
    'hora_reunion', g.hora_reunion,
    'activo', g.activo,
    'notas_privadas', g.notas_privadas,
    'direccion', CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', d.id,
      'calle', d.calle,
      'barrio', d.barrio,
      'codigo_postal', d.codigo_postal,
      'referencia', d.referencia,
      'latitud', d.latitud,
      'longitud', d.longitud,
      'parroquia', CASE WHEN pa.id IS NULL THEN NULL ELSE jsonb_build_object('id', pa.id, 'nombre', pa.nombre) END
    ) END,
    'miembros', COALESCE(miembros_data.lista, '[]'::jsonb),
    'puede_gestionar_miembros', public.puede_gestionar_miembros(p_auth_id, p_grupo_id),
    'rol_en_grupo', (
      SELECT gm.rol FROM public.grupo_miembros gm
      WHERE gm.grupo_id = g.id AND gm.usuario_id = internal_user_id
        AND gm.fecha_salida IS NULL
      LIMIT 1
    )
  )
  INTO result
  FROM public.grupos g
  LEFT JOIN public.segmentos s ON s.id = g.segmento_id
  LEFT JOIN public.temporadas t ON t.id = g.temporada_id
  LEFT JOIN public.direcciones d ON d.id = g.direccion_anfitrion_id
  LEFT JOIN public.parroquias pa ON pa.id = d.parroquia_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'nombre', u.nombre,
        'apellido', u.apellido,
        'email', u.email,
        'telefono', u.telefono,
        'rol', gm.rol,
        'foto_perfil_url', u.foto_perfil_url
      )
      ORDER BY 
        CASE WHEN gm.rol = 'Líder' THEN 1 
             WHEN gm.rol = 'Colíder' THEN 2 
             ELSE 3 END,
        COALESCE(
          LEAST(u.id, (
            SELECT CASE 
              WHEN ru.usuario1_id = u.id THEN ru.usuario2_id 
              ELSE ru.usuario1_id 
            END
            FROM public.relaciones_usuarios ru
            WHERE ru.tipo_relacion = 'conyuge'
              AND (ru.usuario1_id = u.id OR ru.usuario2_id = u.id)
              AND EXISTS (
                SELECT 1 FROM public.grupo_miembros gm2
                WHERE gm2.grupo_id = g.id
                  AND gm2.fecha_salida IS NULL
                  AND gm2.usuario_id = CASE 
                    WHEN ru.usuario1_id = u.id THEN ru.usuario2_id 
                    ELSE ru.usuario1_id 
                  END
              )
            LIMIT 1
          )),
          u.id
        ),
        CASE WHEN u.genero = 'Masculino' THEN 1 
             WHEN u.genero = 'Femenino' THEN 2 
             ELSE 3 END,
        u.nombre, 
        u.apellido
    ) AS lista
    FROM public.grupo_miembros gm
    JOIN public.usuarios u ON u.id = gm.usuario_id
    WHERE gm.grupo_id = g.id
      AND gm.fecha_salida IS NULL
  ) miembros_data ON TRUE
  WHERE g.id = p_grupo_id;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_grupos_para_usuario(p_auth_id uuid, p_segmento_id uuid DEFAULT NULL::uuid, p_temporada_id uuid DEFAULT NULL::uuid, p_activo boolean DEFAULT NULL::boolean, p_municipio_id uuid DEFAULT NULL::uuid, p_parroquia_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_eliminado boolean DEFAULT false, p_estado_temporal text DEFAULT NULL::text, p_solo_mios boolean DEFAULT false)
 RETURNS TABLE(id uuid, nombre text, activo boolean, eliminado boolean, segmento_nombre text, temporada_nombre text, fecha_creacion timestamp with time zone, municipio_id uuid, municipio_nombre text, parroquia_id uuid, parroquia_nombre text, lideres json, miembros_count integer, supervisado_por_mi boolean, soy_miembro boolean, soy_lider boolean, hay_mis_grupos boolean, estado_temporal text, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  internal_user_id uuid;
  is_admin boolean;
  is_dg boolean;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN;
  END IF;

  IF p_auth_id IS NULL THEN RETURN; END IF;
  SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF internal_user_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno IN ('admin','pastor')
  ) INTO is_admin;

  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno = 'director-general'
  ) INTO is_dg;

  RETURN QUERY WITH base AS (
    SELECT 
      g.id AS id,
      g.nombre AS nombre,
      g.activo AS activo,
      g.eliminado AS eliminado,
      s.nombre AS segmento_nombre,
      t.nombre AS temporada_nombre,
      g.fecha_creacion AS fecha_creacion,
      m.id AS municipio_id,
      m.nombre AS municipio_nombre,
      p.id AS parroquia_id,
      p.nombre AS parroquia_nombre,
      (
        SELECT json_agg(json_build_object(
          'id', u.id,
          'nombre_completo', trim(coalesce(u.nombre,'') || ' ' || coalesce(u.apellido,'')),
          'rol', gm.rol
        ) ORDER BY gm.rol, u.apellido)
        FROM public.grupo_miembros gm
        JOIN public.usuarios u ON u.id = gm.usuario_id
        WHERE gm.grupo_id = g.id AND gm.rol IN ('Líder','Colíder')
      ) AS lideres,
      (SELECT count(*)::int FROM public.grupo_miembros gm2 WHERE gm2.grupo_id = g.id) AS miembros_count,
      (
        SELECT EXISTS(
          SELECT 1
          FROM public.director_etapa_grupos deg
          JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
          WHERE deg.grupo_id = g.id AND sl.usuario_id = internal_user_id AND sl.tipo_lider = 'director_etapa'
        )
      ) AS supervisado_por_mi,
      (
        SELECT EXISTS(
          SELECT 1 FROM public.grupo_miembros gm3 WHERE gm3.grupo_id = g.id AND gm3.usuario_id = internal_user_id
        )
      ) AS soy_miembro,
      (
        SELECT EXISTS(
          SELECT 1 FROM public.grupo_miembros gm4
          WHERE gm4.grupo_id = g.id AND gm4.usuario_id = internal_user_id AND gm4.rol IN ('Líder','Colíder')
        )
      ) AS soy_lider,
      CASE
        WHEN t.fecha_inicio > CURRENT_DATE THEN 'futuro'
        WHEN g.activo = true AND t.fecha_inicio <= CURRENT_DATE AND t.fecha_fin >= CURRENT_DATE THEN 'actual'
        ELSE 'pasado'
      END AS estado_temporal
    FROM public.grupos g
    LEFT JOIN public.segmentos s ON s.id = g.segmento_id
    LEFT JOIN public.temporadas t ON t.id = g.temporada_id
    LEFT JOIN public.direcciones d ON d.id = g.direccion_anfitrion_id
    LEFT JOIN public.parroquias p ON p.id = d.parroquia_id
    LEFT JOIN public.municipios m ON m.id = p.municipio_id
    WHERE
      (
        is_admin
        OR (is_dg AND g.id IN (
          SELECT public.gdv_dg_grupos_visibles(internal_user_id)
        ))
        OR public.puede_ver_grupo(internal_user_id, g.id)
      )
      AND (p_segmento_id IS NULL OR g.segmento_id = p_segmento_id)
      AND (p_temporada_id IS NULL OR g.temporada_id = p_temporada_id)
      AND (p_activo IS NULL OR g.activo = p_activo)
      AND (p_municipio_id IS NULL OR m.id = p_municipio_id)
      AND (p_parroquia_id IS NULL OR p.id = p_parroquia_id)
      AND (g.eliminado = COALESCE(p_eliminado, false))
      AND (NOT p_solo_mios OR EXISTS (
            SELECT 1 FROM public.grupo_miembros gm3
            WHERE gm3.grupo_id = g.id AND gm3.usuario_id = internal_user_id
          ))
      AND (
        p_estado_temporal IS NULL OR (
          CASE
            WHEN t.fecha_inicio > CURRENT_DATE THEN 'futuro'
            WHEN g.activo = true AND t.fecha_inicio <= CURRENT_DATE AND t.fecha_fin >= CURRENT_DATE THEN 'actual'
            ELSE 'pasado'
          END
        ) = p_estado_temporal
      )
  ), stats AS (
    SELECT coalesce(bool_or(b.soy_miembro), false) AS hay_mis_grupos FROM base b
  ), counted AS (
    SELECT b.*, count(*) OVER() AS total_count FROM base b
  )
  SELECT
    c.id,
    c.nombre,
    c.activo,
    c.eliminado,
    c.segmento_nombre,
    c.temporada_nombre,
    c.fecha_creacion,
    c.municipio_id,
    c.municipio_nombre,
    c.parroquia_id,
    c.parroquia_nombre,
    c.lideres,
    c.miembros_count,
    c.supervisado_por_mi,
    c.soy_miembro,
    c.soy_lider,
    s.hay_mis_grupos,
    c.estado_temporal,
    c.total_count
  FROM counted c
  CROSS JOIN stats s
  ORDER BY c.fecha_creacion DESC NULLS LAST, c.nombre ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_kpis_grupos_para_usuario(p_auth_id uuid)
 RETURNS TABLE(total_grupos integer, total_con_lider integer, pct_con_lider numeric, total_aprobados integer, pct_aprobados numeric, promedio_miembros numeric, desviacion_miembros numeric, total_sin_director integer, pct_sin_director numeric, fecha_ultima_actualizacion timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_es_superior boolean;
  v_es_dg boolean;
  v_es_director_etapa boolean;
  v_es_lider boolean;
  v_usuario_id uuid;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Usuario interno no encontrado';
  END IF;

  IF p_auth_id IS NULL THEN
    RAISE EXCEPTION 'Auth requerido';
  END IF;

  SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuario interno no encontrado';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno IN ('admin','pastor')
  ) INTO v_es_superior;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno = 'director-general'
  ) INTO v_es_dg;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno = 'director-etapa'
  ) INTO v_es_director_etapa;

  SELECT EXISTS(
    SELECT 1 FROM public.grupo_miembros gm WHERE gm.usuario_id = v_usuario_id AND gm.rol = 'Líder'
  ) INTO v_es_lider;

  RETURN QUERY
  WITH universo AS (
    SELECT * FROM public.v_grupos_supervisiones v
    WHERE (
      v_es_superior
      OR (v_es_dg AND v.grupo_id IN (
        SELECT public.gdv_dg_grupos_visibles(v_usuario_id)
      ))
      OR (v_es_director_etapa AND v.director_etapa_usuario_id = v_usuario_id)
      OR (v_es_lider AND v.grupo_id IN (
        SELECT gm2.grupo_id FROM public.grupo_miembros gm2 WHERE gm2.usuario_id = v_usuario_id AND gm2.rol = 'Líder'
      ))
    )
  ), agregados AS (
    SELECT
      COUNT(*)::int AS total,
      (COUNT(*) FILTER (WHERE lider_usuario_id IS NOT NULL))::int AS con_lider,
      (COUNT(*) FILTER (WHERE estado_aprobacion = 'aprobado'))::int AS aprobados,
      (COUNT(*) FILTER (WHERE director_etapa_usuario_id IS NULL))::int AS sin_director,
      AVG(total_miembros)::numeric AS prom_miembros,
      STDDEV_POP(total_miembros)::numeric AS std_miembros
    FROM universo
  )
  SELECT
    COALESCE(total,0) AS total_grupos,
    COALESCE(con_lider,0) AS total_con_lider,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(con_lider::numeric * 100 / total, 2) ELSE 0 END AS pct_con_lider,
    COALESCE(aprobados,0) AS total_aprobados,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(aprobados::numeric * 100 / total, 2) ELSE 0 END AS pct_aprobados,
    prom_miembros AS promedio_miembros,
    std_miembros AS desviacion_miembros,
    COALESCE(sin_director,0) AS total_sin_director,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(sin_director::numeric * 100 / total, 2) ELSE 0 END AS pct_sin_director,
    NOW() AS fecha_ultima_actualizacion
  FROM agregados;
END;$function$;

CREATE OR REPLACE FUNCTION public.obtener_kpis_grupos_para_usuario(p_auth_id uuid, p_campus_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_grupos integer, total_con_lider integer, pct_con_lider numeric, total_aprobados integer, pct_aprobados numeric, promedio_miembros numeric, desviacion_miembros numeric, total_sin_director integer, pct_sin_director numeric, fecha_ultima_actualizacion timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_es_superior boolean;
  v_es_dg boolean;
  v_es_director_etapa boolean;
  v_es_lider boolean;
  v_usuario_id uuid;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Usuario interno no encontrado';
  END IF;

  IF p_auth_id IS NULL THEN
    RAISE EXCEPTION 'Auth requerido';
  END IF;

  SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuario interno no encontrado';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno IN ('admin','pastor')
  ) INTO v_es_superior;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno = 'director-general'
  ) INTO v_es_dg;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno = 'director-etapa'
  ) INTO v_es_director_etapa;

  SELECT EXISTS(
    SELECT 1 FROM public.grupo_miembros gm WHERE gm.usuario_id = v_usuario_id AND gm.rol = 'Líder'
  ) INTO v_es_lider;

  RETURN QUERY
  WITH universo AS (
    SELECT * FROM public.v_grupos_supervisiones v
    WHERE (
      v_es_superior
      OR (v_es_dg AND v.grupo_id IN (
        SELECT public.gdv_dg_grupos_visibles(v_usuario_id)
      ))
      OR (v_es_director_etapa AND v.director_etapa_usuario_id = v_usuario_id)
      OR (v_es_lider AND v.grupo_id IN (
        SELECT gm2.grupo_id FROM public.grupo_miembros gm2 WHERE gm2.usuario_id = v_usuario_id AND gm2.rol = 'Líder'
      ))
    )
    -- NUEVO: filtro campus
    AND (p_campus_id IS NULL OR v.grupo_id IN (
      SELECT g.id FROM public.grupos g WHERE g.campus_id = p_campus_id
    ))
  ), agregados AS (
    SELECT
      COUNT(*)::int AS total,
      (COUNT(*) FILTER (WHERE lider_usuario_id IS NOT NULL))::int AS con_lider,
      (COUNT(*) FILTER (WHERE estado_aprobacion = 'aprobado'))::int AS aprobados,
      (COUNT(*) FILTER (WHERE director_etapa_usuario_id IS NULL))::int AS sin_director,
      AVG(total_miembros)::numeric AS prom_miembros,
      STDDEV_POP(total_miembros)::numeric AS std_miembros
    FROM universo
  )
  SELECT
    COALESCE(total,0) AS total_grupos,
    COALESCE(con_lider,0) AS total_con_lider,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(con_lider::numeric * 100 / total, 2) ELSE 0 END AS pct_con_lider,
    COALESCE(aprobados,0) AS total_aprobados,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(aprobados::numeric * 100 / total, 2) ELSE 0 END AS pct_aprobados,
    prom_miembros AS promedio_miembros,
    std_miembros AS desviacion_miembros,
    COALESCE(sin_director,0) AS total_sin_director,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(sin_director::numeric * 100 / total, 2) ELSE 0 END AS pct_sin_director,
    NOW() AS fecha_ultima_actualizacion
  FROM agregados;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_eventos_con_notas(p_auth_id uuid, p_limite integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_user_id uuid;
  v_is_admin_pastor boolean := false;
  v_is_director boolean := false;
  v_result jsonb;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT id INTO v_user_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_user_id
      AND rs.nombre_interno IN ('admin', 'pastor')
  ) INTO v_is_admin_pastor;

  IF NOT v_is_admin_pastor THEN
    SELECT EXISTS(
      SELECT 1 FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
      WHERE ur.usuario_id = v_user_id
        AND rs.nombre_interno IN ('director-general', 'director-etapa')
    ) INTO v_is_director;

    IF NOT v_is_director THEN
      RETURN '[]'::jsonb;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY fecha DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'evento_id', eg.id,
      'grupo_id', g.id,
      'grupo_nombre', g.nombre,
      'fecha', eg.fecha,
      'hora', eg.hora,
      'tema', COALESCE(eg.tema, 'Sin tema'),
      'notas', eg.notas,
      'lider_nombre', COALESCE(
        (SELECT u.nombre || ' ' || u.apellido
         FROM public.grupo_miembros gm
         JOIN public.usuarios u ON u.id = gm.usuario_id
         WHERE gm.grupo_id = g.id AND gm.rol::text = 'Líder'
         LIMIT 1),
        'Sin líder'
      ),
      'presentes', (SELECT COUNT(*) FILTER (WHERE a.presente = true) FROM public.asistencia a WHERE a.evento_grupo_id = eg.id),
      'total', (SELECT COUNT(*) FROM public.asistencia a WHERE a.evento_grupo_id = eg.id)
    ) AS row_data,
    eg.fecha
    FROM public.eventos_grupo eg
    JOIN public.grupos g ON g.id = eg.grupo_id
    WHERE eg.notas IS NOT NULL
      AND TRIM(eg.notas) != ''
      AND eg.fecha >= CURRENT_DATE - INTERVAL '30 days'
      AND (
        v_is_admin_pastor
        OR public.puede_ver_grupo(v_user_id, g.id)
      )
    ORDER BY eg.fecha DESC
    LIMIT p_limite
  ) sub;

  RETURN v_result;
END;
$function$;

-- Execution rights: signed-in people and the service client only.
REVOKE ALL ON FUNCTION public.buscar_usuarios_para_grupo(uuid, uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listar_eventos_grupo(uuid, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_evento_grupo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_asistencia_evento(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_auditoria_miembros(uuid, uuid, uuid, text, timestamp with time zone, timestamp with time zone, integer, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_detalle_grupo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, integer, integer, boolean, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_kpis_grupos_para_usuario(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_kpis_grupos_para_usuario(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_eventos_con_notas(uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.buscar_usuarios_para_grupo(uuid, uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_eventos_grupo(uuid, uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_evento_grupo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_asistencia_evento(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_auditoria_miembros(uuid, uuid, uuid, text, timestamp with time zone, timestamp with time zone, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_detalle_grupo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, integer, integer, boolean, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_kpis_grupos_para_usuario(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_kpis_grupos_para_usuario(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_eventos_con_notas(uuid, integer) TO authenticated, service_role;
-- <<< END migration 20261002100000_definer_identidad_lecturas_grupos.sql

-- See the note above: the one-argument KPI overload is only callable while the
-- two-argument one is absent.
DO $$
BEGIN
  IF current_setting('di.only', true) = 'obtener_kpis_grupos_para_usuario_1' THEN
    DROP FUNCTION public.obtener_kpis_grupos_para_usuario(uuid, uuid);
  END IF;
END;
$$;

-- Cases ----------------------------------------------------------------------

-- a / f. Own identity: the same result as before the migration, for the admin,
-- the director general with two segments, the director de etapa and the leader.
INSERT INTO t_di_failures
SELECT format('a own identity %s as %s: before %s, after %s', x.probe, x.who, x.val, x.nv)
  FROM (SELECT o.probe, o.who, o.val, pg_temp.run(o.probe, 'user', w.auth, w.auth) AS nv
          FROM t_di_old o JOIN t_di_who w ON w.who = o.who) x
 WHERE x.nv IS DISTINCT FROM x.val;

-- a'. The same with the identity published only as JSON claims.
INSERT INTO t_di_failures
SELECT format('a own identity (JSON claims) %s as %s: before %s, after %s', x.probe, x.who, x.val, x.nv)
  FROM (SELECT o.probe, o.who, o.val, pg_temp.run(o.probe, 'user_json', w.auth, w.auth) AS nv
          FROM t_di_old o JOIN t_di_who w ON w.who = o.who) x
 WHERE x.nv IS DISTINCT FROM x.val;

-- b. Foreign identity: the leader (and the directors) ask with the admin's id
-- and get the function's own "no permission" exit.
INSERT INTO t_di_failures
SELECT format('b foreign identity %s as %s with the admin id: expected %s, got %s', x.probe, x.who, pg_temp.exit_of(x.probe), x.nv)
  FROM (SELECT p.probe, s.who,
               pg_temp.run(p.probe, 'user', s.auth, (SELECT auth FROM t_di_who WHERE who = 'admin')) AS nv
          FROM t_di_probes p
          JOIN t_di_who s ON s.who IN ('leader', 'de', 'dg')) x
 WHERE x.nv IS DISTINCT FROM pg_temp.exit_of(x.probe);

-- b'. Foreign identity published only as JSON claims.
INSERT INTO t_di_failures
SELECT format('b foreign identity (JSON claims) %s as leader with the admin id: expected %s, got %s', x.probe, pg_temp.exit_of(x.probe), x.nv)
  FROM (SELECT p.probe,
               pg_temp.run(p.probe, 'user_json', (SELECT auth FROM t_di_who WHERE who = 'leader'),
                           (SELECT auth FROM t_di_who WHERE who = 'admin')) AS nv
          FROM t_di_probes p) x
 WHERE x.nv IS DISTINCT FROM pg_temp.exit_of(x.probe);

-- b''. The admin asking with the leader's id is also a foreign identity.
INSERT INTO t_di_failures
SELECT format('b foreign identity %s as admin with the leader id: expected %s, got %s', x.probe, pg_temp.exit_of(x.probe), x.nv)
  FROM (SELECT p.probe,
               pg_temp.run(p.probe, 'user', (SELECT auth FROM t_di_who WHERE who = 'admin'),
                           (SELECT auth FROM t_di_who WHERE who = 'leader')) AS nv
          FROM t_di_probes p) x
 WHERE x.nv IS DISTINCT FROM pg_temp.exit_of(x.probe);

-- c. Service client, both claim styles, acting for the admin and for the leader.
INSERT INTO t_di_failures
SELECT format('c service client (%s) %s for %s: before %s, after %s', x.mode, x.probe, x.who, x.val, x.nv)
  FROM (SELECT o.probe, o.who, o.val, m.mode,
               pg_temp.run(o.probe, m.mode, NULL, w.auth) AS nv
          FROM t_di_old o
          JOIN t_di_who w ON w.who = o.who AND w.who IN ('admin', 'leader')
          CROSS JOIN (VALUES ('service'), ('service_json')) m(mode)) x
 WHERE x.nv IS DISTINCT FROM x.val;

-- d. No session: the no-permission exit, for a real id and for NULL.
INSERT INTO t_di_failures
SELECT format('d no session %s with %s id: expected %s, got %s', x.probe, x.kind, pg_temp.exit_of(x.probe), x.nv)
  FROM (SELECT p.probe, k.kind,
               pg_temp.run(p.probe, 'nobody', NULL,
                           CASE k.kind WHEN 'admin' THEN (SELECT auth FROM t_di_who WHERE who = 'admin') END) AS nv
          FROM t_di_probes p CROSS JOIN (VALUES ('admin'), ('null')) k(kind)) x
 WHERE x.nv IS DISTINCT FROM pg_temp.exit_of(x.probe);

-- d'. A signed-in person who passes a NULL id is not the caller either.
INSERT INTO t_di_failures
SELECT format('d signed-in with a NULL id %s: expected %s, got %s', x.probe, pg_temp.exit_of(x.probe), x.nv)
  FROM (SELECT p.probe,
               pg_temp.run(p.probe, 'user', (SELECT auth FROM t_di_who WHERE who = 'leader'), NULL) AS nv
          FROM t_di_probes p) x
 WHERE x.nv IS DISTINCT FROM pg_temp.exit_of(x.probe);

-- d''. anon cannot execute any of them (42501).
INSERT INTO t_di_failures
SELECT format('d anon %s: expected 42501, got %s', x.probe, x.st)
  FROM (SELECT p.probe,
               pg_temp.as_anon_state(pg_temp.sql_of(p.probe, (SELECT auth FROM t_di_who WHERE who = 'admin'))) AS st
          FROM t_di_probes p) x
 WHERE x.st IS DISTINCT FROM '42501';

-- e. Catalog.
INSERT INTO t_di_failures
SELECT format('e catalog changed for %s: before [%s], after [%s]', o.sig, o.cat, pg_temp.cat_of(o.sig))
  FROM t_di_cat_old o
 WHERE pg_temp.cat_of(o.sig) IS DISTINCT FROM o.cat;

INSERT INTO t_di_failures
SELECT 'e search_path is not pinned to public for ' || f.sig
  FROM t_di_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure
 WHERE p.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[];

INSERT INTO t_di_failures
SELECT 'e the guard literal is missing from ' || f.sig
  FROM t_di_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure
 WHERE p.prosrc NOT LIKE '%p_auth_id IS DISTINCT FROM auth.uid()%'
    OR p.prosrc NOT LIKE '%v_request_role text := auth.role()%';

INSERT INTO t_di_failures
SELECT format('e %s privilege on %s: expected %s', r.priv_role, f.sig, r.expected)
  FROM t_di_fns f
  CROSS JOIN (VALUES ('anon', false), ('authenticated', true), ('service_role', true)) r(priv_role, expected)
 WHERE has_function_privilege(r.priv_role, f.sig, 'execute') IS DISTINCT FROM r.expected;

INSERT INTO t_di_failures
SELECT 'e PUBLIC can execute ' || f.sig
  FROM t_di_fns f JOIN pg_proc p ON p.oid = f.sig::regprocedure,
       aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
 WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE';

-- e. Nothing else changed in the bodies: every line of the live body is still
-- there, unchanged and in the same order (the migration only adds lines).
CREATE OR REPLACE FUNCTION pg_temp.lost_line(p_old text, p_new text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  o text[] := string_to_array(p_old, E'\n');
  n text[] := string_to_array(p_new, E'\n');
  i int;
  j int := 1;
BEGIN
  FOR i IN 1 .. coalesce(array_length(o, 1), 0) LOOP
    WHILE j <= array_length(n, 1) AND n[j] IS DISTINCT FROM o[i] LOOP
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

INSERT INTO t_di_failures
SELECT 'e a line of the live body was changed or lost in ' || o.sig || ': '
       || pg_temp.lost_line(o.src, (SELECT p.prosrc FROM pg_proc p WHERE p.oid = o.sig::regprocedure))
  FROM t_di_src_old o
 WHERE pg_temp.lost_line(o.src, (SELECT p.prosrc FROM pg_proc p WHERE p.oid = o.sig::regprocedure)) IS NOT NULL;

INSERT INTO t_di_failures
SELECT 'e the casas function changed: ' || o.sig
  FROM t_di_casas_old o
 WHERE o.md5 IS DISTINCT FROM (SELECT md5(pg_get_functiondef(o.sig::regprocedure)));

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_di_failures;

ROLLBACK;
