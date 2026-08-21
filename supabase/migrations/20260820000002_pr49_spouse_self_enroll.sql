-- ════════════════════════════════════════════════════════════════════
-- PR49 (restructure PR G) — Auto-inscripción de cónyuge (pareja).
--
-- Decisión de negocio (roadmap Fase 5, paridad con Grupos de Vida + auto-
-- inscripción): para un taller `tipo='pareja'` el participante debe poder
-- inscribir a su cónyuge en el mismo acto, no solo el coordinador. PR41
-- (20260817150000_allow_participant_self_enroll.sql) abrió la auto-
-- inscripción del participante pero con `companero_id IS NULL` obligatorio,
-- bloqueando la unidad-pareja por self-service.
--
-- Este migration REEMPLAZA (forward-only) la policy
-- `taller_inscripciones_insert`:
--   • La rama OPERATIVA (coordinator/director/admin) se preserva textual.
--   • La rama del PARTICIPANTE conserva sus tres guardas de identidad
--     (participation.read + estado='pendiente' + persona propia) y solo
--     amplía `companero_id`:
--       companero_id IS NULL                          -- individual, o
--       OR (
--         companero_id <> persona_principal_id         -- no uno mismo
--         AND EXISTS(companero_id ∈ usuarios)          -- persona real
--         AND link_type IS NOT NULL                    -- forma de pareja
--         AND EXISTS(taller_ediciones.tipo='pareja')   -- el taller lo admite
--       )
--
-- R9 — NO se verifica el vínculo matrimonial en la DB (no hay tabla de
-- relaciones canónica y forzarla acá sería frágil). El trigger BEFORE
-- `trg_taller_inscripciones_couple_unit` sigue garantizando la invariante
-- link_type ⇔ companero_id; esta policy solo autoriza el INSERT.
--
-- La correlación con la edición se escribe como
-- `te.id = taller_inscripciones.taller_id` (calificada) para que enlace de
-- forma inequívoca con la NUEVA fila de inscripción, aun si la tabla de
-- ocurrencia adquiriera en el futuro su propia columna `taller_id`.
--
-- El policy SELECT existente sigue intacto, por lo que el participante
-- verá su fila inmediatamente después del INSERT.
--
-- LIVE PRODUCTION — additivo + forward-only. Swap de policy vía
-- DROP POLICY + CREATE POLICY; sin DDL destructivo sobre tablas de datos.
-- ════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "taller_inscripciones_insert" ON public.taller_inscripciones;

CREATE POLICY "taller_inscripciones_insert"
  ON public.taller_inscripciones
  FOR INSERT
  WITH CHECK (
    -- Alta operativa: coordinador/director/admin pueden inscribir a
    -- cualquiera en cualquier estado (rama preservada de PR41).
    auth_has_talleres_capability('talleres_crecimiento.coordinator.write'::text)
    OR auth_has_talleres_capability('talleres_crecimiento.director.write'::text)
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'::text)
    -- Auto-inscripción del participante: solo su propia persona, solo
    -- estado pendiente. El compañero se admite para talleres de pareja.
    OR (
      auth_has_talleres_capability('talleres_crecimiento.participation.read'::text)
      AND estado = 'pendiente'
      AND persona_principal_id IN (
        SELECT id FROM public.usuarios WHERE auth_id = auth.uid()
      )
      AND (
        -- Individual: sin compañero (rama original de PR41).
        companero_id IS NULL
        OR (
          -- Pareja: el participante inscribe a su cónyuge. Guardas:
          --   1. no puede ser uno mismo,
          --   2. el compañero debe ser un usuario real,
          --   3. link_type presente (forma de unidad-pareja),
          --   4. la edición objetivo debe ser tipo='pareja'.
          -- El vínculo (matrimonio/novios) NO se valida en DB (R9).
          companero_id <> persona_principal_id
          AND EXISTS (
            SELECT 1
            FROM public.usuarios u
            WHERE u.id = taller_inscripciones.companero_id
          )
          AND link_type IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.taller_ediciones te
            WHERE te.id = taller_inscripciones.taller_id
              AND te.tipo = 'pareja'
          )
        )
      )
    )
  );
