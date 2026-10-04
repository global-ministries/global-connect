-- Who sees whom in usuarios, who may ask for a spouse, and who reads four of
-- the reporting views (security phase 3, batch L6).
--
--   puede_ver_usuario(p_viewer_id, p_target_user_id)
--     Before: it mixed id kinds. Branch (a) and (c) compared usuarios.id, (b)
--     passed p_viewer_id to obtener_roles_usuario, which expects an auth id,
--     and the usuarios policy called it with (auth.uid(), id). So (a) and (c)
--     never matched and only admin/pastor saw anybody through it.
--     Now both arguments are usuarios.id. Unless the request role is
--     service_role, p_viewer_id must be the session person, else false. Then:
--     self; admin or pastor see everybody; a director general sees the members
--     of the groups gdv_dg_ve_grupo gives them; a director de etapa sees the
--     members of the groups assigned to them in director_etapa_grupos; a Líder
--     or Colíder sees the members of their groups; nobody else sees anybody.
--     Membership is any grupo_miembros row, as in puede_ver_grupo.
--   Policy "Los usuarios pueden ver perfiles según su rol" on usuarios now
--     passes (SELECT get_my_internal_id()) instead of auth.uid(). The other two
--     SELECT policies stay as they are; usuarios_can_view_profile_photos still
--     lets admin, pastor and director-general read every row (accepted).
--   obtener_conyugue(p_usuario_id)
--     Gate: directors (etapa and general), pastor and admin may ask about
--     anybody; a Líder or Colíder only about a member of one of their groups;
--     anybody else and no session get no row. service_role skips the gate.
--   Views v_directores_etapa_segmento (read only with the service role, from
--     app/api/segmentos/[segmentoId]/directores-etapa/ubicaciones/route.ts,
--     after a role check), v_casas_anfitrionas_disponibles,
--     v_lideres_con_pareja and v_grupos_supervisiones (no reader in the app):
--     authenticated loses SELECT. The views run as their owner, so this is
--     the only gate. v_solicitudes_pendientes, v_historial_miembro,
--     v_mapa_grupos_vida and v_salud_miembros_grupo are read with the session
--     client (the last one from a leader page) and are left unchanged.

CREATE OR REPLACE FUNCTION public.puede_ver_usuario(p_viewer_id uuid, p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only about the person in the session; only service_role may ask about
  -- somebody else.
  IF coalesce(auth.role(), '') <> 'service_role'
     AND (auth.uid() IS NULL
          OR p_viewer_id IS DISTINCT FROM (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid())) THEN
    RETURN false;
  END IF;

  IF p_viewer_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_viewer_id = p_target_user_id THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM public.usuario_roles ur
               JOIN public.roles_sistema rs ON rs.id = ur.rol_id
              WHERE ur.usuario_id = p_viewer_id
                AND rs.nombre_interno IN ('admin', 'pastor')) THEN
    RETURN true;
  END IF;

  -- Director general: members of the groups the single DG rule gives them.
  IF EXISTS (SELECT 1 FROM public.usuario_roles ur
               JOIN public.roles_sistema rs ON rs.id = ur.rol_id
              WHERE ur.usuario_id = p_viewer_id
                AND rs.nombre_interno = 'director-general')
     AND EXISTS (SELECT 1 FROM public.grupo_miembros gm
                  WHERE gm.usuario_id = p_target_user_id
                    AND public.gdv_dg_ve_grupo(p_viewer_id, gm.grupo_id)) THEN
    RETURN true;
  END IF;

  -- Director de etapa: members of the groups assigned to them.
  IF EXISTS (SELECT 1 FROM public.grupo_miembros gm
               JOIN public.director_etapa_grupos deg ON deg.grupo_id = gm.grupo_id
               JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
              WHERE gm.usuario_id = p_target_user_id
                AND sl.usuario_id = p_viewer_id
                AND sl.tipo_lider = 'director_etapa') THEN
    RETURN true;
  END IF;

  -- Líder or Colíder: members of their groups.
  RETURN EXISTS (SELECT 1 FROM public.grupo_miembros lead
                   JOIN public.grupo_miembros gm ON gm.grupo_id = lead.grupo_id
                  WHERE lead.usuario_id = p_viewer_id
                    AND lead.rol IN ('Líder', 'Colíder')
                    AND gm.usuario_id = p_target_user_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.puede_ver_usuario(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_ver_usuario(uuid, uuid) TO authenticated, service_role;

DROP POLICY "Los usuarios pueden ver perfiles según su rol" ON public.usuarios;
CREATE POLICY "Los usuarios pueden ver perfiles según su rol" ON public.usuarios
  FOR SELECT TO public
  USING (public.puede_ver_usuario((SELECT public.get_my_internal_id()), id));

CREATE OR REPLACE FUNCTION public.obtener_conyugue(p_usuario_id uuid)
RETURNS TABLE(id uuid, nombre text, apellido text, foto_perfil_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u.id, u.nombre, u.apellido, u.foto_perfil_url
  FROM public.relaciones_usuarios ru
  JOIN public.usuarios u ON u.id = CASE
    WHEN ru.usuario1_id = p_usuario_id THEN ru.usuario2_id
    ELSE ru.usuario1_id
  END
  WHERE (ru.usuario1_id = p_usuario_id OR ru.usuario2_id = p_usuario_id)
    AND ru.tipo_relacion = 'conyuge'
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR EXISTS (
        SELECT 1
        FROM public.usuarios me
        WHERE me.auth_id = auth.uid()
          AND (
            EXISTS (SELECT 1 FROM public.usuario_roles ur
                      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                     WHERE ur.usuario_id = me.id
                       AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa'))
            OR EXISTS (SELECT 1 FROM public.grupo_miembros lead
                         JOIN public.grupo_miembros gm ON gm.grupo_id = lead.grupo_id
                        WHERE lead.usuario_id = me.id
                          AND lead.rol IN ('Líder', 'Colíder')
                          AND gm.usuario_id = p_usuario_id)
          )
      )
    )
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.obtener_conyugue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_conyugue(uuid) TO authenticated, service_role;

REVOKE ALL ON public.v_directores_etapa_segmento FROM anon, authenticated;
REVOKE ALL ON public.v_casas_anfitrionas_disponibles FROM anon, authenticated;
REVOKE ALL ON public.v_lideres_con_pareja FROM anon, authenticated;
REVOKE ALL ON public.v_grupos_supervisiones FROM anon, authenticated;
