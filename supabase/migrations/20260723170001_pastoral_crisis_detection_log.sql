-- ══════════════════════════════════════════════════════════════════════════════
-- W09 — DT-051 — M7: Pastoral crisis detection log
--
-- Tabla: pastoral_crisis_detection_log
-- PK idempotente: (one_on_one_id, categoria, detected_at_minute)
--   donde detected_at_minute = date_trunc('minute', detected_at)
--   → Re-intentar el mismo scan en el mismo minuto = mismo one_on_one
--     no produce fila duplicada (D28 idempotency).
--
-- RLS: readonly para pastoral.read.all (service_role bypass).
-- ZERO DDL destructivo.
-- REGLA: auth.uid() en policies.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Tabla ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pastoral_crisis_detection_log (
  id                  uuid    NOT NULL DEFAULT gen_random_uuid(),
  one_on_one_id       uuid    NOT NULL,
  categoria           text    NOT NULL,
  keyword             text    NOT NULL,
  actor_persona_id    uuid    NOT NULL,
  detected_at         timestamptz NOT NULL DEFAULT now(),
  detected_at_minute  timestamptz NOT NULL,
  scan_resumen        boolean NOT NULL DEFAULT false,
  scan_nota_id        uuid    DEFAULT NULL,

  -- PK idempotente: mismo one_on_one + categoria + minuto = reúso
  CONSTRAINT pk_pastoral_crisis_detection_log
    PRIMARY KEY (one_on_one_id, categoria, detected_at_minute),

  -- D29: 5 categorías cerradas (mismo CHECK que M6)
  CONSTRAINT chk_pastoral_crisis_detection_log_categoria
    CHECK (
      categoria IN (
        'duelo',
        'crisis_matrimonial',
        'ideacion_suicida',
        'violencia_intrafamiliar',
        'crisis_de_fe'
      )
    )
);

-- ── Índices ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pastoral_crisis_detection_log_one_on_one_id
  ON pastoral_crisis_detection_log(one_on_one_id);

CREATE INDEX IF NOT EXISTS idx_pastoral_crisis_detection_log_actor_persona_id
  ON pastoral_crisis_detection_log(actor_persona_id);

CREATE INDEX IF NOT EXISTS idx_pastoral_crisis_detection_log_categoria
  ON pastoral_crisis_detection_log(categoria);

CREATE INDEX IF NOT EXISTS idx_pastoral_crisis_detection_log_detected_at
  ON pastoral_crisis_detection_log(detected_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE pastoral_crisis_detection_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE pastoral_crisis_detection_log FROM anon, authenticated;

CREATE POLICY "pastoral_crisis_detection_log_select_read_all"
  ON pastoral_crisis_detection_log FOR SELECT
  USING (
    auth_has_pastoral_capability('pastoral.read.all')
  );

-- service_role grants (INSERT via service, not direct)
GRANT SELECT ON TABLE pastoral_crisis_detection_log TO service_role;
