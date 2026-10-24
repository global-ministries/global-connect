-- Account invitations: directors and group leaders may invite too
-- (follow-up to 20261008120000_invitaciones_cuenta.sql).
--
-- Why: invitacion_cuenta_puede_invitar only allowed admin, pastor and the
-- Atencion al Voluntario coordinator, so a director de etapa could not invite
-- a leader of their stage and a group leader could not invite the people of
-- their own group. Both are the people who actually know who still has no
-- account.
--
-- What: public.invitacion_cuenta_puede_invitar(p_usuario_id) now returns true
-- (always false without auth.uid()) when:
--   1. the actor is admin or pastor (any ficha) — unchanged;
--   2. dream_team_puede_editar_ficha(p_usuario_id) allows it — unchanged;
--   3. the actor holds director-etapa or director-general, and every role of
--      the target is within {miembro, lider} (no roles is fine);
--   4. the actor is Líder or Colíder of a group where the target is a member
--      (any rol in that group), and every role of the target is within
--      {miembro} (no roles is fine).
-- The target-role cap matters because the invited account takes over the
-- ficha with all its roles: without it a director or leader could invite
-- their own email onto a pastor/director/admin ficha and inherit its
-- privileges. Being a member of the actor's group (rule 4) never includes
-- the actor's own ficha: an own ficha already has an account.
-- es_lider_usuario is not reused on purpose: it returns true for the actor's
-- own ficha and has no fixed search_path.
--
-- Every invitation function (invitacion_cuenta_crear, invitacion_cuenta_estado,
-- invitacion_cuenta_sin_cuenta) calls this function, so only it changes.
--
-- Blast radius: one replaced function (same signature, grants and owner).
--
-- Rollback (restore the previous body):
--   CREATE OR REPLACE FUNCTION public.invitacion_cuenta_puede_invitar(p_usuario_id uuid)
--   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
--   AS $function$
--     SELECT auth.uid() IS NOT NULL
--        AND (public.es_admin_o_pastor(auth.uid())
--             OR public.dream_team_puede_editar_ficha(p_usuario_id));
--   $function$;

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
     );
$function$;

COMMENT ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) IS
  'Whether the actor (auth.uid()) may invite the person to create an account: admin, pastor, '
  'whoever dream_team_puede_editar_ficha allows, a director (etapa or general) for a target whose '
  'roles are all miembro or lider, or a Líder/Colíder of a group the target belongs to for a target '
  'whose roles are all miembro. The target-role caps keep an invitation from taking over a '
  'privileged ficha.';

REVOKE ALL ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) TO authenticated;
