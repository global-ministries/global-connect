-- Dream Team: a coordinator reaches the people of their equipo subtree
-- (odd/tasks/director-alcance-completo.md, S6, task T4).
--
-- Why: Gabriel Salas coordinates Producción in Transit and in Inside Out and
-- must be able to fix the data of every volunteer under him and invite them to
-- the platform; the user asked for the same for every coordinator. Until now
-- only area directors (dream_team.direct) reached their people.
--
--   1. New public.dream_team_coordinador_alcanza_persona(p_persona_id): the
--      actor holds an active dream_team.coordinate grant scoped to an equipo X
--      (scope_id = X; a NULL-scope coordinate grant gives no reach here, so
--      auth_has_dream_team_capability_in_tree, which treats NULL as global, is
--      NOT used) and the target has a non-retired servicio in X's subtree.
--      Same protections as the director rule (S2), stricter on grants: there
--      is no "inside the tree" exemption, EVERY active grant of the target
--      must be harmless:
--        * serve grants (dream_team.serve, *.team.serve), any scope;
--        * lead/coordinate grants (dream_team.lead, dream_team.coordinate,
--          dream_team.gdv.lead, *.team.lead, talleres coordinator.read/write)
--          with a non-NULL scope that is not an equipo at or above an equipo
--          the actor coordinates — co-coordinators of X and the coordinators
--          above stay protected;
--        * any other key (dream_team.direct anywhere, org.manage,
--          director.coordinate, *.director, *.manage, metrics, future keys)
--          protects (fail-closed).
--      Plus: every system role within {miembro, lider}, no active support
--      capability.
--   2. dream_team_director_alcanza_persona: body of
--      20261113190335_director_alcance_scope.sql with two changes:
--        * dream_team.gdv.lead joins the lead/coordinate list (its scope_id is
--          a group/rol id, never an equipo, so group leaders inside the tree
--          were over-protected);
--        * result OR (1). Its callers — invitacion_cuenta_puede_invitar
--          (20261110120000), dream_team_puede_editar_ficha and
--          dream_team_fichas_editables (20261105100000), puede_editar_usuario
--          (20261113185740) — call it with no director-only precondition, so
--          coordinators get invitation, ficha and general profile without
--          redefining them. puede_editar_usuario keeps its p_auth_id =
--          auth.uid() guard: service_role acting for somebody else gets nothing.
--      Registering new people (dream_team_puede_registrar_persona /
--      dream_team_opciones_registro) does NOT use it: unchanged.
--
-- Rollback: re-apply dream_team_director_alcanza_persona and its COMMENT from
--   20261113190335_director_alcance_scope.sql, the COMMENT ON FUNCTION
--   invitacion_cuenta_puede_invitar from 20261113185740_director_alcance_completo.sql
--   and the COMMENT ON FUNCTION dream_team_puede_editar_ficha from
--   20261105100000_dream_team_directores_fichas_altas.sql, then
--   DROP FUNCTION IF EXISTS public.dream_team_coordinador_alcanza_persona(uuid);
--   (the director function must be restored first: it calls this one).

-- 1. Whom a coordinator reaches ----------------------------------------------
CREATE OR REPLACE FUNCTION public.dream_team_coordinador_alcanza_persona(p_persona_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH RECURSIVE
  -- Equipos where the actor holds an equipo-scoped dream_team.coordinate.
  coordina AS (
    SELECT DISTINCT e.id, e.parent_equipo_id
      FROM public.dream_team_capability_grants ga
      JOIN public.usuarios ua ON ua.id = ga.persona_id AND ua.auth_id = auth.uid()
      JOIN public.dream_team_equipos e ON e.id::text = ga.scope_id
     WHERE ga.capability_key = 'dream_team.coordinate'
       AND ga.revoked_at IS NULL
  ),
  -- Those equipos and everything below them.
  arbol AS (
    SELECT c.id, 0 AS profundidad FROM coordina c
    UNION ALL
    SELECT h.id, a.profundidad + 1
      FROM public.dream_team_equipos h
      JOIN arbol a ON h.parent_equipo_id = a.id
     WHERE a.profundidad < 16
  ),
  -- Those equipos and every equipo above them.
  sobre_mi AS (
    SELECT c.id, c.parent_equipo_id, 0 AS profundidad FROM coordina c
    UNION ALL
    SELECT p.id, p.parent_equipo_id, s.profundidad + 1
      FROM public.dream_team_equipos p
      JOIN sobre_mi s ON p.id = s.parent_equipo_id
     WHERE s.profundidad < 16
  )
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1
                   FROM public.dream_team_servicios s
                  WHERE s.persona_id = p_persona_id
                    AND s.estado <> 'retirado'
                    AND s.equipo_id IN (SELECT a.id FROM arbol a))
     AND NOT EXISTS (SELECT 1
                       FROM public.usuario_roles ur
                       JOIN public.roles_sistema r ON r.id = ur.rol_id
                      WHERE ur.usuario_id = p_persona_id
                        AND r.nombre_interno NOT IN ('miembro', 'lider'))
     -- Every active grant must only serve (any scope) or lead/coordinate on a
     -- scope that is neither global nor at or above the actor. No exemption
     -- inside the subtree. Fail-closed for new keys.
     AND NOT EXISTS (SELECT 1
                       FROM public.dream_team_capability_grants g
                      WHERE g.persona_id = p_persona_id
                        AND g.revoked_at IS NULL
                        AND NOT (
                              g.capability_key = 'dream_team.serve'
                           OR g.capability_key LIKE '%.team.serve'
                           OR ((g.capability_key IN ('dream_team.lead', 'dream_team.coordinate',
                                                     'dream_team.gdv.lead',
                                                     'talleres_crecimiento.coordinator.read',
                                                     'talleres_crecimiento.coordinator.write')
                                OR g.capability_key LIKE '%.team.lead')
                               AND g.scope_id IS NOT NULL
                               AND NOT EXISTS (SELECT 1 FROM sobre_mi sm WHERE sm.id::text = g.scope_id))))
     AND NOT EXISTS (SELECT 1
                       FROM public.support_user_capabilities c
                      WHERE c.usuario_id = p_persona_id
                        AND c.revoked_at IS NULL);
$function$;

COMMENT ON FUNCTION public.dream_team_coordinador_alcanza_persona(uuid) IS
  'Whether the actor, as a Dream Team coordinator (equipo-scoped dream_team.coordinate on X; '
  'a NULL-scope grant gives nothing), reaches the person: a non-retired servicio in X''s subtree, '
  'every system role miembro or lider, no active support capability, and every active grant either '
  'a serve one (any scope) or a lead/coordinate one whose scope is neither global nor at or above '
  'an equipo the actor coordinates. Directors, co-coordinators, superiors and any other key stay protected.';

REVOKE ALL ON FUNCTION public.dream_team_coordinador_alcanza_persona(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_coordinador_alcanza_persona(uuid) TO authenticated;

-- 2. Director rule (20261113190335) + gdv.lead + coordinator reach -----------
CREATE OR REPLACE FUNCTION public.dream_team_director_alcanza_persona(p_persona_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH RECURSIVE
  -- Equipos the actor directs and every equipo above them.
  sobre_mi AS (
    SELECT e.id, e.parent_equipo_id, 0 AS profundidad
      FROM public.dream_team_capability_grants ga
      JOIN public.usuarios ua ON ua.id = ga.persona_id AND ua.auth_id = auth.uid()
      JOIN public.dream_team_equipos e ON e.id::text = ga.scope_id
     WHERE ga.capability_key = 'dream_team.direct'
       AND ga.revoked_at IS NULL
    UNION ALL
    SELECT p.id, p.parent_equipo_id, s.profundidad + 1
      FROM public.dream_team_equipos p
      JOIN sobre_mi s ON p.id = s.parent_equipo_id
     WHERE s.profundidad < 16
  )
  SELECT (auth.uid() IS NOT NULL
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
     -- A grant outside the director's subtree protects the person unless it
     -- only serves (any scope) or leads/coordinates on a scope that is neither
     -- global nor at or above the director. Fail-closed for new keys.
     AND NOT EXISTS (SELECT 1
                       FROM public.dream_team_capability_grants g
                      WHERE g.persona_id = p_persona_id
                        AND g.revoked_at IS NULL
                        AND NOT EXISTS (SELECT 1
                                          FROM public.dream_team_equipos e
                                         WHERE e.id::text = g.scope_id
                                           AND public.auth_has_dream_team_capability_in_tree('dream_team.direct', e.id))
                        AND NOT (
                              g.capability_key = 'dream_team.serve'
                           OR g.capability_key LIKE '%.team.serve'
                           OR ((g.capability_key IN ('dream_team.lead', 'dream_team.coordinate',
                                                     'dream_team.gdv.lead',
                                                     'talleres_crecimiento.coordinator.read',
                                                     'talleres_crecimiento.coordinator.write')
                                OR g.capability_key LIKE '%.team.lead')
                               AND g.scope_id IS NOT NULL
                               AND NOT EXISTS (SELECT 1 FROM sobre_mi sm WHERE sm.id::text = g.scope_id))))
     AND NOT EXISTS (SELECT 1
                       FROM public.support_user_capabilities c
                      WHERE c.usuario_id = p_persona_id
                        AND c.revoked_at IS NULL))
     -- S6: coordinators reach the people of their equipo subtree.
     OR public.dream_team_coordinador_alcanza_persona(p_persona_id);
$function$;

COMMENT ON FUNCTION public.dream_team_director_alcanza_persona(uuid) IS
  'Whether the actor reaches the person as a Dream Team area director or coordinator. Director: a '
  'non-retired servicio in their dream_team.direct subtree, every system role miembro or lider, no '
  'active support capability, and no grant outside that subtree other than serve ones (any scope) or '
  'lead/coordinate ones (incl. dream_team.gdv.lead) whose scope is neither global nor at or above the '
  'director. Coordinator: dream_team_coordinador_alcanza_persona. Peer directors, superiors, managers '
  'and any other key stay protected.';

REVOKE ALL ON FUNCTION public.dream_team_director_alcanza_persona(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_director_alcanza_persona(uuid) TO authenticated;

-- 3. Callers' comments: they now cover coordinators too --------------------
COMMENT ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) IS
  'Whether the actor (auth.uid()) may invite the person to create an account: admin, pastor, '
  'whoever dream_team_puede_editar_ficha allows, a director (etapa or general) for a target whose '
  'roles are all miembro or lider, a Líder (not a Colíder) of a group the target belongs to for a '
  'target whose roles are all miembro, or a Dream Team area director or coordinator for a person they '
  'reach (dream_team_director_alcanza_persona). The caps keep an invitation from taking over a privileged ficha.';

COMMENT ON FUNCTION public.dream_team_puede_editar_ficha(uuid) IS
  'Whether the actor (auth.uid()) may edit the person''s ficha: the person holds a non-retired '
  'servicio in an equipo of dream_team_equipos_registrables() (volunteer coordinator, org.manage, '
  'admin, pastor), or an area director or coordinator reaches them (dream_team_director_alcanza_persona).';
