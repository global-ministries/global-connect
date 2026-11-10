-- The Colíder of a Grupo de Vida is read-only: the three helpers that still
-- treated a Colíder as a Líder for writing now answer for the Líder only
-- (odd/tasks/home-por-rol.md, T5, S6).
--
-- Why (S6, the user's words): "los colideres se deben tomar como miembros
-- porque ellos no deben tener permisos de edicion, solo lectura.."
--
-- What: each function is its latest definition with only the role check
-- changed from rol IN ('Líder', 'Colíder') to rol = 'Líder':
--   1. invitacion_cuenta_puede_invitar(uuid) (latest:
--      20261105100000_dream_team_directores_fichas_altas.sql), the "group
--      leaders" branch: a Colíder no longer invites groupmates to create an
--      account. Its comment says Líder now.
--   2. es_lider_usuario(uuid) (latest:
--      20250923140000_update_storage_policies_for_leaders.sql): it gates the
--      storage INSERT/UPDATE/DELETE policies of the profile-photos bucket, so a
--      Colíder no longer uploads, replaces or deletes the photos of other
--      members of the group. Their own photo is unchanged.
--   3. es_lider_de_grupo(uuid, uuid) (latest:
--      20261003120000_ayudantes_persona_sesion.sql): no policy or function
--      calls it today (staging pg_policies and pg_proc); changed so that a
--      future caller does not grant a write to a Colíder.
--
-- Group writes already go through puede_editar_grupo, which is Líder only
-- (20260929150000_gdv_dg_regla_en_grupos.sql). Reads stay as they are for the
-- Colíder: puede_ver_grupo, puede_ver_usuario, obtener_conyugue,
-- obtener_grupos_para_usuario, birthdays, Dream Team lists, planner_* and
-- uno_a_uno_* are not touched.
--
-- Blast radius: three replaced functions, same signatures, language,
-- volatility, SECURITY DEFINER, search_path and owner. Grants restated as they
-- are live (no PUBLIC, no anon; es_lider_usuario lost PUBLIC and anon in
-- 20261001200000_definer_sin_anon.sql). Callers: invitacion_cuenta_estado,
-- invitacion_cuenta_crear, invitaciones_cuenta_pendientes and the Dream Team
-- pendientes RPCs (through 1); the three profile-photos storage policies
-- (through 2). A Colíder who is also admin, pastor, director or has Dream Team
-- authority keeps those other branches.
--
-- Rollback: CREATE OR REPLACE the three functions with their previous bodies,
-- which differ from these only in the role check:
--   1. invitacion_cuenta_puede_invitar: re-apply its CREATE OR REPLACE from
--      20261105100000_dream_team_directores_fichas_altas.sql
--      (gl.rol IN ('Líder', 'Colíder')) and the COMMENT ON FUNCTION from
--      20261102210000_invitacion_cuenta_directores_area_talleres.sql.
--   2. es_lider_usuario: re-apply its CREATE OR REPLACE from
--      20250923140000_update_storage_policies_for_leaders.sql
--      (gm1.rol IN ('Líder', 'Colíder')), then the REVOKE/GRANT below.
--   3. es_lider_de_grupo: re-apply its CREATE OR REPLACE from
--      20261003120000_ayudantes_persona_sesion.sql
--      (gm.rol IN ('Líder', 'Colíder')).

-- 1. Account invitations ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invitacion_cuenta_puede_invitar(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND (
       public.es_admin_o_pastor(auth.uid())
       OR public.dream_team_puede_editar_ficha(p_usuario_id)
       -- Directors: targets whose roles are all within {miembro, lider}.
       OR (EXISTS (SELECT 1
                     FROM public.usuarios a
                     JOIN public.usuario_roles ur ON ur.usuario_id = a.id
                     JOIN public.roles_sistema r ON r.id = ur.rol_id
                    WHERE a.auth_id = auth.uid()
                      AND r.nombre_interno IN ('director-etapa', 'director-general'))
           AND NOT EXISTS (SELECT 1
                             FROM public.usuario_roles ur
                             JOIN public.roles_sistema r ON r.id = ur.rol_id
                            WHERE ur.usuario_id = p_usuario_id
                              AND r.nombre_interno NOT IN ('miembro', 'lider')))
       -- Group leaders (Líder only; the Colíder is read-only): members of
       -- their groups whose roles are all within {miembro}.
       OR (EXISTS (SELECT 1
                     FROM public.usuarios a
                     JOIN public.grupo_miembros gl ON gl.usuario_id = a.id
                     JOIN public.grupo_miembros gt ON gt.grupo_id = gl.grupo_id
                    WHERE a.auth_id = auth.uid()
                      AND gl.rol = 'Líder'
                      AND gt.usuario_id = p_usuario_id
                      AND gt.usuario_id <> a.id)
           AND NOT EXISTS (SELECT 1
                             FROM public.usuario_roles ur
                             JOIN public.roles_sistema r ON r.id = ur.rol_id
                            WHERE ur.usuario_id = p_usuario_id
                              AND r.nombre_interno <> 'miembro'))
       -- Dream Team area directors: people they reach.
       OR public.dream_team_director_alcanza_persona(p_usuario_id)
     );
$function$;

COMMENT ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) IS
  'Whether the actor (auth.uid()) may invite the person to create an account: admin, pastor, '
  'whoever dream_team_puede_editar_ficha allows, a director (etapa or general) for a target whose '
  'roles are all miembro or lider, a Líder (not a Colíder) of a group the target belongs to for a '
  'target whose roles are all miembro, or a Dream Team area director (dream_team.direct in tree) for '
  'a target serving in their subtree whose roles are all miembro or lider and whose grants all sit '
  'on equipos of that subtree. The caps keep an invitation from taking over a privileged ficha.';

REVOKE ALL ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) TO authenticated;

-- 2. Profile photos of other members (storage policies) -----------------------
CREATE OR REPLACE FUNCTION public.es_lider_usuario(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id uuid;
    es_lider boolean := false;
BEGIN
    -- Obtener el ID del usuario autenticado
    SELECT u.id INTO current_user_id
    FROM public.usuarios u
    WHERE u.auth_id = auth.uid();
    
    -- Si no se encuentra el usuario, no es líder
    IF current_user_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Si es el mismo usuario, permitir (gestión propia)
    IF current_user_id = target_user_id THEN
        RETURN true;
    END IF;
    
    -- Verificar si el usuario actual es líder de algún grupo donde el usuario objetivo es miembro
    -- (solo el Líder: el Colíder es de solo lectura)
    SELECT EXISTS(
        SELECT 1
        FROM public.grupo_miembros gm1
        INNER JOIN public.grupo_miembros gm2 ON gm1.grupo_id = gm2.grupo_id
        WHERE gm1.usuario_id = current_user_id
        AND gm1.rol = 'Líder'
        AND gm2.usuario_id = target_user_id
    ) INTO es_lider;
    
    RETURN es_lider;
END;
$$;

REVOKE ALL ON FUNCTION public.es_lider_usuario(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_lider_usuario(uuid) TO authenticated, service_role;

-- 3. Group leader predicate (no caller today) ---------------------------------
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

  -- Only the Líder: the Colíder is read-only (S6).
  RETURN EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm
    WHERE gm.usuario_id = p_user_id
      AND gm.grupo_id = p_grupo_id
      AND gm.rol = 'Líder'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.es_lider_de_grupo(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_lider_de_grupo(uuid, uuid) TO authenticated, service_role;
