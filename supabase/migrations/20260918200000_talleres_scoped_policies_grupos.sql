-- T2 (odd/tasks/talleres-autoridad-arbol.md), group 2/3 — taller_grupos,
-- taller_grupo_asignaciones, taller_sesiones.
--
-- WHY / WHAT / SAFETY / ROLLBACK: same rationale, shape and guarantees as
-- 20260918190000_talleres_scoped_policies_core.sql. director.*/admin.
-- manage/lead.*/volunteer.*/metrics.read branches move from the unscoped
-- auth_has_talleres_capability('key') to auth_has_talleres_capability_
-- scoped('key', talleres_equipo_de_grupo(grupo_id)) (this row's own
-- equipo, through its grupo). coordinator.* branches already used the
-- scoped helper and are repeated byte-identical. participation.read is
-- removed from every select policy in this file. SELF and false branches
-- are untouched. Rollback: ALTER POLICY back to the pre-migration bodies
-- (unscoped calls, participation.read restored).

-- ── taller_grupos ────────────────────────────────────────────────────

ALTER POLICY taller_grupos_insert ON public.taller_grupos
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_cohorte(cohorte_id))
  );

ALTER POLICY taller_grupos_update ON public.taller_grupos
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_cohorte(cohorte_id))
  )
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_cohorte(cohorte_id))
  );

ALTER POLICY taller_grupos_delete ON public.taller_grupos
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_cohorte(cohorte_id))
  );

ALTER POLICY taller_grupos_select ON public.taller_grupos
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read', public.talleres_equipo_de_cohorte(cohorte_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read', public.talleres_equipo_de_cohorte(cohorte_id))
  );

-- ── taller_grupo_asignaciones ────────────────────────────────────────

ALTER POLICY taller_grupo_asignaciones_insert ON public.taller_grupo_asignaciones
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_grupo(grupo_id))
  );

ALTER POLICY taller_grupo_asignaciones_update ON public.taller_grupo_asignaciones
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_grupo(grupo_id))
  )
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_grupo(grupo_id))
  );

ALTER POLICY taller_grupo_asignaciones_delete ON public.taller_grupo_asignaciones
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(grupo_id))
  );

ALTER POLICY taller_grupo_asignaciones_select ON public.taller_grupo_asignaciones
  USING (
    (persona_id IN ( SELECT usuarios.id FROM public.usuarios WHERE (usuarios.auth_id = auth.uid())))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read', public.talleres_equipo_de_grupo(grupo_id))
  );

-- ── taller_sesiones ──────────────────────────────────────────────────

ALTER POLICY taller_sesiones_insert ON public.taller_sesiones
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(grupo_id))
  );

-- WITH CHECK is intentionally left as `true` (unchanged) — it was never a
-- U-branch, it never referenced auth_has_talleres_capability at all.
ALTER POLICY taller_sesiones_update ON public.taller_sesiones
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.write', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(grupo_id))
  );

ALTER POLICY taller_sesiones_select ON public.taller_sesiones
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read', public.talleres_equipo_de_grupo(grupo_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(grupo_id))
  );
