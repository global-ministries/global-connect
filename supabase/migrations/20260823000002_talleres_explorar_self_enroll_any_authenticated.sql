-- Captured from STAGING (supabase_migrations.schema_migrations, version
-- 20260824013739, name talleres_explorar_self_enroll_any_authenticated).
-- It was applied to staging by hand and never committed; this file restores
-- it under the name its own body cites. The statements below are verbatim.
-- Not yet applied to production.

-- Finding #1 (Option B) — open /talleres/explorar to ANY authenticated user.
-- (see supabase/migrations/20260823000002_talleres_explorar_self_enroll_any_authenticated.sql
--  for full rationale, security-wall notes and rollback instructions.)

DROP POLICY IF EXISTS taller_ediciones_select ON public.taller_ediciones;
CREATE POLICY taller_ediciones_select ON public.taller_ediciones
  AS PERMISSIVE FOR SELECT TO public
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.read'::text)
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.read'::text)
    OR auth_has_talleres_capability('talleres_crecimiento.lead.read'::text)
    OR auth_has_talleres_capability('talleres_crecimiento.volunteer.read'::text)
    OR auth_has_talleres_capability('talleres_crecimiento.participation.read'::text)
    OR auth_has_talleres_capability('talleres_crecimiento.metrics.read'::text)
    OR (auth.uid() IS NOT NULL AND estado = ANY (ARRAY['abierto'::text, 'en_curso'::text]))
  );

DROP POLICY IF EXISTS talleres_crecimiento_cohortes_select ON public.talleres_crecimiento_cohortes;
CREATE POLICY talleres_crecimiento_cohortes_select ON public.talleres_crecimiento_cohortes
  AS PERMISSIVE FOR SELECT TO public
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.read'::text)
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
    OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, dream_team_equipo_id)
    OR auth_has_talleres_capability('talleres_crecimiento.lead.read'::text)
    OR auth_has_talleres_capability('talleres_crecimiento.volunteer.read'::text)
    OR auth_has_talleres_capability('talleres_crecimiento.participation.read'::text)
    OR auth_has_talleres_capability('talleres_crecimiento.metrics.read'::text)
    OR (auth.uid() IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.taller_ediciones te
          WHERE te.id = talleres_crecimiento_cohortes.taller_id
            AND te.estado = ANY (ARRAY['abierto'::text, 'en_curso'::text])
       ))
  );

DROP POLICY IF EXISTS taller_inscripciones_insert ON public.taller_inscripciones;
CREATE POLICY taller_inscripciones_insert ON public.taller_inscripciones
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_cohorte(cohorte_id))
    OR auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
    OR (
      (estado = 'pendiente'::text)
      AND (persona_principal_id IN ( SELECT usuarios.id
                                       FROM usuarios
                                      WHERE (usuarios.auth_id = auth.uid())))
      AND ((companero_id IS NULL)
           OR ((companero_id <> persona_principal_id)
               AND (EXISTS ( SELECT 1
                               FROM usuarios u
                              WHERE (u.id = taller_inscripciones.companero_id)))
               AND (link_type IS NOT NULL)
               AND (EXISTS ( SELECT 1
                               FROM taller_ediciones te
                              WHERE ((te.id = taller_inscripciones.taller_id)
                                     AND (te.tipo = 'pareja'::text))))))
    )
  );
