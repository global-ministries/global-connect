-- T2 (odd/tasks/talleres-autoridad-arbol.md), group 1/3 — core: talleres
-- catalog, taller_ediciones, talleres_crecimiento_cohortes, and the
-- talleres_crecimiento.* branches carried on Dream Team's own tables.
--
-- WHY
--   Every one of these policies decided with the UNSCOPED
--   auth_has_talleres_capability(key) — "does this persona hold the
--   capability anywhere", ignoring which org-chart node the row actually
--   belongs to. A director or coordinator granted on one branch (e.g.
--   "Dirección de Conexión") could read and write every OTHER branch's
--   rows too (e.g. DPS/Próximo Paso). participation.read branches are
--   unscoped-by-construction (nobody real holds that capability today,
--   but granting it would expose every branch) and are being removed —
--   real participants are already covered by their own SELF branches.
--
-- WHAT
--   For every branch below, auth_has_talleres_capability('key') becomes
--   auth_has_talleres_capability_scoped('key', <this row's own equipo>):
--     - talleres:                    dream_team_equipo_id (own column)
--     - taller_ediciones (select/update/delete): talleres_equipo_de_edicion(id)
--     - taller_ediciones (insert):    the linked talleres row's equipo
--       (the edición doesn't exist yet, so it resolves through the
--       already-existing taller_id it is about to reference)
--     - talleres_crecimiento_cohortes: dream_team_equipo_id (own column)
--     - dream_team_equipos/roles/servicios (select): id / equipo_id
--     - dream_team_servicios (insert/update): equipo_id
--     - dream_team_estados_historial / participation_eventos / requisitos
--       _verificacion (write): the linked servicio's equipo_id
--   Every dream_team.* branch and every SELF branch is left byte-for-byte
--   identical. participation.read branches are removed from
--   dream_team_equipos_select, dream_team_roles_select and
--   dream_team_servicios_select (the only three that had it in this
--   group; the corresponding talleres.* tables are group 2/3).
--
-- SAFETY
--   ALTER POLICY rewrites USING/WITH CHECK in place — the table is never
--   left without a matching policy for its command. No table, column, or
--   policy is dropped. coordinator.* branches already used the scoped
--   helper before this migration and are repeated here byte-identical
--   (only director.*/admin.manage/lead.*/volunteer.*/metrics.* change).
--
-- ROLLBACK
--   Re-apply each ALTER POLICY below with the pre-migration bodies
--   (auth_has_talleres_capability('key') in place of
--   auth_has_talleres_capability_scoped('key', <resolver>), and restore
--   the removed participation.read branches) via CREATE OR REPLACE /
--   ALTER POLICY.

-- ── talleres (catalog) ───────────────────────────────────────────────

ALTER POLICY talleres_insert_director ON public.talleres
  WITH CHECK (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id));

ALTER POLICY talleres_update_director ON public.talleres
  USING (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id))
  WITH CHECK (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id));

ALTER POLICY talleres_delete_director ON public.talleres
  USING (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id));

-- ── taller_ediciones ─────────────────────────────────────────────────

ALTER POLICY taller_ediciones_insert ON public.taller_ediciones
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_ediciones.taller_id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', (SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.id = taller_ediciones.taller_id))
  );

ALTER POLICY taller_ediciones_update ON public.taller_ediciones
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_edicion(id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_edicion(id))
  )
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_edicion(id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_edicion(id))
  );

ALTER POLICY taller_ediciones_delete ON public.taller_ediciones
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_edicion(id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_edicion(id))
  );

ALTER POLICY taller_ediciones_select ON public.taller_ediciones
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', public.talleres_equipo_de_edicion(id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_edicion(id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', public.talleres_equipo_de_edicion(id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', public.talleres_equipo_de_edicion(id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read', public.talleres_equipo_de_edicion(id))
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read', public.talleres_equipo_de_edicion(id))
    OR ((auth.uid() IS NOT NULL) AND (estado = ANY (ARRAY['abierto'::text, 'en_curso'::text])))
  );

-- ── talleres_crecimiento_cohortes ────────────────────────────────────

ALTER POLICY talleres_crecimiento_cohortes_insert ON public.talleres_crecimiento_cohortes
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', dream_team_equipo_id)
  );

ALTER POLICY talleres_crecimiento_cohortes_update ON public.talleres_crecimiento_cohortes
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', dream_team_equipo_id)
  )
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', dream_team_equipo_id)
  );

ALTER POLICY talleres_crecimiento_cohortes_delete ON public.talleres_crecimiento_cohortes
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', dream_team_equipo_id)
  );

ALTER POLICY talleres_crecimiento_cohortes_select ON public.talleres_crecimiento_cohortes
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read', dream_team_equipo_id)
    OR ((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1 FROM public.taller_ediciones te WHERE ((te.id = talleres_crecimiento_cohortes.taller_id) AND (te.estado = ANY (ARRAY['abierto'::text, 'en_curso'::text]))))))
  );

-- ── Dream Team tables: talleres_crecimiento.* branches -> tree-scoped ──

ALTER POLICY dream_team_equipos_select ON public.dream_team_equipos
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read', id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read', id)
    OR auth_has_dream_team_capability_in_tree('dream_team.org.manage', id)
    OR auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', id)
    OR auth_has_dream_team_capability_in_tree('dream_team.direct', id)
    OR auth_has_dream_team_capability_in_tree('dream_team.coordinate', id)
    OR auth_has_dream_team_capability_in_tree('dream_team.lead', id)
    OR auth_has_dream_team_capability_in_tree('dream_team.serve', id)
    OR auth_has_dream_team_capability_in_tree('dream_team.metrics.read', id)
  );

ALTER POLICY dream_team_roles_select ON public.dream_team_roles
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read', equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.direct', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.coordinate', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.lead', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.serve', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.metrics.read', equipo_id)
  );

ALTER POLICY dream_team_servicios_select ON public.dream_team_servicios
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read', equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.direct', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.coordinate', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.lead', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.metrics.read', equipo_id)
    OR (persona_id = ( SELECT u.id FROM public.usuarios u WHERE (u.auth_id = auth.uid())))
  );

ALTER POLICY dream_team_servicios_insert ON public.dream_team_servicios
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.direct', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
  );

ALTER POLICY dream_team_servicios_update ON public.dream_team_servicios
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.direct', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
  )
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.direct', equipo_id)
    OR auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
  );

ALTER POLICY dream_team_estados_historial_write ON public.dream_team_estados_historial
  WITH CHECK (
    EXISTS ( SELECT 1 FROM public.dream_team_servicios s
      WHERE ((s.id = dream_team_estados_historial.servicio_id) AND (
        public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', s.equipo_id)
        OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', s.equipo_id)
        OR auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', s.equipo_id)
        OR auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id)
        OR auth_has_dream_team_capability_in_tree('dream_team.org.manage', s.equipo_id)
      )))
  );

ALTER POLICY dream_team_participation_eventos_write ON public.dream_team_participation_eventos
  WITH CHECK (
    EXISTS ( SELECT 1 FROM public.dream_team_servicios s
      WHERE ((s.id = dream_team_participation_eventos.servicio_id) AND (
        public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', s.equipo_id)
        OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', s.equipo_id)
        OR auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', s.equipo_id)
        OR auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id)
        OR auth_has_dream_team_capability_in_tree('dream_team.org.manage', s.equipo_id)
      )))
  );

ALTER POLICY dream_team_requisitos_verificacion_write ON public.dream_team_requisitos_verificacion
  WITH CHECK (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    OR (EXISTS ( SELECT 1 FROM public.dream_team_servicios s
      WHERE ((s.id = dream_team_requisitos_verificacion.servicio_id) AND (
        public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', s.equipo_id)
        OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', s.equipo_id)
        OR auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', s.equipo_id)
        OR auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id)
        OR auth_has_dream_team_capability_in_tree('dream_team.org.manage', s.equipo_id)
      ))))
  );
