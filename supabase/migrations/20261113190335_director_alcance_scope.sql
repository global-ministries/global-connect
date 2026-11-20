-- Dream Team: tighten the grant cap of dream_team_director_alcanza_persona
-- (odd/tasks/director-alcance-completo.md, S2, Log L7).
--
-- Why: 20261113185740 let a lead or coordinate grant outside the director's
-- subtree stop protecting a person whatever its scope. Two holes the
-- independent review found:
--   * scope_id NULL means global for auth_has_dream_team_capability_in_tree,
--     so a global dream_team.coordinate / dream_team.lead / *.team.lead
--     holder leads or coordinates the whole church and must stay protected;
--   * a coordinate or lead grant on an equipo ABOVE the director (an ancestor
--     of an equipo the director directs) is a superior, not a peer, and must
--     stay protected.
-- Serve grants keep stopping protection at any scope, including the
-- experience-scoped the_living_room.team.serve (S1).
--
-- Rule for a grant of the target that is NOT on an equipo of the director's
-- subtree. It does not protect only when it is:
--   * a serve grant (dream_team.serve, *.team.serve), any scope; or
--   * a lead or coordinate grant (dream_team.lead, dream_team.coordinate,
--     *.team.lead, talleres_crecimiento.coordinator.read/write) with a
--     non-NULL scope that is not an equipo at or above one the director
--     directs.
-- Every other grant still protects (direct, org.manage, director.coordinate,
-- *.director, *.manage, metrics, any future key: fail-closed).
--
-- Rollback: re-apply dream_team_director_alcanza_persona from
--   20261113185740_director_alcance_completo.sql.

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

COMMENT ON FUNCTION public.dream_team_director_alcanza_persona(uuid) IS
  'Whether the actor, as a Dream Team area director, reaches the person: a non-retired servicio in '
  'their dream_team.direct subtree, every system role miembro or lider, no active support capability, '
  'and no grant outside that subtree other than serve ones (any scope) or lead/coordinate ones whose '
  'scope is neither global nor at or above the director. Peer directors, superiors, managers and '
  'any other key stay protected.';

REVOKE ALL ON FUNCTION public.dream_team_director_alcanza_persona(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_director_alcanza_persona(uuid) TO authenticated;
