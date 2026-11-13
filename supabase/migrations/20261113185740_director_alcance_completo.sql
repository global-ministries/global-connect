-- Dream Team: an area director reaches everyone in their equipo tree
-- (odd/tasks/director-alcance-completo.md, S1–S4, task T2).
--
-- Why: Engels directs Dirección de Estudiantes (Transit, Inside Out, The
-- Living Room) and reached 55 of its 91 people. Two causes, both in
-- dream_team_director_alcanza_persona (20261105100000): every active grant of
-- the target had to sit on an equipo of the director's subtree, so
--   * the 33 The Living Room servers, whose the_living_room.team.serve grant
--     is experience-scoped (scope_id NULL, by design), were out (S1);
--   * anybody who also serves, leads or coordinates outside the subtree (DPS
--     Video, Niños, Talleres, Global Music...) was out (S2).
-- And puede_editar_usuario had no director branch, so no director could open
-- the general profile of any of them (S3).
--
--   1. dream_team_director_alcanza_persona(p_persona_id): same rule except the
--      grant cap. Grants outside the director's subtree that only serve, lead
--      or coordinate (dream_team.serve/lead/coordinate, *.team.serve,
--      *.team.lead, talleres coordinator.read/write) no longer block; every
--      other grant outside the subtree still blocks (peer directors, org
--      managers, dream_team.director.coordinate, *.director, *.manage,
--      metrics readers, and any future key). Unchanged: a non-retired
--      servicio in the subtree, every system role within {miembro, lider}, no
--      active support capability.
--   2. puede_editar_usuario: 20261101200000_mi_familia.sql section 3 copied
--      byte for byte plus one branch: the area director reaches the target
--      per (1). (1) reads auth.uid(), so the branch only runs when
--      p_auth_id = auth.uid(); service_role acting for somebody else does not
--      get it. The usuarios UPDATE policy, puede_ver_usuario, the edit page
--      and updateUser all go through puede_editar_usuario.
--   3. invitacion_cuenta_puede_invitar (20261110120000) and
--      dream_team_puede_editar_ficha (20261105100000) already call (1); only
--      the invitation comment, which described the old grant cap, is
--      rewritten (S4).
--
-- Blast radius: two replaced functions (same signatures, owners and grants),
-- one comment. Everything that calls (1) — fichas, altas, invitations,
-- fichas_editables — widens by the same people.
--
-- Rollback: re-apply the CREATE OR REPLACE of
--   dream_team_director_alcanza_persona from
--     20261105100000_dream_team_directores_fichas_altas.sql,
--   puede_editar_usuario from 20261101200000_mi_familia.sql (section 3),
--   and the COMMENT ON FUNCTION invitacion_cuenta_puede_invitar from
--     20261110120000_colider_solo_lectura.sql.

-- 1. Whom an area director reaches ------------------------------------------
CREATE OR REPLACE FUNCTION public.dream_team_director_alcanza_persona(p_persona_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1
                   FROM public.dream_team_servicios s
                  WHERE s.persona_id = p_persona_id
                    AND s.estado <> 'retirado'
                    AND public.auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id))
     AND NOT EXISTS (SELECT 1
                       FROM public.usuario_roles ur
                       JOIN public.roles_sistema r ON r.id = ur.rol_id
                      WHERE ur.usuario_id = p_persona_id
                        AND r.nombre_interno NOT IN ('miembro', 'lider'))
     -- Peer directors and organization managers stay out: a direct or
     -- org.manage grant that is not on an equipo of the director's subtree.
     AND NOT EXISTS (SELECT 1
                       FROM public.dream_team_capability_grants g
                      WHERE g.persona_id = p_persona_id
                        AND g.revoked_at IS NULL
                        -- Serving, leading or coordinating elsewhere does not protect; any
                        -- other grant outside the subtree (direct, org.manage, director.coordinate,
                        -- *.director, *.manage, metrics...) still does. Fail-closed for new keys.
                        AND NOT (g.capability_key IN ('dream_team.serve', 'dream_team.lead',
                                                      'dream_team.coordinate',
                                                      'talleres_crecimiento.coordinator.read',
                                                      'talleres_crecimiento.coordinator.write')
                                 OR g.capability_key LIKE '%.team.serve'
                                 OR g.capability_key LIKE '%.team.lead')
                        AND NOT EXISTS (SELECT 1
                                          FROM public.dream_team_equipos e
                                         WHERE e.id::text = g.scope_id
                                           AND public.auth_has_dream_team_capability_in_tree('dream_team.direct', e.id)))
     AND NOT EXISTS (SELECT 1
                       FROM public.support_user_capabilities c
                      WHERE c.usuario_id = p_persona_id
                        AND c.revoked_at IS NULL);
$function$;

COMMENT ON FUNCTION public.dream_team_director_alcanza_persona(uuid) IS
  'Whether the actor, as a Dream Team area director, reaches the person: a non-retired servicio in '
  'their dream_team.direct subtree, every system role miembro or lider, no grant outside that '
  'subtree other than serve, lead or coordinate ones (peer directors, org managers, global and '
  'manage grants stay protected) and no active support capability.';

REVOKE ALL ON FUNCTION public.dream_team_director_alcanza_persona(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_director_alcanza_persona(uuid) TO authenticated;

-- 2. Who may edit a person: section 3 of 20261101200000_mi_familia.sql plus the area director branch ------
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

  -- Regla global: Admin (todos los campus)
  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_actor_id
      AND rs.nombre_interno = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Regla: Pastor edita a las personas que comparten uno de sus campus
  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_actor_id
      AND rs.nombre_interno = 'pastor'
  ) AND EXISTS (
    SELECT 1
    FROM public.usuario_campus mi_uc
    JOIN public.usuario_campus su_uc ON su_uc.campus_id = mi_uc.campus_id
    WHERE mi_uc.usuario_id = v_actor_id
      AND su_uc.usuario_id = p_target_user_id
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

  -- Regla: Director general (scoped). Llama a gdv_dg_ve_grupo directamente:
  -- es_director_general_de_grupo devuelve TRUE para cualquier pastor sobre
  -- cualquier grupo (es_superadmin), lo que saltaba la regla de campus.
  IF EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_actor_id
      AND rs.nombre_interno = 'director-general'
  ) AND EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm_objetivo
    JOIN public.grupos g
      ON g.id = gm_objetivo.grupo_id
    WHERE gm_objetivo.usuario_id = p_target_user_id
      AND gm_objetivo.estado = 'activo'
      AND gm_objetivo.fecha_salida IS NULL
      AND g.activo = true
      AND g.eliminado = false
      AND public.gdv_dg_ve_grupo(v_actor_id, gm_objetivo.grupo_id)
  ) THEN
    RETURN TRUE;
  END IF;

  -- Regla: quien pidió crear una ficha sin cuenta (Mi familia) la edita
  -- mientras siga sin cuenta
  IF EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = p_target_user_id
      AND u.creado_por = v_actor_id
      AND u.auth_id IS NULL
  ) THEN
    RETURN TRUE;
  END IF;

  -- Regla: Director de área de Dream Team edita a las personas que alcanza
  -- (dream_team_director_alcanza_persona). Esa función lee auth.uid(), así
  -- que sólo aplica cuando el actor es la persona de la sesión.
  IF p_auth_id = auth.uid()
     AND public.dream_team_director_alcanza_persona(p_target_user_id) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;

REVOKE ALL ON FUNCTION public.puede_editar_usuario(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_editar_usuario(uuid, uuid) TO authenticated, service_role;

-- 3. The invitation rule already calls (1); its comment described the old cap --
COMMENT ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) IS
  'Whether the actor (auth.uid()) may invite the person to create an account: admin, pastor, '
  'whoever dream_team_puede_editar_ficha allows, a director (etapa or general) for a target whose '
  'roles are all miembro or lider, a Líder (not a Colíder) of a group the target belongs to for a '
  'target whose roles are all miembro, or a Dream Team area director for a person they reach '
  '(dream_team_director_alcanza_persona). The caps keep an invitation from taking over a privileged ficha.';
