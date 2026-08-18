-- ════════════════════════════════════════════════════════════════════
-- PR41 — Permitir auto-inscripción de participantes a talleres.
--
-- Decisión de negocio: el participante crea su propia inscripción con
-- estado='pendiente'; un coordinador la aprueba después. La policy
-- original (20260810140000_talleres_tables_inscripciones_grupos.sql)
-- solo permitía alta operativa (coordinator.write OR director.write OR
-- admin.manage); el participante con participation.read no podía crear
-- su inscripción, contradiciendo el flujo de la UI en /talleres/explorar
-- (botón "+ Inscribirme" → server action → INSERT que el RLS rebotaba).
--
-- Auto-inscripción tiene tres guardas para que un participante NO pueda
-- impersonar a otros:
--   1. persona_principal_id debe matchear el usuarios.id cuyo
--      auth_id = auth.uid() (no puede inscribirse a nombre de otro).
--   2. estado debe ser 'pendiente' (no puede auto-aprobarse).
--   3. companero_id IS NULL (no puede crear una inscripción de pareja
--      vía self-service; las parejas las inscribe el coordinador).
--
-- El policy SELECT existente sigue intacto (persona_principal_id IN
-- (SELECT id FROM public.usuarios WHERE auth_id = auth.uid()) OR
-- capability), por lo que el participante podrá ver su nueva fila
-- inmediatamente después del INSERT.
-- ════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "taller_inscripciones_insert" ON public.taller_inscripciones;

CREATE POLICY "taller_inscripciones_insert"
  ON public.taller_inscripciones
  FOR INSERT
  WITH CHECK (
    -- Alta operativa: coordinador/director/admin pueden inscribir a
    -- cualquiera en cualquier estado (canonical: la pareja la inscribe
    -- el coordinador, no el participante).
    auth_has_talleres_capability('talleres_crecimiento.coordinator.write'::text)
    OR auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
    -- Auto-inscripción del participante: solo su propia persona, solo
    -- estado pendiente, sin compañero.
    OR (
      auth_has_talleres_capability('talleres_crecimiento.participation.read'::text)
      AND estado = 'pendiente'
      AND persona_principal_id IN (
        SELECT id FROM public.usuarios WHERE auth_id = auth.uid()
      )
      AND companero_id IS NULL
    )
  );
