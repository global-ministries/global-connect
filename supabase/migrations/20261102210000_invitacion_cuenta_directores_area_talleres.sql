-- Account invitations: an area director's grant cap reads taller-scoped grants
-- too (follow-up to 20261102200000_invitacion_cuenta_directores_area.sql,
-- odd/tasks/dream-team-directores-invitan.md S1/S3).
--
-- Why: the cap refused every target with a grant whose scope_type is not
-- 'equipo'. Talleres coordinators carry talleres_crecimiento.* grants with
-- scope_type 'taller' whose scope_id is the id of their own Dream Team equipo
-- (De Hombre a Hombre, Mujer de Hoy...), so in production the Conexión
-- director could invite none of the coordinators under him.
--
-- What: a grant counts as inside the actor's authority when its scope_id is
-- the id of an existing dream_team_equipos row inside the actor's
-- dream_team.direct tree, whatever its scope_type. Any other grant (global,
-- experience-scoped, an id that is no equipo, an equipo outside the tree) still
-- refuses the target. Everything else is unchanged.
--
-- Blast radius: one replaced function (same signature, grants and owner).
--
-- Rollback: re-apply 20261102200000_invitacion_cuenta_directores_area.sql.

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
       -- roles are all within {miembro, lider} and whose grants all sit on
       -- equipos of that subtree.
       OR (EXISTS (SELECT 1
                     FROM public.dream_team_servicios s
                    WHERE s.persona_id = p_usuario_id
                      AND s.estado <> 'retirado'
                      AND public.auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id))
           AND NOT EXISTS (SELECT 1
                             FROM public.usuario_roles ur
                             JOIN public.roles_sistema r ON r.id = ur.rol_id
                            WHERE ur.usuario_id = p_usuario_id
                              AND r.nombre_interno NOT IN ('miembro', 'lider'))
           AND NOT EXISTS (SELECT 1
                             FROM public.dream_team_capability_grants g
                            WHERE g.persona_id = p_usuario_id
                              AND g.revoked_at IS NULL
                              AND NOT EXISTS (SELECT 1
                                                FROM public.dream_team_equipos e
                                               WHERE e.id::text = g.scope_id
                                                 AND public.auth_has_dream_team_capability_in_tree('dream_team.direct', e.id)))
           AND NOT EXISTS (SELECT 1
                             FROM public.support_user_capabilities c
                            WHERE c.usuario_id = p_usuario_id
                              AND c.revoked_at IS NULL))
     );
$function$;

COMMENT ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) IS
  'Whether the actor (auth.uid()) may invite the person to create an account: admin, pastor, '
  'whoever dream_team_puede_editar_ficha allows, a director (etapa or general) for a target whose '
  'roles are all miembro or lider, a Líder/Colíder of a group the target belongs to for a target '
  'whose roles are all miembro, or a Dream Team area director (dream_team.direct in tree) for a '
  'target serving in their subtree whose roles are all miembro or lider and whose grants all sit '
  'on equipos of that subtree. The caps keep an invitation from taking over a privileged ficha.';

REVOKE ALL ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) TO authenticated;
