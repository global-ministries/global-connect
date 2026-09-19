-- Talleres self-enroll — require an inscribible edicion and a cohorte that
-- belongs to it (taller_inscripciones_insert).
--
-- WHY
--   The self-enroll branch of taller_inscripciones_insert (opened by
--   20260817150000 and widened by later PRs) only checks estado='pendiente',
--   persona_principal_id = caller, and the companero/pareja shape. It never
--   checks that the target edicion (taller_id) is actually open for
--   enrollment, nor that the cohorte_id belongs to that same edicion. A
--   member could self-enroll into a 'borrador', 'cerrado' or 'cancelado'
--   edicion, or pair an open edicion's taller_id with a cohorte that
--   belongs to a different edicion entirely — which would land the
--   inscripcion in the wrong coordinator's queue.
--
-- WHAT THIS CLOSES
--   Adds two guards to ONLY the self-enroll branch of the OR (the
--   coordinator.write / director.write / admin.manage branches, and every
--   other clause already in the self branch, are left byte-identical):
--     1. the edicion referenced by taller_id has
--        estado IN ('abierto', 'en_curso') — the same "inscribible" set the
--        app's own /talleres/explorar screen already filters on
--        (20260823000002), so the button and the database now agree.
--     2. cohorte_id belongs to that same edicion
--        (talleres_crecimiento_cohortes.taller_id = taller_inscripciones.taller_id).
--
-- SAFETY
--   Additive / forward-only. Policy rewrite via ALTER POLICY (not
--   DROP+CREATE) — there is never a window where the policy is absent, and
--   cmd / roles / permissive stay untouched. Idempotent: re-running sets the
--   same WITH CHECK expression again, zero net change. No DROP, no DELETE,
--   no data-table writes.
--
-- ROLLBACK
--   ALTER POLICY taller_inscripciones_insert ON public.taller_inscripciones
--   WITH CHECK (
--     auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_cohorte(cohorte_id))
--     OR auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
--     OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
--     OR (
--       (estado = 'pendiente'::text)
--       AND (persona_principal_id IN ( SELECT usuarios.id FROM usuarios WHERE (usuarios.auth_id = auth.uid())))
--       AND ((companero_id IS NULL) OR ((companero_id <> persona_principal_id) AND (EXISTS ( SELECT 1 FROM usuarios u WHERE (u.id = taller_inscripciones.companero_id))) AND (link_type IS NOT NULL) AND (EXISTS ( SELECT 1 FROM taller_ediciones te WHERE ((te.id = taller_inscripciones.taller_id) AND (te.tipo = 'pareja'::text))))))
--     )
--   );

ALTER POLICY taller_inscripciones_insert ON public.taller_inscripciones
WITH CHECK (
  auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_cohorte(cohorte_id))
  OR auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
  OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
  OR (
    (estado = 'pendiente'::text)
    AND (persona_principal_id IN ( SELECT usuarios.id FROM usuarios WHERE (usuarios.auth_id = auth.uid())))
    AND ((companero_id IS NULL) OR ((companero_id <> persona_principal_id) AND (EXISTS ( SELECT 1 FROM usuarios u WHERE (u.id = taller_inscripciones.companero_id))) AND (link_type IS NOT NULL) AND (EXISTS ( SELECT 1 FROM taller_ediciones te WHERE ((te.id = taller_inscripciones.taller_id) AND (te.tipo = 'pareja'::text))))))
    AND (EXISTS ( SELECT 1 FROM taller_ediciones te WHERE ((te.id = taller_inscripciones.taller_id) AND (te.estado = ANY (ARRAY['abierto'::text, 'en_curso'::text])))))
    AND (EXISTS ( SELECT 1 FROM talleres_crecimiento_cohortes c WHERE ((c.id = taller_inscripciones.cohorte_id) AND (c.taller_id = taller_inscripciones.taller_id))))
  )
);
