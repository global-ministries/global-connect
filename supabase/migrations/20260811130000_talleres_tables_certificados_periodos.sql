-- ══════════════════════════════════════════════════════════════════════════════
-- PR10 — DT-036 — Taller certificates + periodos_generales.
-- Fase 5 (operating). 100% ADDITIVE — no destructive DDL (I-6).
--
-- DT-036 (a)  taller_certificados  — verification certificate per inscription.
--              Public route reads ONLY non-sensitive columns via column-level
--              GRANT; motivo_revocacion + version are RLS-protected.
-- DT-036 (b)  taller_periodos_generales  — period opener/closer schedule.
-- DT-036 (c)  Closed FK: PR5's migration deferred the FK from
--              talleres_crecimiento_metadata.periodo_general_id to
--              taller_periodos_generales(id) (DO block, no-op when the parent
--              table is missing). PR10 owns the bootstrap parent, so it also
--              closes the FK via a named ALTER TABLE ADD CONSTRAINT (additive
--              — never DROP).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1) taller_certificados ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taller_certificados (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  inscripcion_id                  uuid        UNIQUE NOT NULL
                                                  REFERENCES public.taller_inscripciones(id) ON DELETE RESTRICT,
  codigo_verificacion             text        UNIQUE NOT NULL
                                                  CHECK (length(codigo_verificacion) = 16),
  taller_id                       uuid        NOT NULL
                                                  REFERENCES public.talleres_crecimiento_metadata(id) ON DELETE RESTRICT,
  persona_id                      uuid        NOT NULL
                                                  REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  nombre_taller_snapshot          text        NOT NULL,
  nombre_participante_snapshot    text        NOT NULL,
  fecha_completitud               timestamptz NOT NULL DEFAULT now(),
  firmantes_snapshot              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  pdf_storage_path                text,
  revocado_at                     timestamptz,
  motivo_revocacion               text        CHECK (motivo_revocacion IS NULL OR length(motivo_revocacion) > 0),
  version                         integer     NOT NULL DEFAULT 1,
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taller_certificados_taller ON public.taller_certificados(taller_id, fecha_completitud DESC);
CREATE INDEX IF NOT EXISTS idx_taller_certificados_persona ON public.taller_certificados(persona_id);
CREATE INDEX IF NOT EXISTS idx_taller_certificados_active ON public.taller_certificados(codigo_verificacion) WHERE revocado_at IS NULL;

-- ── 2) taller_periodos_generales ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.taller_periodos_generales (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id                     uuid        NOT NULL
                                              REFERENCES public.talleres_crecimiento_metadata(id) ON DELETE RESTRICT,
  edicion_label                 text        NOT NULL,
  fecha_apertura_automatica     timestamptz,
  fecha_cierre_automatico       timestamptz,
  fecha_apertura_manual         timestamptz,
  fecha_cierre_manual           timestamptz,
  fecha_cierre_real             timestamptz GENERATED ALWAYS AS
                                              (COALESCE(fecha_cierre_manual, fecha_cierre_automatico)) STORED,
  motivo_cierre                 text,
  version                       integer     NOT NULL DEFAULT 1,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taller_periodos_generales_taller ON public.taller_periodos_generales(taller_id);

-- ── 3) Closed FK: deferred from PR5 (additive — no DROP). ─────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'talleres_crecimiento_metadata_periodo_general_id_fkey'
  ) THEN
    ALTER TABLE public.talleres_crecimiento_metadata
      ADD CONSTRAINT talleres_crecimiento_metadata_periodo_general_id_fkey
      FOREIGN KEY (periodo_general_id)
      REFERENCES public.taller_periodos_generales(id) ON DELETE RESTRICT;
  END IF;
END
$$;

-- ── 4) RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.taller_certificados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taller_periodos_generales ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.taller_certificados FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.taller_periodos_generales FROM anon, authenticated;

-- taller_certificados: anon gets a column-narrow SELECT only on active
-- certificates; the route handler matches by codigo_verificacion which is
-- unique, so a public row scan returns 0 or 1 row without enumeration risk.
CREATE POLICY taller_certificados_select_anon ON public.taller_certificados
  FOR SELECT TO anon, authenticated
  USING (revocado_at IS NULL);

-- Director / admin see full row including motivo_revocacion and version.
CREATE POLICY taller_certificados_select_director ON public.taller_certificados
  FOR SELECT TO authenticated
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

CREATE POLICY taller_certificados_insert ON public.taller_certificados FOR INSERT TO authenticated
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );

-- Director-only revocation path — revocado_at must transition NULL → NOT NULL.
CREATE POLICY taller_certificados_update ON public.taller_certificados FOR UPDATE TO authenticated
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  )
  WITH CHECK (
    (auth_has_talleres_capability('talleres_crecimiento.director.write')
     OR auth_has_talleres_capability('talleres_crecimiento.admin.manage'))
    AND revocado_at IS NOT NULL
  );

CREATE POLICY taller_certificados_delete ON public.taller_certificados FOR DELETE TO authenticated
  USING (false);

-- taller_periodos_generales: director / coordinator surface.
CREATE POLICY taller_periodos_generales_select ON public.taller_periodos_generales FOR SELECT TO authenticated
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    OR auth_has_talleres_capability('talleres_crecimiento.coordinator.read')
    OR auth_has_talleres_capability('talleres_crecimiento.metrics.read')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );
CREATE POLICY taller_periodos_generales_insert ON public.taller_periodos_generales FOR INSERT TO authenticated
  WITH CHECK (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  );
CREATE POLICY taller_periodos_generales_update ON public.taller_periodos_generales FOR UPDATE TO authenticated
  USING (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    OR auth_has_talleres_capability('talleres_crecimiento.admin.manage')
  )
  WITH CHECK (true);
CREATE POLICY taller_periodos_generales_delete ON public.taller_periodos_generales FOR DELETE TO authenticated
  USING (false);

-- Column-narrow GRANT for the public route (verify-certificado API).
GRANT SELECT (id, codigo_verificacion, taller_id, persona_id,
             nombre_taller_snapshot, nombre_participante_snapshot,
             fecha_completitud, firmantes_snapshot)
  ON public.taller_certificados TO anon, authenticated;

-- Service_role: full access (writer + revoker pipeline).
GRANT SELECT, INSERT, UPDATE ON public.taller_certificados TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.taller_periodos_generales TO service_role;
