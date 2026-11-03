-- Dream Team: area directors edit the fichas of their people and register new
-- people into their area (odd/tasks/dream-team-directores-fichas.md, S1–S4).
--
-- Why: only the Atención al Voluntario coordinator, org.manage, admin and
-- pastor could fix a ficha (cedula, phone...) or register a brand-new person,
-- so every area director depended on them for their own people. Directors
-- can already search any existing person and assign them to their area; this
-- adds the ficha edit and the registration of people not yet in the system.
--
-- Scope on purpose: dream_team_equipos_registrables() is NOT widened. It also
-- feeds turnos policies, Niños/Estudiantes volunteer attendance, contacts and
-- read policies, none of which this change is about. Directors get their own
-- helpers instead:
--   1. public.dream_team_equipos_director(): the active equipos of the
--      actor's dream_team.direct subtrees.
--   2. public.dream_team_director_alcanza_persona(p_persona_id): whether an
--      area director reaches the person — a non-retired servicio in their
--      subtree, every system role within {miembro, lider}, every active grant
--      on an equipo of that subtree, no active support capability. This is
--      rule 5 of invitacion_cuenta_puede_invitar (20261102210000), now in one
--      place: the invitation rule calls it too, unchanged in behavior.
--   3. dream_team_puede_editar_ficha(p) = previous rule OR (2).
--   4. dream_team_puede_registrar_persona(p_equipo_id) and
--      dream_team_opciones_registro() add (1) to the registrable equipos.
--   5. public.dream_team_fichas_editables(p_ids uuid[]): the ids among p_ids
--      whose ficha the actor may edit (max 2000), for the UI.
--
-- Blast radius: two new helpers, one new read-only batch RPC, four replaced
-- functions (same signatures, grants and owners). dream_team_registrar_persona,
-- dream_team_ficha_persona, dream_team_editar_ficha and
-- dream_team_persona_por_cedula pick the new authority up through (3)/(4).
--
-- Rollback: re-apply the CREATE OR REPLACE of
--   20261102210000_invitacion_cuenta_directores_area_talleres.sql,
--   20261008100000_dream_team_editar_ficha.sql (puede_editar_ficha),
--   20261006110100_dream_team_registrar_solo_coordinador_voluntario.sql
--     (puede_registrar_persona), 20261006110200_dream_team_opciones_registro.sql,
-- then DROP FUNCTION IF EXISTS public.dream_team_fichas_editables(uuid[]),
--   public.dream_team_director_alcanza_persona(uuid),
--   public.dream_team_equipos_director().

CREATE OR REPLACE FUNCTION public.dream_team_equipos_director()
RETURNS TABLE (equipo_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT e.id
    FROM public.dream_team_equipos e
   WHERE auth.uid() IS NOT NULL
     AND e.activo
     AND public.auth_has_dream_team_capability_in_tree('dream_team.direct', e.id);
$function$;

COMMENT ON FUNCTION public.dream_team_equipos_director() IS
  'The active equipos of the actor''s dream_team.direct subtrees (area director).';

REVOKE ALL ON FUNCTION public.dream_team_equipos_director() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_equipos_director() TO authenticated;

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
     AND NOT EXISTS (SELECT 1
                       FROM public.dream_team_capability_grants g
                      WHERE g.persona_id = p_persona_id
                        AND g.revoked_at IS NULL
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
  'their dream_team.direct subtree, every system role miembro or lider, every active grant on an '
  'equipo of that subtree and no active support capability.';

REVOKE ALL ON FUNCTION public.dream_team_director_alcanza_persona(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_director_alcanza_persona(uuid) TO authenticated;

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
       -- Dream Team area directors: people they reach.
       OR public.dream_team_director_alcanza_persona(p_usuario_id)
     );
$function$;

REVOKE ALL ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dream_team_puede_editar_ficha(p_persona_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid())
     AND (
       EXISTS (
         SELECT 1
           FROM public.dream_team_servicios s
           JOIN public.dream_team_equipos_registrables() r ON r.equipo_id = s.equipo_id
          WHERE s.persona_id = p_persona_id
            AND s.estado <> 'retirado'
       )
       OR public.dream_team_director_alcanza_persona(p_persona_id)
     );
$function$;

COMMENT ON FUNCTION public.dream_team_puede_editar_ficha(uuid) IS
  'Whether the actor (auth.uid()) may edit the person''s ficha: the person holds a non-retired '
  'servicio in an equipo of dream_team_equipos_registrables() (volunteer coordinator, org.manage, '
  'admin, pastor), or an area director reaches them (dream_team_director_alcanza_persona).';

REVOKE ALL ON FUNCTION public.dream_team_puede_editar_ficha(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_puede_editar_ficha(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dream_team_puede_registrar_persona(p_equipo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM (SELECT r.equipo_id FROM public.dream_team_equipos_registrables() r
            UNION
            SELECT d.equipo_id FROM public.dream_team_equipos_director() d) x
     WHERE p_equipo_id IS NULL OR x.equipo_id = p_equipo_id
  );
$function$;

COMMENT ON FUNCTION public.dream_team_puede_registrar_persona(uuid) IS
  'Whether the actor may register a NEW person into the equipo (NULL: into any equipo): '
  'dream_team_equipos_registrables() plus the area director''s subtree (dream_team_equipos_director()).';

REVOKE ALL ON FUNCTION public.dream_team_puede_registrar_persona(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_puede_registrar_persona(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dream_team_opciones_registro()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT coalesce(jsonb_agg(o.opcion ORDER BY o.etiqueta), '[]'::jsonb)
    FROM (
      SELECT concat_ws(' › ', p.label, e.label) AS etiqueta,
             jsonb_build_object(
               'id', e.id,
               'etiqueta', concat_ws(' › ', p.label, e.label),
               'roles', (SELECT jsonb_agg(jsonb_build_object('id', r.id, 'label', r.label) ORDER BY r.label)
                           FROM public.dream_team_roles r
                          WHERE r.equipo_id = e.id AND r.activo)) AS opcion
        FROM (SELECT r.equipo_id FROM public.dream_team_equipos_registrables() r
              UNION
              SELECT d.equipo_id FROM public.dream_team_equipos_director() d) x
        JOIN public.dream_team_equipos e ON e.id = x.equipo_id
        LEFT JOIN public.dream_team_equipos p ON p.id = e.parent_equipo_id
       WHERE EXISTS (SELECT 1 FROM public.dream_team_roles r WHERE r.equipo_id = e.id AND r.activo)
    ) o;
$function$;

COMMENT ON FUNCTION public.dream_team_opciones_registro() IS
  'The equipos (with their active roles) the actor may register a NEW person into, as jsonb '
  '[{id, etiqueta, roles: [{id, label}]}]. Same set as dream_team_puede_registrar_persona().';

REVOKE ALL ON FUNCTION public.dream_team_opciones_registro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_opciones_registro() TO authenticated;

CREATE OR REPLACE FUNCTION public.dream_team_fichas_editables(p_ids uuid[])
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF coalesce(array_length(p_ids, 1), 0) > 2000 THEN
    RAISE EXCEPTION 'demasiados_ids' USING errcode = '22023';
  END IF;
  RETURN QUERY
  SELECT DISTINCT x.id
    FROM unnest(coalesce(p_ids, '{}'::uuid[])) AS x(id)
   WHERE public.dream_team_puede_editar_ficha(x.id);
END;
$function$;

COMMENT ON FUNCTION public.dream_team_fichas_editables(uuid[]) IS
  'The ids among p_ids (max 2000) whose ficha the actor may edit (dream_team_puede_editar_ficha).';

REVOKE ALL ON FUNCTION public.dream_team_fichas_editables(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_fichas_editables(uuid[]) TO authenticated;
