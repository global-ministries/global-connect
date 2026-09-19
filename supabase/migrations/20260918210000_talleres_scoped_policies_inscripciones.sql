-- T2 (odd/tasks/talleres-autoridad-arbol.md), group 3/3 —
-- taller_inscripciones, taller_asistencias, taller_solicitudes_retiro,
-- taller_reportes, taller_reporte_correcciones, taller_certificados,
-- taller_eventos.
--
-- WHY / WHAT / SAFETY / ROLLBACK: same rationale, shape and guarantees as
-- 20260918190000_talleres_scoped_policies_core.sql.
--   - taller_inscripciones / taller_asistencias: resolved through
--     talleres_equipo_de_cohorte(cohorte_id) / talleres_equipo_de_
--     inscripcion(inscripcion_id) respectively (both pre-existing
--     resolvers). taller_asistencias_select also fixes lead.write ->
--     lead.read: every other select policy in this schema reads with
--     lead.read, every route gate in lib/platform/talleres/route-access.ts
--     requires lead.read to reach a líder screen, and lead.write is
--     already the (unchanged) insert branch — lead.write on select was a
--     copy/paste bug, not an intentional read-with-write-capability
--     design.
--   - taller_solicitudes_retiro: resolved through the pre-existing
--     talleres_equipo_de_solicitud(inscripcion_id, grupo_asignacion_id).
--   - taller_reportes: resolved through talleres_equipo_de_grupo(grupo_id).
--   - taller_reporte_correcciones: this table had NO scoped branch at
--     all (director/admin/coordinator were all unscoped). Adds
--     talleres_equipo_de_reporte(reporte_id) — reporte -> grupo -> equipo,
--     same shape as the other talleres_equipo_de_* resolvers — and scopes
--     every branch through it.
--   - taller_certificados / taller_eventos: both FK taller_id to
--     taller_ediciones(id) (an edición, despite the column name), so both
--     resolve through talleres_equipo_de_edicion(taller_id) /
--     talleres_equipo_de_inscripcion(inscripcion_id). taller_eventos had
--     NO scoped branch at all either (all three were unscoped); all three
--     are scoped here.
-- SELF, PUBLIC (taller_certificados_select_anon) and `false` branches are
-- untouched. participation.read is removed from taller_inscripciones_
-- select and taller_asistencias_select (the only two in this file that
-- had it).
--
-- ROLLBACK: ALTER POLICY back to the pre-migration bodies; DROP FUNCTION
-- talleres_equipo_de_reporte(uuid).

CREATE OR REPLACE FUNCTION public.talleres_equipo_de_reporte(p_reporte_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.talleres_equipo_de_grupo(r.grupo_id)
  FROM public.taller_reportes r
  WHERE r.id = p_reporte_id;
$function$;

GRANT EXECUTE ON FUNCTION public.talleres_equipo_de_reporte(uuid) TO anon, authenticated, postgres, service_role;

-- ── taller_inscripciones ─────────────────────────────────────────────

ALTER POLICY taller_inscripciones_insert ON public.taller_inscripciones
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_cohorte(cohorte_id))
    OR ((estado = 'pendiente'::text)
        AND (persona_principal_id IN ( SELECT usuarios.id FROM public.usuarios WHERE (usuarios.auth_id = auth.uid())))
        AND ((companero_id IS NULL)
             OR ((companero_id <> persona_principal_id)
                 AND (EXISTS ( SELECT 1 FROM public.usuarios u WHERE (u.id = taller_inscripciones.companero_id)))
                 AND (link_type IS NOT NULL)
                 AND (EXISTS ( SELECT 1 FROM public.taller_ediciones te WHERE ((te.id = taller_inscripciones.taller_id) AND (te.tipo = 'pareja'::text))))))
        AND (EXISTS ( SELECT 1 FROM public.taller_ediciones te WHERE ((te.id = taller_inscripciones.taller_id) AND (te.estado = ANY (ARRAY['abierto'::text, 'en_curso'::text])))))
        AND (EXISTS ( SELECT 1 FROM public.talleres_crecimiento_cohortes c WHERE ((c.id = taller_inscripciones.cohorte_id) AND (c.taller_id = taller_inscripciones.taller_id)))))
  );

ALTER POLICY taller_inscripciones_select ON public.taller_inscripciones
  USING (
    (persona_principal_id IN ( SELECT usuarios.id FROM public.usuarios WHERE (usuarios.auth_id = auth.uid())))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read', public.talleres_equipo_de_cohorte(cohorte_id))
  );

ALTER POLICY taller_inscripciones_update ON public.taller_inscripciones
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_cohorte(cohorte_id))
  )
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_cohorte(cohorte_id))
  );

-- ── taller_asistencias ───────────────────────────────────────────────

ALTER POLICY taller_asistencias_insert ON public.taller_asistencias
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_inscripcion(inscripcion_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_inscripcion(inscripcion_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.write', public.talleres_equipo_de_inscripcion(inscripcion_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_inscripcion(inscripcion_id))
  );

ALTER POLICY taller_asistencias_select ON public.taller_asistencias
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', public.talleres_equipo_de_inscripcion(inscripcion_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', public.talleres_equipo_de_inscripcion(inscripcion_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', public.talleres_equipo_de_inscripcion(inscripcion_id))
  );

-- ── taller_solicitudes_retiro ────────────────────────────────────────

ALTER POLICY taller_solicitudes_retiro_insert ON public.taller_solicitudes_retiro
  WITH CHECK (
    (solicitante_persona_id IN ( SELECT usuarios.id FROM public.usuarios WHERE (usuarios.auth_id = auth.uid())))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_solicitud(inscripcion_id, grupo_asignacion_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_solicitud(inscripcion_id, grupo_asignacion_id))
  );

ALTER POLICY taller_solicitudes_retiro_select ON public.taller_solicitudes_retiro
  USING (
    (solicitante_persona_id IN ( SELECT usuarios.id FROM public.usuarios WHERE (usuarios.auth_id = auth.uid())))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', public.talleres_equipo_de_solicitud(inscripcion_id, grupo_asignacion_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_solicitud(inscripcion_id, grupo_asignacion_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', public.talleres_equipo_de_solicitud(inscripcion_id, grupo_asignacion_id))
  );

ALTER POLICY taller_solicitudes_retiro_update ON public.taller_solicitudes_retiro
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_solicitud(inscripcion_id, grupo_asignacion_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_solicitud(inscripcion_id, grupo_asignacion_id))
  )
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_solicitud(inscripcion_id, grupo_asignacion_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_solicitud(inscripcion_id, grupo_asignacion_id))
  );

-- ── taller_reportes ──────────────────────────────────────────────────

ALTER POLICY taller_reportes_insert ON public.taller_reportes
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.write', public.talleres_equipo_de_grupo(grupo_id))
  );

ALTER POLICY taller_reportes_select ON public.taller_reportes
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', public.talleres_equipo_de_grupo(grupo_id))
  );

ALTER POLICY taller_reportes_update ON public.taller_reportes
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.write', public.talleres_equipo_de_grupo(grupo_id))
  )
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.write', public.talleres_equipo_de_grupo(grupo_id))
  );

-- ── taller_reporte_correcciones ──────────────────────────────────────

ALTER POLICY taller_reporte_correcciones_insert ON public.taller_reporte_correcciones
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_reporte(reporte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_reporte(reporte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_reporte(reporte_id))
  );

ALTER POLICY taller_reporte_correcciones_select ON public.taller_reporte_correcciones
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', public.talleres_equipo_de_reporte(reporte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_reporte(reporte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', public.talleres_equipo_de_reporte(reporte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', public.talleres_equipo_de_reporte(reporte_id))
  );

-- ── taller_certificados ──────────────────────────────────────────────

ALTER POLICY taller_certificados_insert ON public.taller_certificados
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_inscripcion(inscripcion_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_inscripcion(inscripcion_id))
  );

ALTER POLICY taller_certificados_select_director ON public.taller_certificados
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', public.talleres_equipo_de_inscripcion(inscripcion_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_inscripcion(inscripcion_id))
  );

ALTER POLICY taller_certificados_update ON public.taller_certificados
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_inscripcion(inscripcion_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_inscripcion(inscripcion_id))
  )
  WITH CHECK (
    (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_inscripcion(inscripcion_id))
     OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_inscripcion(inscripcion_id)))
    AND (revocado_at IS NOT NULL)
  );

-- ── taller_eventos ───────────────────────────────────────────────────

ALTER POLICY taller_eventos_insert ON public.taller_eventos
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_edicion(taller_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_edicion(taller_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_edicion(taller_id))
  );

ALTER POLICY taller_eventos_select ON public.taller_eventos
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', public.talleres_equipo_de_edicion(taller_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_edicion(taller_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', public.talleres_equipo_de_edicion(taller_id))
  );
