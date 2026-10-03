-- Identities of migration 20261003160000: the policies and the two campus
-- functions that compared a usuarios.id with the session id (auth.uid()) now
-- compare the internal person id, so the branches they wrote grant what their
-- text says, and nothing more.
--
-- Covers, as the admin, the general director, the director de etapa and the
-- leader (own session, role authenticated, both claim settings), and as anon:
--   a. SELECT visibility of every table whose policies change: the sorted ids
--      each identity sees, before and after the migration block. After must
--      contain before, and every id gained must be in the set the policy text
--      grants that person (computed as postgres from the roles, usuario_campus,
--      segmento_lideres and the pastoral mentor column). Admin and pastor must
--      see every row of the tables with an es_superadmin SELECT branch. anon
--      gets the same rows, or an error with the same SQLSTATE, before and after.
--   b. UPDATE reach (UPDATE ... SET id = id, inside a rolled-back
--      subtransaction) of every table with a changed UPDATE policy: admin and
--      pastor reach every row after; the others reach what they reached before,
--      except the pastoral rows where they are the mentor.
--   c. mis_campus_ids and mi_campus_principal with the own auth id: {} / NULL
--      before, the person's usuario_campus rows after; with somebody else's
--      auth id: {} / NULL before and after (the phase 2 guard).
--      es_superadmin(get_my_internal_id()), the query shape of the two app
--      calls, is true after exactly for admin and pastor; es_superadmin(auth.uid())
--      stays false for everyone.
--   d. Catalog: the same policies (name, table, command, roles, permissive)
--      before and after; no changed policy keeps an old comparison and each
--      calls get_my_internal_id(); the two functions keep their attributes and
--      ACL; get_my_internal_id and es_superadmin are untouched; md5 after.
--
-- Before the block, while the migration is not live, the admin must see 0 rows
-- of audit_grupo_miembros and mis_campus_ids must return {}: that is the RED.
-- On a run after the apply, before already equals after.
--
-- The migration is copied byte for byte between the two marker comments below.
--
-- Run against STAGING inside BEGIN...ROLLBACK: nothing here is kept. The last
-- statement returns the failing cases (kind 'failure', none expected), then
-- the summary rows.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_id_failures (case_name text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE t_id_who (who text PRIMARY KEY, auth_id uuid, uid uuid) ON COMMIT DROP;
CREATE TEMP TABLE t_id_tab (tab text PRIMARY KEY, upd boolean, admin_all boolean) ON COMMIT DROP;
CREATE TEMP TABLE t_id_vis (phase text, who text, tab text, val text) ON COMMIT DROP;
CREATE TEMP TABLE t_id_upd (phase text, who text, tab text, val text) ON COMMIT DROP;
CREATE TEMP TABLE t_id_fn (phase text, who text, probe text, val text) ON COMMIT DROP;
CREATE TEMP TABLE t_id_pol (phase text, tab text, pol text, cmd "char", roles text, permissive boolean, expr text) ON COMMIT DROP;
CREATE TEMP TABLE t_id_proc (phase text, fn text, attrs text, acl text, def_md5 text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_id_failures(case_name, detail) VALUES (p_case, p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.has_role(p_uid uuid, p_role text)
RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuario_roles ur
                   JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                  WHERE ur.usuario_id = p_uid AND rs.nombre_interno = p_role);
$$;

CREATE OR REPLACE FUNCTION pg_temp.applied()
RETURNS boolean LANGUAGE sql AS $$
  SELECT p.prosrc LIKE '%u.auth_id = p_auth_uid%' FROM pg_proc p
   WHERE p.oid = 'public.mis_campus_ids(uuid)'::regprocedure;
$$;

-- Identity simulation. Modes: user (sub + JSON claims, role authenticated,
-- runs as authenticated), anon (anon claims, runs as anon), nobody.
CREATE OR REPLACE FUNCTION pg_temp.set_session(p_mode text, p_auth uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true),
          set_config('request.jwt.claim.sub', '', true),
          set_config('request.jwt.claim.role', '', true);
  IF p_mode = 'user' THEN
    PERFORM set_config('request.jwt.claim.sub', coalesce(p_auth::text, ''), true),
            set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  ELSIF p_mode = 'anon' THEN
    PERFORM set_config('request.jwt.claim.role', 'anon', true),
            set_config('request.jwt.claims', '{"role":"anon"}', true);
  ELSIF p_mode <> 'nobody' THEN
    RAISE EXCEPTION 'unknown session mode %', p_mode;
  END IF;
END;
$$;

-- One probe in the given session, always inside a subtransaction that is
-- rolled back (so the UPDATE probes write nothing): the text value, or the
-- error.
CREATE OR REPLACE FUNCTION pg_temp.run(p_mode text, p_auth uuid, p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  PERFORM pg_temp.set_session(p_mode, p_auth);
  BEGIN
    IF p_mode = 'user' THEN
      SET LOCAL ROLE authenticated;
    ELSIF p_mode = 'anon' THEN
      SET LOCAL ROLE anon;
    END IF;
    EXECUTE p_sql INTO v USING p_auth;
    RAISE EXCEPTION USING ERRCODE = 'ZR001', MESSAGE = coalesce(v, 'NULL');
  EXCEPTION
    WHEN SQLSTATE 'ZR001' THEN v := SQLERRM;
    WHEN OTHERS THEN v := 'ERR ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.set_session('nobody', NULL);
  RETURN v;
END;
$$;

-- The ids a person may gain on a table by the text of its changed SELECT
-- policies, computed as postgres.
CREATE OR REPLACE FUNCTION pg_temp.gain(p_uid uuid, p_tab text)
RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE
  v_adm boolean := pg_temp.has_role(p_uid, 'admin') OR pg_temp.has_role(p_uid, 'pastor');
  v_sup boolean := v_adm OR pg_temp.has_role(p_uid, 'director-general');
  v_creacion boolean := EXISTS (SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                                 WHERE ur.usuario_id = p_uid
                                   AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa', 'lider'));
  v text[];
BEGIN
  IF p_tab = 'audit_grupo_miembros' THEN
    SELECT array_agg(a.id::text) INTO v FROM public.audit_grupo_miembros a
     WHERE v_adm OR a.grupo_id IN (SELECT g.id FROM public.grupos g
                                    WHERE g.campus_id IN (SELECT uc.campus_id FROM public.usuario_campus uc WHERE uc.usuario_id = p_uid));
  ELSIF p_tab IN ('configuracion_grupos_vida', 'director_general_segmentos') THEN
    EXECUTE format('SELECT array_agg(t.id::text) FROM public.%I t WHERE $1', p_tab) INTO v USING v_adm;
  ELSIF p_tab = 'director_general_directores' THEN
    SELECT array_agg(d.id::text) INTO v FROM public.director_general_directores d
     WHERE v_adm OR EXISTS (SELECT 1 FROM public.segmento_lideres sl
                             WHERE sl.id IN (d.director_general_id, d.director_etapa_id) AND sl.usuario_id = p_uid);
  ELSIF p_tab = 'usuario_campus' THEN
    SELECT array_agg(uc.id::text) INTO v FROM public.usuario_campus uc WHERE v_adm OR uc.usuario_id = p_uid;
  ELSIF p_tab = 'segmento_lideres' THEN
    SELECT array_agg(sl.id::text) INTO v FROM public.segmento_lideres sl
     WHERE v_sup OR sl.usuario_id = p_uid OR (sl.tipo_lider = 'director_etapa' AND v_creacion);
  ELSIF p_tab = 'usuarios' THEN
    SELECT array_agg(u.id::text) INTO v FROM public.usuarios u WHERE v_sup;
  ELSIF p_tab = 'pastoral_triada' THEN
    EXECUTE 'SELECT array_agg(t.id::text) FROM public.pastoral_triada t WHERE t.mentor_oficial_persona_id = $1' INTO v USING p_uid;
  END IF;
  RETURN coalesce(v, '{}');
END;
$$;

-- Rows a person may UPDATE after, computed as postgres: every row for admin
-- and pastor on the es_superadmin tables, the mentor's rows on the pastoral
-- tables, NULL (= unchanged) otherwise.
CREATE OR REPLACE FUNCTION pg_temp.upd_expected(p_uid uuid, p_tab text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v bigint;
BEGIN
  IF p_tab = 'pastoral_one_on_one' OR p_tab = 'pastoral_triada' THEN
    EXECUTE format('SELECT count(*) FROM public.%I t WHERE t.mentor_oficial_persona_id = $1', p_tab) INTO v USING p_uid;
  ELSIF p_tab = 'pastoral_triada_miembros' THEN
    EXECUTE 'SELECT count(*) FROM public.pastoral_triada_miembros m JOIN public.pastoral_triada t ON t.id = m.triada_id
              WHERE t.mentor_oficial_persona_id = $1' INTO v USING p_uid;
  ELSIF pg_temp.has_role(p_uid, 'admin') OR pg_temp.has_role(p_uid, 'pastor') THEN
    EXECUTE format('SELECT count(*) FROM public.%I', p_tab) INTO v;
  ELSE
    RETURN NULL;
  END IF;
  RETURN v::text;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.snap(p_phase text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  w record;
  t record;
  o record;
BEGIN
  FOR w IN SELECT * FROM t_id_who LOOP
    FOR t IN SELECT * FROM t_id_tab LOOP
      INSERT INTO t_id_vis VALUES (p_phase, w.who, t.tab,
        pg_temp.run(CASE WHEN w.who = 'anon' THEN 'anon' ELSE 'user' END, w.auth_id,
                    format('SELECT coalesce(array_agg(t.id::text ORDER BY t.id::text), ''{}'')::text FROM public.%I t', t.tab)));
      IF t.upd AND w.who <> 'anon' THEN
        INSERT INTO t_id_upd VALUES (p_phase, w.who, t.tab,
          pg_temp.run('user', w.auth_id, format('WITH u AS (UPDATE public.%I SET id = id RETURNING 1) SELECT count(*)::text FROM u', t.tab)));
      END IF;
    END LOOP;
    CONTINUE WHEN w.who = 'anon';
    SELECT * INTO o FROM t_id_who x WHERE x.who = CASE WHEN w.who = 'admin' THEN 'leader' ELSE 'admin' END;
    INSERT INTO t_id_fn VALUES
      (p_phase, w.who, 'mis_campus_ids own', pg_temp.run('user', w.auth_id,
         'SELECT (SELECT coalesce(array_agg(x ORDER BY x), ''{}'') FROM unnest(public.mis_campus_ids($1)) x)::text')),
      (p_phase, w.who, 'mi_campus_principal own', pg_temp.run('user', w.auth_id, 'SELECT public.mi_campus_principal($1)::text')),
      (p_phase, w.who, 'mis_campus_ids other', pg_temp.run('user', w.auth_id,
         format('SELECT public.mis_campus_ids(%L::uuid)::text', o.auth_id))),
      (p_phase, w.who, 'mi_campus_principal other', pg_temp.run('user', w.auth_id,
         format('SELECT public.mi_campus_principal(%L::uuid)::text', o.auth_id))),
      (p_phase, w.who, 'es_superadmin(get_my_internal_id())', pg_temp.run('user', w.auth_id,
         'SELECT public.es_superadmin(public.get_my_internal_id())::text')),
      (p_phase, w.who, 'es_superadmin(auth.uid())', pg_temp.run('user', w.auth_id, 'SELECT public.es_superadmin(auth.uid())::text'));
  END LOOP;

  INSERT INTO t_id_pol
  SELECT p_phase, c.relname, p.polname, p.polcmd,
         array_to_string(ARRAY(SELECT r.rolname FROM pg_roles r WHERE r.oid = ANY (p.polroles) ORDER BY 1), ','),
         p.polpermissive,
         coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' | ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relnamespace = 'public'::regnamespace;

  INSERT INTO t_id_proc
  SELECT p_phase, p.proname,
         concat_ws(' ', pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid), l.lanname,
                   p.provolatile, p.prosecdef, p.proowner::regrole, p.proconfig::text),
         p.proacl::text, md5(pg_get_functiondef(p.oid))
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.oid IN ('public.mis_campus_ids(uuid)'::regprocedure, 'public.mi_campus_principal(uuid)'::regprocedure,
                   'public.get_my_internal_id()'::regprocedure, 'public.es_superadmin(uuid)'::regprocedure);
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ---------------------------------------------------------------------------
-- Setup
-- ---------------------------------------------------------------------------

INSERT INTO t_id_who
SELECT 'admin', u.auth_id, u.id FROM public.usuarios u WHERE '5df3b990-af3d-49b5-a061-025bc3598983'::uuid = u.auth_id
UNION ALL
SELECT 'dg', u.auth_id, u.id FROM public.usuarios u WHERE '9f23ae7c-7008-4bd6-b449-89c326f8d1af'::uuid = u.auth_id
UNION ALL
SELECT 'de', u.auth_id, u.id FROM public.usuarios u WHERE 'ee0efdea-2d85-479a-88ab-85720903aa2a'::uuid = u.auth_id
UNION ALL
SELECT 'leader', u.auth_id, u.id FROM public.usuarios u WHERE '2efa6e21-bbf0-4fb3-a8fa-96e16b3e881d'::uuid = u.auth_id
UNION ALL
SELECT 'anon', NULL, NULL;

SELECT pg_temp.fail('setup', 'person not found: ' || w.who)
  FROM (VALUES ('admin'), ('dg'), ('de'), ('leader')) w(who)
 WHERE NOT EXISTS (SELECT 1 FROM t_id_who x WHERE x.who = w.who);

SELECT pg_temp.fail('setup', format('%s lacks role %s', w.who, e.rol))
  FROM t_id_who w JOIN (VALUES ('admin', 'admin'), ('dg', 'director-general'), ('de', 'director-etapa'), ('leader', 'lider')) e(who, rol)
    ON e.who = w.who
 WHERE NOT pg_temp.has_role(w.uid, e.rol);

INSERT INTO t_id_tab
SELECT v.tab, v.upd, v.admin_all
  FROM (VALUES ('audit_grupo_miembros', false, true), ('campus', true, false), ('campus_localidades', true, false),
               ('configuracion_grupos_vida', true, true), ('director_general_directores', true, true),
               ('director_general_segmentos', true, true), ('tipos_grupo', true, false), ('usuario_campus', true, true),
               ('segmento_lideres', false, true), ('usuarios', false, true),
               ('pastoral_one_on_one', true, false), ('pastoral_triada', true, false),
               ('pastoral_triada_miembros', true, false)) v(tab, upd, admin_all)
 WHERE to_regclass('public.' || v.tab) IS NOT NULL;

CREATE TEMP TABLE t_id_ctx ON COMMIT DROP AS SELECT pg_temp.applied() AS applied_before;

SELECT pg_temp.snap('old');

-- ---------------------------------------------------------------------------
-- >>> MIGRATION 20261003160000_identidades_en_politicas.sql (verbatim) >>>
-- Compare the internal person id where policies and two functions compared
-- it with the session id (security phase 3, batch L5).
--
-- usuarios.id (the internal person id) and usuarios.auth_id (auth.uid(), the
-- session id) differ on every real row. The expressions below compared a
-- column or argument that holds usuarios.id with auth.uid(), so they were
-- always false: admins saw no audit_grupo_miembros rows through RLS and the
-- campus and director branches denied everyone. This batch changes behaviour
-- on purpose: those branches now grant what their text says. Nothing else in
-- any expression changes; every policy keeps its name, command, roles and
-- permissiveness.
--
--   es_superadmin(auth.uid())  ->  es_superadmin(( SELECT get_my_internal_id()))
--     es_superadmin takes usuarios.id and, since phase 2 batch L2, answers
--     only about the session person. get_my_internal_id() is SECURITY
--     DEFINER, search_path public, executable by authenticated and
--     service_role (not anon or PUBLIC, the same as es_superadmin) and
--     returns the usuarios.id of auth.uid(). The subselect makes it one
--     initplan per statement.
--   <column holding usuarios.id> = auth.uid()  ->  ... = ( SELECT get_my_internal_id())
--     Columns checked: usuario_roles.usuario_id, segmento_lideres.usuario_id
--     and usuario_campus.usuario_id reference usuarios(id) by foreign key;
--     pastoral_triada.mentor_oficial_persona_id and
--     pastoral_one_on_one.mentor_oficial_persona_id have no foreign key, but
--     every row joins usuarios.id (none joins auth_id) and the sibling
--     *_select_mentor policies compare them with usuarios.id. A helper
--     function, not a subselect on usuarios, because the usuarios policy
--     itself is one of them and a subselect there would recurse.
--   mis_campus_ids(p_auth_uid), mi_campus_principal(p_auth_uid)
--     The argument is the session id (the phase 2 guard pins it to
--     auth.uid()), but usuario_campus.usuario_id holds usuarios.id, so they
--     returned {} / NULL for everyone. They now resolve the person of
--     p_auth_uid first. Signature, language sql, STABLE, SECURITY DEFINER,
--     search_path and the guard are unchanged.
--
-- anon cannot execute get_my_internal_id, so a policy that applies to anon
-- and now calls it raises 42501 for anon. Every such policy already called
-- es_superadmin or read usuario_roles (anon has neither), so anon already got
-- 42501 on those tables and commands; the suite checks it.
--
-- The pastoral tables exist on staging only, so their policies are replaced
-- inside to_regclass guards.
--
-- Original expressions (rollback = recreate each with these):
--   audit_grupo_miembros.audit_campus_superadmin_read  SELECT  TO public
--     USING (es_superadmin(auth.uid()) OR (grupo_id IN ( SELECT grupos.id FROM grupos
--            WHERE (grupos.campus_id = ANY (mis_campus_ids(auth.uid()))))))
--   campus.campus_delete_superadmin  DELETE  TO authenticated  USING (es_superadmin(auth.uid()))
--   campus.campus_insert_superadmin  INSERT  TO authenticated  WITH CHECK (es_superadmin(auth.uid()))
--   campus.campus_update_superadmin  UPDATE  TO authenticated  USING (es_superadmin(auth.uid()))
--   campus_localidades.campus_localidades_delete_superadmin  DELETE  TO authenticated  USING (es_superadmin(auth.uid()))
--   campus_localidades.campus_localidades_insert_superadmin  INSERT  TO authenticated  WITH CHECK (es_superadmin(auth.uid()))
--   campus_localidades.campus_localidades_update_superadmin  UPDATE  TO authenticated  USING (es_superadmin(auth.uid()))
--   configuracion_grupos_vida.config_admin  ALL  TO public  USING (es_superadmin(( SELECT auth.uid() AS uid)))
--   director_general_directores.dg_directores_delete_superadmin  DELETE  TO authenticated  USING (es_superadmin(auth.uid()))
--   director_general_directores.dg_directores_insert_superadmin  INSERT  TO authenticated  WITH CHECK (es_superadmin(auth.uid()))
--   director_general_directores.dg_directores_update_superadmin  UPDATE  TO authenticated  USING (es_superadmin(auth.uid()))
--   director_general_directores.dg_directores_select  SELECT  TO authenticated
--     USING (es_superadmin(auth.uid())
--            OR (EXISTS ( SELECT 1 FROM segmento_lideres sl
--                 WHERE ((sl.id = director_general_directores.director_general_id) AND (sl.usuario_id = auth.uid()))))
--            OR (EXISTS ( SELECT 1 FROM segmento_lideres sl
--                 WHERE ((sl.id = director_general_directores.director_etapa_id) AND (sl.usuario_id = auth.uid())))))
--   director_general_segmentos.dg_segmentos_admin_pastor  ALL  TO public
--     USING (es_superadmin(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
--            FROM ((usuarios u JOIN usuario_roles ur ON ((ur.usuario_id = u.id)))
--                  JOIN roles_sistema rs ON ((rs.id = ur.rol_id)))
--            WHERE ((u.auth_id = ( SELECT auth.uid() AS uid)) AND (rs.nombre_interno = 'pastor'::text)))))
--   segmento_lideres.segmento_lideres_select_directores_creacion  SELECT  TO public
--     USING ((tipo_lider = 'director_etapa'::enum_tipo_lider) AND ((usuario_id = auth.uid()) OR (EXISTS ( SELECT 1
--            FROM (usuario_roles ur JOIN roles_sistema rs ON ((rs.id = ur.rol_id)))
--            WHERE ((ur.usuario_id = auth.uid()) AND (rs.nombre_interno = ANY (ARRAY['admin'::text, 'pastor'::text,
--                   'director-general'::text, 'director-etapa'::text, 'lider'::text])))))))
--   segmento_lideres.segmento_lideres_select_roles_superiores  SELECT  TO public
--     USING (EXISTS ( SELECT 1 FROM (usuario_roles ur JOIN roles_sistema rs ON ((rs.id = ur.rol_id)))
--            WHERE ((ur.usuario_id = auth.uid()) AND (rs.nombre_interno = ANY (ARRAY['admin'::text, 'pastor'::text,
--                   'director-general'::text])))))
--   segmento_lideres.segmento_lideres_select_self  SELECT  TO public  USING (usuario_id = auth.uid())
--   tipos_grupo.tipos_grupo_admin_insert  INSERT  TO public  WITH CHECK (es_superadmin(( SELECT auth.uid() AS uid)))
--   tipos_grupo.tipos_grupo_admin_update  UPDATE  TO public  USING (es_superadmin(( SELECT auth.uid() AS uid)))
--   usuario_campus.usuario_campus_delete_superadmin  DELETE  TO authenticated  USING (es_superadmin(auth.uid()))
--   usuario_campus.usuario_campus_insert_superadmin  INSERT  TO authenticated  WITH CHECK (es_superadmin(auth.uid()))
--   usuario_campus.usuario_campus_update_superadmin  UPDATE  TO authenticated  USING (es_superadmin(auth.uid()))
--   usuario_campus.usuario_campus_select  SELECT  TO authenticated
--     USING ((usuario_id = auth.uid()) OR es_superadmin(auth.uid()))
--   usuarios.usuarios_can_view_profile_photos  SELECT  TO public
--     USING ((auth.uid() = auth_id) OR (EXISTS ( SELECT 1
--            FROM (usuario_roles ur JOIN roles_sistema rs ON ((ur.rol_id = rs.id)))
--            WHERE ((ur.usuario_id = auth.uid()) AND (rs.nombre_interno = ANY (ARRAY['admin'::text, 'pastor'::text,
--                   'director-general'::text]))))))
--   pastoral_one_on_one.pastoral_one_on_one_update_mentor  UPDATE  TO public
--     USING (mentor_oficial_persona_id = auth.uid())  WITH CHECK (mentor_oficial_persona_id = auth.uid())
--   pastoral_triada.pastoral_triada_delete_mentor  DELETE  TO public  USING (mentor_oficial_persona_id = auth.uid())
--   pastoral_triada.pastoral_triada_select_miembro  SELECT  TO public
--     USING ((mentor_oficial_persona_id = auth.uid()) OR auth_user_is_pastoral_actor_for_triada(id)
--            OR auth_has_pastoral_capability('pastoral.read.all'::text))
--   pastoral_triada.pastoral_triada_update_mentor  UPDATE  TO public
--     USING (mentor_oficial_persona_id = auth.uid())  WITH CHECK (mentor_oficial_persona_id = auth.uid())
--   pastoral_triada_miembros.pastoral_triada_miembros_delete  DELETE  TO public
--     USING (EXISTS ( SELECT 1 FROM pastoral_triada t
--            WHERE ((t.id = pastoral_triada_miembros.triada_id) AND (t.mentor_oficial_persona_id = auth.uid()))))
--   pastoral_triada_miembros.pastoral_triada_miembros_update  UPDATE  TO public
--     USING (EXISTS ( SELECT 1 FROM pastoral_triada t
--            WHERE ((t.id = pastoral_triada_miembros.triada_id) AND (t.mentor_oficial_persona_id = auth.uid()))))
--   Functions: the bodies below with "WHERE uc.usuario_id = p_auth_uid".

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

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
  -- usuario_campus.usuario_id holds usuarios.id; p_auth_uid is the session id.
  WHERE uc.usuario_id = (SELECT u.id FROM usuarios u WHERE u.auth_id = p_auth_uid)
    -- The caller is the person in the session; only service_role may act for
    -- somebody else.
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND p_auth_uid IS NOT DISTINCT FROM auth.uid())
    );
$function$;

CREATE OR REPLACE FUNCTION public.mi_campus_principal(p_auth_uid uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT uc.campus_id
  FROM usuario_campus uc
  -- usuario_campus.usuario_id holds usuarios.id; p_auth_uid is the session id.
  WHERE uc.usuario_id = (SELECT u.id FROM usuarios u WHERE u.auth_id = p_auth_uid)
    AND uc.es_campus_principal = true
    -- The caller is the person in the session; only service_role may act for
    -- somebody else.
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND p_auth_uid IS NOT DISTINCT FROM auth.uid())
    )
  LIMIT 1;
$function$;

-- Grants as before: authenticated and service_role, not anon or PUBLIC.
REVOKE ALL ON FUNCTION public.mis_campus_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mi_campus_principal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mis_campus_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mi_campus_principal(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- es_superadmin(<session id>) -> es_superadmin(<internal id>)
-- ---------------------------------------------------------------------------

DROP POLICY audit_campus_superadmin_read ON public.audit_grupo_miembros;
CREATE POLICY audit_campus_superadmin_read ON public.audit_grupo_miembros
  FOR SELECT TO public
  USING (es_superadmin(( SELECT get_my_internal_id())) OR (grupo_id IN ( SELECT grupos.id FROM grupos
         WHERE (grupos.campus_id = ANY (mis_campus_ids(auth.uid()))))));

DROP POLICY campus_delete_superadmin ON public.campus;
CREATE POLICY campus_delete_superadmin ON public.campus
  FOR DELETE TO authenticated USING (es_superadmin(( SELECT get_my_internal_id())));
DROP POLICY campus_insert_superadmin ON public.campus;
CREATE POLICY campus_insert_superadmin ON public.campus
  FOR INSERT TO authenticated WITH CHECK (es_superadmin(( SELECT get_my_internal_id())));
DROP POLICY campus_update_superadmin ON public.campus;
CREATE POLICY campus_update_superadmin ON public.campus
  FOR UPDATE TO authenticated USING (es_superadmin(( SELECT get_my_internal_id())));

DROP POLICY campus_localidades_delete_superadmin ON public.campus_localidades;
CREATE POLICY campus_localidades_delete_superadmin ON public.campus_localidades
  FOR DELETE TO authenticated USING (es_superadmin(( SELECT get_my_internal_id())));
DROP POLICY campus_localidades_insert_superadmin ON public.campus_localidades;
CREATE POLICY campus_localidades_insert_superadmin ON public.campus_localidades
  FOR INSERT TO authenticated WITH CHECK (es_superadmin(( SELECT get_my_internal_id())));
DROP POLICY campus_localidades_update_superadmin ON public.campus_localidades;
CREATE POLICY campus_localidades_update_superadmin ON public.campus_localidades
  FOR UPDATE TO authenticated USING (es_superadmin(( SELECT get_my_internal_id())));

DROP POLICY config_admin ON public.configuracion_grupos_vida;
CREATE POLICY config_admin ON public.configuracion_grupos_vida
  FOR ALL TO public USING (es_superadmin(( SELECT get_my_internal_id())));

DROP POLICY dg_directores_delete_superadmin ON public.director_general_directores;
CREATE POLICY dg_directores_delete_superadmin ON public.director_general_directores
  FOR DELETE TO authenticated USING (es_superadmin(( SELECT get_my_internal_id())));
DROP POLICY dg_directores_insert_superadmin ON public.director_general_directores;
CREATE POLICY dg_directores_insert_superadmin ON public.director_general_directores
  FOR INSERT TO authenticated WITH CHECK (es_superadmin(( SELECT get_my_internal_id())));
DROP POLICY dg_directores_update_superadmin ON public.director_general_directores;
CREATE POLICY dg_directores_update_superadmin ON public.director_general_directores
  FOR UPDATE TO authenticated USING (es_superadmin(( SELECT get_my_internal_id())));
DROP POLICY dg_directores_select ON public.director_general_directores;
CREATE POLICY dg_directores_select ON public.director_general_directores
  FOR SELECT TO authenticated
  USING (es_superadmin(( SELECT get_my_internal_id()))
         OR (EXISTS ( SELECT 1 FROM segmento_lideres sl
              WHERE ((sl.id = director_general_directores.director_general_id) AND (sl.usuario_id = ( SELECT get_my_internal_id())))))
         OR (EXISTS ( SELECT 1 FROM segmento_lideres sl
              WHERE ((sl.id = director_general_directores.director_etapa_id) AND (sl.usuario_id = ( SELECT get_my_internal_id()))))));

DROP POLICY dg_segmentos_admin_pastor ON public.director_general_segmentos;
CREATE POLICY dg_segmentos_admin_pastor ON public.director_general_segmentos
  FOR ALL TO public
  USING (es_superadmin(( SELECT get_my_internal_id())) OR (EXISTS ( SELECT 1
         FROM ((usuarios u JOIN usuario_roles ur ON ((ur.usuario_id = u.id)))
               JOIN roles_sistema rs ON ((rs.id = ur.rol_id)))
         WHERE ((u.auth_id = ( SELECT auth.uid() AS uid)) AND (rs.nombre_interno = 'pastor'::text)))));

DROP POLICY tipos_grupo_admin_insert ON public.tipos_grupo;
CREATE POLICY tipos_grupo_admin_insert ON public.tipos_grupo
  FOR INSERT TO public WITH CHECK (es_superadmin(( SELECT get_my_internal_id())));
DROP POLICY tipos_grupo_admin_update ON public.tipos_grupo;
CREATE POLICY tipos_grupo_admin_update ON public.tipos_grupo
  FOR UPDATE TO public USING (es_superadmin(( SELECT get_my_internal_id())));

DROP POLICY usuario_campus_delete_superadmin ON public.usuario_campus;
CREATE POLICY usuario_campus_delete_superadmin ON public.usuario_campus
  FOR DELETE TO authenticated USING (es_superadmin(( SELECT get_my_internal_id())));
DROP POLICY usuario_campus_insert_superadmin ON public.usuario_campus;
CREATE POLICY usuario_campus_insert_superadmin ON public.usuario_campus
  FOR INSERT TO authenticated WITH CHECK (es_superadmin(( SELECT get_my_internal_id())));
DROP POLICY usuario_campus_update_superadmin ON public.usuario_campus;
CREATE POLICY usuario_campus_update_superadmin ON public.usuario_campus
  FOR UPDATE TO authenticated USING (es_superadmin(( SELECT get_my_internal_id())));
DROP POLICY usuario_campus_select ON public.usuario_campus;
CREATE POLICY usuario_campus_select ON public.usuario_campus
  FOR SELECT TO authenticated
  USING ((usuario_id = ( SELECT get_my_internal_id())) OR es_superadmin(( SELECT get_my_internal_id())));

-- ---------------------------------------------------------------------------
-- <usuarios.id column> = auth.uid() -> = get_my_internal_id()
-- ---------------------------------------------------------------------------

DROP POLICY segmento_lideres_select_directores_creacion ON public.segmento_lideres;
CREATE POLICY segmento_lideres_select_directores_creacion ON public.segmento_lideres
  FOR SELECT TO public
  USING ((tipo_lider = 'director_etapa'::enum_tipo_lider) AND ((usuario_id = ( SELECT get_my_internal_id())) OR (EXISTS ( SELECT 1
         FROM (usuario_roles ur JOIN roles_sistema rs ON ((rs.id = ur.rol_id)))
         WHERE ((ur.usuario_id = ( SELECT get_my_internal_id())) AND (rs.nombre_interno = ANY (ARRAY['admin'::text, 'pastor'::text,
                'director-general'::text, 'director-etapa'::text, 'lider'::text])))))));
DROP POLICY segmento_lideres_select_roles_superiores ON public.segmento_lideres;
CREATE POLICY segmento_lideres_select_roles_superiores ON public.segmento_lideres
  FOR SELECT TO public
  USING (EXISTS ( SELECT 1 FROM (usuario_roles ur JOIN roles_sistema rs ON ((rs.id = ur.rol_id)))
         WHERE ((ur.usuario_id = ( SELECT get_my_internal_id())) AND (rs.nombre_interno = ANY (ARRAY['admin'::text, 'pastor'::text,
                'director-general'::text])))));
DROP POLICY segmento_lideres_select_self ON public.segmento_lideres;
CREATE POLICY segmento_lideres_select_self ON public.segmento_lideres
  FOR SELECT TO public USING (usuario_id = ( SELECT get_my_internal_id()));

DROP POLICY usuarios_can_view_profile_photos ON public.usuarios;
CREATE POLICY usuarios_can_view_profile_photos ON public.usuarios
  FOR SELECT TO public
  USING ((auth.uid() = auth_id) OR (EXISTS ( SELECT 1
         FROM (usuario_roles ur JOIN roles_sistema rs ON ((ur.rol_id = rs.id)))
         WHERE ((ur.usuario_id = ( SELECT get_my_internal_id())) AND (rs.nombre_interno = ANY (ARRAY['admin'::text, 'pastor'::text,
                'director-general'::text]))))));

DO $pastoral$
BEGIN
  IF to_regclass('public.pastoral_one_on_one') IS NOT NULL THEN
    EXECUTE $p$DROP POLICY pastoral_one_on_one_update_mentor ON public.pastoral_one_on_one$p$;
    EXECUTE $p$CREATE POLICY pastoral_one_on_one_update_mentor ON public.pastoral_one_on_one
      FOR UPDATE TO public
      USING (mentor_oficial_persona_id = ( SELECT get_my_internal_id()))
      WITH CHECK (mentor_oficial_persona_id = ( SELECT get_my_internal_id()))$p$;
  END IF;

  IF to_regclass('public.pastoral_triada') IS NOT NULL THEN
    EXECUTE $p$DROP POLICY pastoral_triada_delete_mentor ON public.pastoral_triada$p$;
    EXECUTE $p$CREATE POLICY pastoral_triada_delete_mentor ON public.pastoral_triada
      FOR DELETE TO public USING (mentor_oficial_persona_id = ( SELECT get_my_internal_id()))$p$;
    EXECUTE $p$DROP POLICY pastoral_triada_select_miembro ON public.pastoral_triada$p$;
    EXECUTE $p$CREATE POLICY pastoral_triada_select_miembro ON public.pastoral_triada
      FOR SELECT TO public
      USING ((mentor_oficial_persona_id = ( SELECT get_my_internal_id())) OR auth_user_is_pastoral_actor_for_triada(id)
             OR auth_has_pastoral_capability('pastoral.read.all'::text))$p$;
    EXECUTE $p$DROP POLICY pastoral_triada_update_mentor ON public.pastoral_triada$p$;
    EXECUTE $p$CREATE POLICY pastoral_triada_update_mentor ON public.pastoral_triada
      FOR UPDATE TO public
      USING (mentor_oficial_persona_id = ( SELECT get_my_internal_id()))
      WITH CHECK (mentor_oficial_persona_id = ( SELECT get_my_internal_id()))$p$;
  END IF;

  IF to_regclass('public.pastoral_triada_miembros') IS NOT NULL THEN
    EXECUTE $p$DROP POLICY pastoral_triada_miembros_delete ON public.pastoral_triada_miembros$p$;
    EXECUTE $p$CREATE POLICY pastoral_triada_miembros_delete ON public.pastoral_triada_miembros
      FOR DELETE TO public
      USING (EXISTS ( SELECT 1 FROM pastoral_triada t
             WHERE ((t.id = pastoral_triada_miembros.triada_id) AND (t.mentor_oficial_persona_id = ( SELECT get_my_internal_id())))))$p$;
    EXECUTE $p$DROP POLICY pastoral_triada_miembros_update ON public.pastoral_triada_miembros$p$;
    EXECUTE $p$CREATE POLICY pastoral_triada_miembros_update ON public.pastoral_triada_miembros
      FOR UPDATE TO public
      USING (EXISTS ( SELECT 1 FROM pastoral_triada t
             WHERE ((t.id = pastoral_triada_miembros.triada_id) AND (t.mentor_oficial_persona_id = ( SELECT get_my_internal_id())))))$p$;
  END IF;
END
$pastoral$;
-- <<< MIGRATION <<<
-- ---------------------------------------------------------------------------

SELECT pg_temp.snap('new');

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

SELECT pg_temp.fail('setup', 'the migration did not take effect') WHERE NOT pg_temp.applied();

-- a. Visibility.
CREATE TEMP TABLE t_id_vcmp ON COMMIT DROP AS
SELECT w.who, w.uid, t.tab, t.admin_all, o.val AS old, n.val AS new,
       CASE WHEN o.val LIKE 'ERR%' THEN NULL ELSE o.val::text[] END AS o_ids,
       CASE WHEN n.val LIKE 'ERR%' THEN NULL ELSE n.val::text[] END AS n_ids,
       CASE WHEN w.who = 'anon' THEN '{}'::text[] ELSE pg_temp.gain(w.uid, t.tab) END AS g_ids
  FROM t_id_who w CROSS JOIN t_id_tab t
  JOIN t_id_vis o ON o.phase = 'old' AND o.who = w.who AND o.tab = t.tab
  JOIN t_id_vis n ON n.phase = 'new' AND n.who = w.who AND n.tab = t.tab;

-- An error must stay an error with the same SQLSTATE (anon's 42501 now names
-- get_my_internal_id where it named es_superadmin).
SELECT pg_temp.fail('a ' || who || ' ' || tab, format('error changed: before %s; after %s', left(old, 90), left(new, 90)))
  FROM t_id_vcmp
 WHERE (old LIKE 'ERR%' OR new LIKE 'ERR%') AND left(old, 9) IS DISTINCT FROM left(new, 9);

SELECT pg_temp.fail('a ' || who || ' ' || tab, format('lost %s rows', cardinality(o_ids) - cardinality(ARRAY(SELECT unnest(o_ids) INTERSECT SELECT unnest(n_ids)))))
  FROM t_id_vcmp WHERE o_ids IS NOT NULL AND n_ids IS NOT NULL AND NOT n_ids @> o_ids;

SELECT pg_temp.fail('a ' || who || ' ' || tab,
                    format('gained %s rows the policy text does not grant',
                           cardinality(ARRAY(SELECT unnest(n_ids) EXCEPT SELECT unnest(o_ids) EXCEPT SELECT unnest(g_ids)))))
  FROM t_id_vcmp
 WHERE o_ids IS NOT NULL AND n_ids IS NOT NULL
   AND cardinality(ARRAY(SELECT unnest(n_ids) EXCEPT SELECT unnest(o_ids) EXCEPT SELECT unnest(g_ids))) > 0;

SELECT pg_temp.fail('a ' || who || ' ' || tab, format('admin sees %s of %s rows after', cardinality(n_ids), cardinality(g_ids)))
  FROM t_id_vcmp
 WHERE admin_all AND (pg_temp.has_role(uid, 'admin') OR pg_temp.has_role(uid, 'pastor'))
   AND (n_ids IS NULL OR NOT n_ids @> g_ids);

SELECT pg_temp.fail('a RED', format('admin saw %s audit_grupo_miembros rows before the block', cardinality(o_ids)))
  FROM t_id_vcmp, t_id_ctx
 WHERE NOT applied_before AND who = 'admin' AND tab = 'audit_grupo_miembros' AND cardinality(o_ids) <> 0;

-- b. UPDATE reach.
CREATE TEMP TABLE t_id_ucmp ON COMMIT DROP AS
SELECT w.who, t.tab, o.val AS old, n.val AS new, pg_temp.upd_expected(w.uid, t.tab) AS expected
  FROM t_id_who w CROSS JOIN t_id_tab t
  JOIN t_id_upd o ON o.phase = 'old' AND o.who = w.who AND o.tab = t.tab
  JOIN t_id_upd n ON n.phase = 'new' AND n.who = w.who AND n.tab = t.tab;

SELECT pg_temp.fail('b ' || who || ' ' || tab, format('before %s, after %s, expected %s', old, new, coalesce(expected, 'unchanged')))
  FROM t_id_ucmp
 WHERE new IS DISTINCT FROM coalesce(expected, old);

-- c. Functions.
CREATE TEMP TABLE t_id_fcmp ON COMMIT DROP AS
SELECT f.who, f.probe, o.val AS old, f.val AS new,
       CASE f.probe
         WHEN 'mis_campus_ids own' THEN (SELECT coalesce(array_agg(uc.campus_id ORDER BY uc.campus_id), '{}')::text
                                           FROM public.usuario_campus uc WHERE uc.usuario_id = w.uid)
         WHEN 'mi_campus_principal own' THEN coalesce((SELECT uc.campus_id::text FROM public.usuario_campus uc
                                                         WHERE uc.usuario_id = w.uid AND uc.es_campus_principal LIMIT 1), 'NULL')
         WHEN 'mis_campus_ids other' THEN '{}'
         WHEN 'mi_campus_principal other' THEN 'NULL'
         WHEN 'es_superadmin(get_my_internal_id())' THEN (pg_temp.has_role(w.uid, 'admin') OR pg_temp.has_role(w.uid, 'pastor'))::text
         WHEN 'es_superadmin(auth.uid())' THEN 'false'
       END AS expected,
       CASE f.probe
         WHEN 'mis_campus_ids own' THEN '{}'
         WHEN 'mi_campus_principal own' THEN 'NULL'
       END AS expected_red
  FROM t_id_fn f JOIN t_id_who w USING (who)
  JOIN t_id_fn o ON o.phase = 'old' AND o.who = f.who AND o.probe = f.probe
 WHERE f.phase = 'new';

SELECT pg_temp.fail('c ' || who || ' ' || probe, format('after %s, expected %s', new, expected))
  FROM t_id_fcmp WHERE new IS DISTINCT FROM expected;

SELECT pg_temp.fail('c ' || who || ' ' || probe, format('before %s, expected %s', old, coalesce(expected_red, expected)))
  FROM t_id_fcmp, t_id_ctx
 -- es_superadmin(get_my_internal_id()), the shape the app calls switch to,
 -- already answered right before the block.
 WHERE old IS DISTINCT FROM CASE WHEN applied_before OR expected_red IS NULL THEN expected ELSE expected_red END;

-- d. Catalog.
SELECT pg_temp.fail('d policies', format('%s %s %s', x.phase, x.tab, x.pol))
  FROM ((SELECT 'only before' AS phase, tab, pol, cmd, roles, permissive FROM t_id_pol WHERE phase = 'old'
         EXCEPT SELECT 'only before', tab, pol, cmd, roles, permissive FROM t_id_pol WHERE phase = 'new')
        UNION ALL
        (SELECT 'only after', tab, pol, cmd, roles, permissive FROM t_id_pol WHERE phase = 'new'
         EXCEPT SELECT 'only after', tab, pol, cmd, roles, permissive FROM t_id_pol WHERE phase = 'old')) x;

CREATE TEMP TABLE t_id_changed ON COMMIT DROP AS
SELECT n.tab, n.pol, n.expr, o.expr AS old_expr
  FROM t_id_pol n JOIN t_id_pol o ON o.phase = 'old' AND o.tab = n.tab AND o.pol = n.pol
 WHERE n.phase = 'new'
   AND n.pol IN ('audit_campus_superadmin_read', 'campus_delete_superadmin', 'campus_insert_superadmin', 'campus_update_superadmin',
                 'campus_localidades_delete_superadmin', 'campus_localidades_insert_superadmin', 'campus_localidades_update_superadmin',
                 'config_admin', 'dg_directores_delete_superadmin', 'dg_directores_insert_superadmin', 'dg_directores_update_superadmin',
                 'dg_directores_select', 'dg_segmentos_admin_pastor', 'tipos_grupo_admin_insert', 'tipos_grupo_admin_update',
                 'usuario_campus_delete_superadmin', 'usuario_campus_insert_superadmin', 'usuario_campus_update_superadmin',
                 'usuario_campus_select', 'segmento_lideres_select_directores_creacion', 'segmento_lideres_select_roles_superiores',
                 'segmento_lideres_select_self', 'usuarios_can_view_profile_photos', 'pastoral_one_on_one_update_mentor',
                 'pastoral_triada_delete_mentor', 'pastoral_triada_select_miembro', 'pastoral_triada_update_mentor',
                 'pastoral_triada_miembros_delete', 'pastoral_triada_miembros_update');

SELECT pg_temp.fail('d expr ' || pol, left(expr, 160))
  FROM t_id_changed
 WHERE expr ~ '(es_superadmin\(\s*\(?\s*(SELECT )?auth\.uid|usuario_id = \(?\s*(SELECT )?auth\.uid|persona_id = \(?\s*(SELECT )?auth\.uid)'
    OR expr NOT LIKE '%get_my_internal_id()%';

SELECT pg_temp.fail('d expr count', format('%s changed policies found, expected %s', count(*),
                    23 + 6 * (SELECT count(*) FILTER (WHERE tab LIKE 'pastoral%') FROM t_id_tab) / 3))
  FROM t_id_changed
HAVING count(*) <> 23 + 6 * (SELECT count(*) FILTER (WHERE tab LIKE 'pastoral%') FROM t_id_tab) / 3;

SELECT pg_temp.fail('d other policies', format('%s.%s changed', n.tab, n.pol))
  FROM t_id_pol n JOIN t_id_pol o ON o.phase = 'old' AND o.tab = n.tab AND o.pol = n.pol
 WHERE n.phase = 'new' AND n.expr <> o.expr
   AND NOT EXISTS (SELECT 1 FROM t_id_changed c WHERE c.tab = n.tab AND c.pol = n.pol);

SELECT pg_temp.fail('d function ' || n.fn, format('attrs %s -> %s; acl %s -> %s', o.attrs, n.attrs, o.acl, n.acl))
  FROM t_id_proc n JOIN t_id_proc o ON o.phase = 'old' AND o.fn = n.fn
 WHERE n.phase = 'new' AND (n.attrs <> o.attrs OR n.acl IS DISTINCT FROM o.acl
                            OR (n.fn IN ('get_my_internal_id', 'es_superadmin') AND n.def_md5 <> o.def_md5));

SELECT pg_temp.fail('d grants ' || f, 'anon or PUBLIC can execute, or authenticated/service_role cannot')
  FROM (VALUES ('public.mis_campus_ids(uuid)'), ('public.mi_campus_principal(uuid)')) v(f)
 WHERE has_function_privilege('anon', f, 'EXECUTE')
    OR NOT has_function_privilege('authenticated', f, 'EXECUTE')
    OR NOT has_function_privilege('service_role', f, 'EXECUTE')
    OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = f::regprocedure AND a.grantee = 0);

-- ---------------------------------------------------------------------------
-- Result: failures first, then the summary.
-- ---------------------------------------------------------------------------

SELECT kind, name, detail FROM (
        SELECT 0 AS ord, 'failure' AS kind, case_name AS name, detail
          FROM (SELECT f.*, row_number() OVER (PARTITION BY case_name ORDER BY detail) AS rn FROM t_id_failures f) f
         WHERE rn <= 5
        UNION ALL
        SELECT 1, 'summary', 'failures', count(*)::text FROM t_id_failures
        UNION ALL
        SELECT 2, 'summary', 'applied before the block', applied_before::text FROM t_id_ctx
        UNION ALL
        SELECT 3, 'visibility', who,
               string_agg(format('%s %s->%s', tab,
                                 CASE WHEN o_ids IS NULL THEN 'ERR' ELSE cardinality(o_ids)::text END,
                                 CASE WHEN n_ids IS NULL THEN 'ERR' ELSE cardinality(n_ids)::text || ':' || left(md5(n_ids::text), 8) END),
                          ', ' ORDER BY tab)
          FROM t_id_vcmp GROUP BY who
        UNION ALL
        SELECT 4, 'update', who,
               string_agg(format('%s %s->%s', tab, CASE WHEN old LIKE 'ERR%' THEN 'ERR' ELSE old END,
                                 CASE WHEN new LIKE 'ERR%' THEN 'ERR' ELSE new END), ', ' ORDER BY tab)
          FROM t_id_ucmp GROUP BY who
        UNION ALL
        SELECT 5, 'function', who, string_agg(format('%s: %s -> %s', probe, left(old, 40), left(new, 40)), '; ' ORDER BY probe)
          FROM t_id_fcmp GROUP BY who
        UNION ALL
        SELECT 6, 'summary', 'md5(pg_get_functiondef) after the block',
               string_agg(fn || ' ' || def_md5, ', ' ORDER BY fn) FROM t_id_proc WHERE phase = 'new'
        UNION ALL
        SELECT 7, 'summary', 'changed policies', count(*)::text FROM t_id_changed) x
 ORDER BY ord, name, detail;

ROLLBACK;
