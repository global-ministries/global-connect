-- Account invitations: Dream Team area directors invite the people of their area
-- (odd/tasks/dream-team-directores-invitan.md, S1–S4).
--
-- Why: an area director (Dream Team nivel director, dream_team.direct grant)
-- can already assign existing people inside their subtree (the
-- dream_team_servicios INSERT policy accepts dream_team.direct in tree), but
-- invitacion_cuenta_puede_invitar never let them send the registration
-- invitation, so every invitation of the rollout had to go through an admin.
--
-- What: public.invitacion_cuenta_puede_invitar(p_usuario_id) gains one rule
-- (the four of 20261008130000 stay as they are):
--   5. the target holds a non-retired servicio in an equipo where the actor
--      has dream_team.direct in tree (auth_has_dream_team_capability_in_tree:
--      the grant scoped to that equipo or to one of its ancestors), and every
--      role of the target is within {miembro, lider} (no roles is fine).
-- The target-role cap is the same as the GdV directors' one: the invited
-- account takes over the ficha with all its roles, so a director must never
-- be able to invite their own email onto a pastor, director or admin ficha.
--
-- Every invitation function (invitacion_cuenta_crear, invitacion_cuenta_estado,
-- invitacion_cuenta_sin_cuenta) calls this function, so only it changes, and
-- the invitation panel shows up for the director without app changes.
--
-- Blast radius: one replaced function (same signature, grants and owner).
--
-- Rollback: re-apply the CREATE OR REPLACE of
-- 20261008130000_invitacion_cuenta_directores_lideres.sql.

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
       -- Group leaders: members of their groups whose roles are all within {miembro}.
       OR (EXISTS (SELECT 1
                     FROM public.usuarios a
                     JOIN public.grupo_miembros gl ON gl.usuario_id = a.id
                     JOIN public.grupo_miembros gt ON gt.grupo_id = gl.grupo_id
                    WHERE a.auth_id = auth.uid()
                      AND gl.rol IN ('Líder', 'Colíder')
                      AND gt.usuario_id = p_usuario_id
                      AND gt.usuario_id <> a.id)
           AND NOT EXISTS (SELECT 1
                             FROM public.usuario_roles ur
                             JOIN public.roles_sistema r ON r.id = ur.rol_id
                            WHERE ur.usuario_id = p_usuario_id
                              AND r.nombre_interno <> 'miembro'))
       -- Dream Team area directors: people serving in their subtree whose
       -- roles are all within {miembro, lider}.
       OR (EXISTS (SELECT 1
                     FROM public.dream_team_servicios s
                    WHERE s.persona_id = p_usuario_id
                      AND s.estado <> 'retirado'
                      AND public.auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id))
           AND NOT EXISTS (SELECT 1
                             FROM public.usuario_roles ur
                             JOIN public.roles_sistema r ON r.id = ur.rol_id
                            WHERE ur.usuario_id = p_usuario_id
                              AND r.nombre_interno NOT IN ('miembro', 'lider')))
     );
$function$;

COMMENT ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) IS
  'Whether the actor (auth.uid()) may invite the person to create an account: admin, pastor, '
  'whoever dream_team_puede_editar_ficha allows, a director (etapa or general) for a target whose '
  'roles are all miembro or lider, a Líder/Colíder of a group the target belongs to for a target '
  'whose roles are all miembro, or a Dream Team area director (dream_team.direct in tree) for a '
  'target serving in their subtree whose roles are all miembro or lider. The target-role caps keep '
  'an invitation from taking over a privileged ficha.';

REVOKE ALL ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) TO authenticated;
