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
