-- CIMIENTO 3a — Real per-taller SCOPE for the coordinador role (RLS layer).
--
-- WHAT
--   The flat gate auth_has_talleres_capability(text) has NO scope predicate, so
--   every coordinator.read / coordinator.write term unlocks ALL talleres. This
--   migration:
--     1. adds a SCOPED gate auth_has_talleres_capability_scoped(text, uuid) that
--        also matches the grant's scope_id (NULL scope_id = global ⇒ Director
--        General still passes; a scoped coordinador is confined to its equipo).
--     2. adds row→equipo resolvers so each policy can compute the equipo of the
--        row it is gating.
--     3. rewrites ONLY the coordinator term of the 8 SELECT policies and every
--        INSERT/UPDATE policy that carries coordinator.write, swapping the flat
--        gate for the scoped gate. Every OTHER OR-term (director.*, admin.manage,
--        lead.*, volunteer.read, participation.read, metrics.read, and the
--        self-row terms) is left byte-identical.
--
-- SAFETY
--   * Additive / forward-only. Functions via CREATE OR REPLACE; policies via
--     ALTER POLICY (NOT drop+create) — there is never a window where a policy is
--     absent, and cmd / roles / permissive stay untouched. No DROP, no DELETE.
--   * Idempotent: re-running sets the same function bodies and the same policy
--     expressions again — zero net change.
--   * Zero live impact: prod has 0 servicios ⇒ 0 coordinator grants, so
--     tightening coordinator.* changes nothing for current users. This hardens
--     the gate BEFORE the first coordinador is ever activated (Cimiento 4).
--   * No RLS recursion: the resolvers and the scoped gate are SECURITY DEFINER
--     owned by the table owner, so their internal reads bypass RLS — calling
--     talleres_equipo_de_cohorte() from inside talleres_crecimiento_cohortes'
--     own policy does not re-trigger that policy. Same mechanism the existing
--     flat gate relies on.
--
-- ROLLBACK
--   For any policy, ALTER POLICY … back to the flat term, e.g.
--     ALTER POLICY taller_grupos_select ON public.taller_grupos
--       USING (… OR auth_has_talleres_capability('talleres_crecimiento.coordinator.read'::text) OR …);
--   and DROP the 5 helper functions if desired.

-- ===========================================================================
-- 1. Helper functions (additive). STABLE SECURITY DEFINER, search_path=public.
-- ===========================================================================

-- Scoped gate: like the flat gate, plus scope match. scope_id IS NULL = global
-- grant (Director General). p_equipo_id NULL ⇒ scoped grants fail closed.
CREATE OR REPLACE FUNCTION public.auth_has_talleres_capability_scoped(
  p_capability_key text,
  p_equipo_id uuid
)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.dream_team_capability_grants g
    INNER JOIN public.usuarios u ON u.id = g.persona_id
    WHERE u.auth_id = auth.uid()
      AND g.capability_key = p_capability_key
      AND g.revoked_at IS NULL
      AND (g.scope_id IS NULL OR g.scope_id = p_equipo_id::text)
  );
$function$;

-- cohorte → equipo (direct NOT NULL column).
CREATE OR REPLACE FUNCTION public.talleres_equipo_de_cohorte(p_cohorte_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.dream_team_equipo_id
  FROM public.talleres_crecimiento_cohortes c
  WHERE c.id = p_cohorte_id;
$function$;

-- grupo → cohorte → equipo (both links NOT NULL).
CREATE OR REPLACE FUNCTION public.talleres_equipo_de_grupo(p_grupo_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.dream_team_equipo_id
  FROM public.taller_grupos g
  JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
  WHERE g.id = p_grupo_id;
$function$;

-- inscripcion → cohorte → equipo (inscripciones.cohorte_id is a direct NOT NULL
-- FK, so no fallback is needed here).
CREATE OR REPLACE FUNCTION public.talleres_equipo_de_inscripcion(p_inscripcion_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.dream_team_equipo_id
  FROM public.taller_inscripciones i
  JOIN public.talleres_crecimiento_cohortes c ON c.id = i.cohorte_id
  WHERE i.id = p_inscripcion_id;
$function$;

-- solicitud_retiro → equipo. Its inscripcion_id AND grupo_asignacion_id are both
-- nullable (the only nullable linking columns in the domain), so COALESCE both
-- paths; if both are NULL the equipo is NULL ⇒ a scoped coordinador fails closed
-- (director/admin still pass via their flat terms). 0 such rows in prod today.
CREATE OR REPLACE FUNCTION public.talleres_equipo_de_solicitud(
  p_inscripcion_id uuid,
  p_grupo_asignacion_id uuid
)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    public.talleres_equipo_de_inscripcion(p_inscripcion_id),
    (
      SELECT c.dream_team_equipo_id
      FROM public.taller_grupo_asignaciones ga
      JOIN public.taller_grupos g ON g.id = ga.grupo_id
      JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
      WHERE ga.id = p_grupo_asignacion_id
    )
  );
$function$;

-- EXECUTE grants mirror the flat gate (authenticated, service_role; postgres owns).
-- Functions referenced by policies must be executable by the invoking role or
-- RLS evaluation errors with "permission denied for function".
GRANT EXECUTE ON FUNCTION public.auth_has_talleres_capability_scoped(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.talleres_equipo_de_cohorte(uuid)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.talleres_equipo_de_grupo(uuid)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.talleres_equipo_de_inscripcion(uuid)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.talleres_equipo_de_solicitud(uuid, uuid)        TO authenticated, service_role;

-- ===========================================================================
-- 2. SELECT policies (8) — swap ONLY the coordinator.read term.
-- ===========================================================================

ALTER POLICY talleres_crecimiento_cohortes_select ON public.talleres_crecimiento_cohortes
USING (
  auth_has_talleres_capability('talleres_crecimiento.director.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, dream_team_equipo_id)
  OR auth_has_talleres_capability('talleres_crecimiento.lead.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.volunteer.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.participation.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.metrics.read'::text)
);

ALTER POLICY taller_inscripciones_select ON public.taller_inscripciones
USING (
  (persona_principal_id IN ( SELECT usuarios.id FROM usuarios WHERE (usuarios.auth_id = auth.uid())))
  OR auth_has_talleres_capability('talleres_crecimiento.director.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, talleres_equipo_de_cohorte(cohorte_id))
  OR auth_has_talleres_capability('talleres_crecimiento.lead.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.volunteer.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.participation.read'::text)
);

ALTER POLICY taller_grupos_select ON public.taller_grupos
USING (
  auth_has_talleres_capability('talleres_crecimiento.director.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, talleres_equipo_de_cohorte(cohorte_id))
  OR auth_has_talleres_capability('talleres_crecimiento.lead.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.volunteer.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.participation.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.metrics.read'::text)
);

ALTER POLICY taller_reportes_select ON public.taller_reportes
USING (
  auth_has_talleres_capability('talleres_crecimiento.director.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, talleres_equipo_de_grupo(grupo_id))
  OR auth_has_talleres_capability('talleres_crecimiento.lead.read'::text)
);

ALTER POLICY taller_sesiones_select ON public.taller_sesiones
USING (
  auth_has_talleres_capability('talleres_crecimiento.director.read'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, talleres_equipo_de_grupo(grupo_id))
  OR auth_has_talleres_capability('talleres_crecimiento.lead.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.volunteer.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.participation.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.metrics.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
);

ALTER POLICY taller_asistencias_select ON public.taller_asistencias
USING (
  auth_has_talleres_capability('talleres_crecimiento.director.read'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, talleres_equipo_de_inscripcion(inscripcion_id))
  OR auth_has_talleres_capability('talleres_crecimiento.lead.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.participation.read'::text)
);

ALTER POLICY taller_grupo_asignaciones_select ON public.taller_grupo_asignaciones
USING (
  (persona_id IN ( SELECT usuarios.id FROM usuarios WHERE (usuarios.auth_id = auth.uid())))
  OR auth_has_talleres_capability('talleres_crecimiento.director.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, talleres_equipo_de_grupo(grupo_id))
  OR auth_has_talleres_capability('talleres_crecimiento.lead.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.volunteer.read'::text)
);

ALTER POLICY taller_solicitudes_retiro_select ON public.taller_solicitudes_retiro
USING (
  (solicitante_persona_id IN ( SELECT usuarios.id FROM usuarios WHERE (usuarios.auth_id = auth.uid())))
  OR auth_has_talleres_capability('talleres_crecimiento.director.read'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, talleres_equipo_de_solicitud(inscripcion_id, grupo_asignacion_id))
);

-- ===========================================================================
-- 3. INSERT / UPDATE policies carrying coordinator.write — swap ONLY that term.
--    (taller_asistencias_update/_delete = false, taller_solicitudes_retiro
--     insert/update have NO coordinator.write ⇒ intentionally NOT touched.)
-- ===========================================================================

-- talleres_crecimiento_cohortes (equipo = direct column)
ALTER POLICY talleres_crecimiento_cohortes_insert ON public.talleres_crecimiento_cohortes
WITH CHECK (
  auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, dream_team_equipo_id)
);

ALTER POLICY talleres_crecimiento_cohortes_update ON public.talleres_crecimiento_cohortes
USING (
  auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, dream_team_equipo_id)
)
WITH CHECK (
  auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, dream_team_equipo_id)
);

-- taller_inscripciones (equipo = equipo_de_cohorte(cohorte_id)).
-- INSERT: swap ONLY the leading coordinator.write; the participant self-enroll
-- branch is preserved verbatim.
ALTER POLICY taller_inscripciones_insert ON public.taller_inscripciones
WITH CHECK (
  auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_cohorte(cohorte_id))
  OR auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR (auth_has_talleres_capability('talleres_crecimiento.participation.read'::text) AND (estado = 'pendiente'::text) AND (persona_principal_id IN ( SELECT usuarios.id FROM usuarios WHERE (usuarios.auth_id = auth.uid()))) AND ((companero_id IS NULL) OR ((companero_id <> persona_principal_id) AND (EXISTS ( SELECT 1 FROM usuarios u WHERE (u.id = taller_inscripciones.companero_id))) AND (link_type IS NOT NULL) AND (EXISTS ( SELECT 1 FROM taller_ediciones te WHERE ((te.id = taller_inscripciones.taller_id) AND (te.tipo = 'pareja'::text)))))))
);

ALTER POLICY taller_inscripciones_update ON public.taller_inscripciones
USING (
  auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_cohorte(cohorte_id))
  OR auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
)
WITH CHECK (
  auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_cohorte(cohorte_id))
  OR auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
);

-- taller_grupos (equipo = equipo_de_cohorte(cohorte_id))
ALTER POLICY taller_grupos_insert ON public.taller_grupos
WITH CHECK (
  auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_cohorte(cohorte_id))
);

ALTER POLICY taller_grupos_update ON public.taller_grupos
USING (
  auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_cohorte(cohorte_id))
)
WITH CHECK (
  auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_cohorte(cohorte_id))
);

-- taller_reportes (equipo = equipo_de_grupo(grupo_id))
ALTER POLICY taller_reportes_insert ON public.taller_reportes
WITH CHECK (
  auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_grupo(grupo_id))
  OR auth_has_talleres_capability('talleres_crecimiento.lead.write'::text)
);

ALTER POLICY taller_reportes_update ON public.taller_reportes
USING (
  auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_grupo(grupo_id))
  OR auth_has_talleres_capability('talleres_crecimiento.lead.write'::text)
)
WITH CHECK (
  auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_grupo(grupo_id))
  OR auth_has_talleres_capability('talleres_crecimiento.lead.write'::text)
);

-- taller_grupo_asignaciones (equipo = equipo_de_grupo(grupo_id))
ALTER POLICY taller_grupo_asignaciones_insert ON public.taller_grupo_asignaciones
WITH CHECK (
  auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_grupo(grupo_id))
);

ALTER POLICY taller_grupo_asignaciones_update ON public.taller_grupo_asignaciones
USING (
  auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_grupo(grupo_id))
)
WITH CHECK (
  auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_grupo(grupo_id))
);

-- taller_asistencias (equipo = equipo_de_inscripcion(inscripcion_id); INSERT only)
ALTER POLICY taller_asistencias_insert ON public.taller_asistencias
WITH CHECK (
  auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_inscripcion(inscripcion_id))
  OR auth_has_talleres_capability('talleres_crecimiento.lead.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
);

-- taller_sesiones (equipo = equipo_de_grupo(grupo_id)).
-- _update carries coordinator.write ONLY in USING; its WITH CHECK is `true` and
-- is left unchanged (ALTER POLICY only touches the clause specified).
ALTER POLICY taller_sesiones_insert ON public.taller_sesiones
WITH CHECK (
  auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_grupo(grupo_id))
  OR auth_has_talleres_capability('talleres_crecimiento.lead.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
);

ALTER POLICY taller_sesiones_update ON public.taller_sesiones
USING (
  auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_grupo(grupo_id))
  OR auth_has_talleres_capability('talleres_crecimiento.lead.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
);
