-- ══════════════════════════════════════════════════════════════════════════════
-- W09 — DT-050 — M6: Pastoral crisis keyword catalog
--
-- Tabla: pastoral_crisis_keyword_catalog
-- 5 categorías cerradas (D29):
--   duelo, crisis_matrimonial, ideacion_suicida,
--   violencia_intrafamiliar, crisis_de_fe
-- Cada categoría con 5-7 keywords (case-insensitive, unaccent en runtime).
--
-- RLS: readonly para pastoral.read.all (service_role bypass).
-- ZERO DDL destructivo — solo CREATE TABLE / INDEX / CONSTRAINT.
-- REGLA: auth.uid() en policies (no current_persona_id()).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Tabla ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pastoral_crisis_keyword_catalog (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria   text    NOT NULL,
  termino     text    NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  activo      boolean NOT NULL DEFAULT true,

  -- D29: 5 categorías cerradas
  CONSTRAINT chk_pastoral_crisis_keyword_catalog_categoria
    CHECK (
      categoria IN (
        'duelo',
        'crisis_matrimonial',
        'ideacion_suicida',
        'violencia_intrafamiliar',
        'crisis_de_fe'
      )
    ),
  -- Keywords no vacías
  CONSTRAINT chk_pastoral_crisis_keyword_catalog_termino_not_empty
    CHECK (length(termino) > 0)
);

-- Case-insensitive uniqueness via unique index on lower(termino)
-- IF NOT EXISTS ensures idempotency on re-run
CREATE UNIQUE INDEX IF NOT EXISTS uq_pastoral_crisis_keyword_catalog_categoria_termino_lower
  ON pastoral_crisis_keyword_catalog(categoria, lower(termino))
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_pastoral_crisis_keyword_catalog_categoria
  ON pastoral_crisis_keyword_catalog(categoria)
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_pastoral_crisis_keyword_catalog_activo
  ON pastoral_crisis_keyword_catalog(activo)
  WHERE activo = true;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE pastoral_crisis_keyword_catalog ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE pastoral_crisis_keyword_catalog FROM anon, authenticated;

CREATE POLICY "pastoral_crisis_keyword_catalog_select_read_all"
  ON pastoral_crisis_keyword_catalog FOR SELECT
  USING (
    auth_has_pastoral_capability('pastoral.read.all')
  );

GRANT SELECT ON TABLE pastoral_crisis_keyword_catalog TO service_role;

-- ── Seed: Catálogo v1 (D29 — 5 categorías × 5-7 keywords) ─────────────────────
-- All terms stored lowercase to match lower(termino) index.

INSERT INTO pastoral_crisis_keyword_catalog (categoria, termino, version, activo) VALUES
  -- Duelo (death/loss related crisis)
  ('duelo', 'fallecido',           1, true),
  ('duelo', 'murió',               1, true),
  ('duelo', 'muerte',               1, true),
  ('duelo', 'perdido',              1, true),
  ('duelo', 'deuil',                1, true),
  ('duelo', 'bereavement',          1, true),
  ('duelo', 'duelo',                1, true)

ON CONFLICT DO NOTHING;

INSERT INTO pastoral_crisis_keyword_catalog (categoria, termino, version, activo) VALUES
  -- Crisis matrimonial
  ('crisis_matrimonial', 'infiel',       1, true),
  ('crisis_matrimonial', 'separación',   1, true),
  ('crisis_matrimonial', 'divorcio',     1, true),
  ('crisis_matrimonial', 'affair',       1, true),
  ('crisis_matrimonial', 'traición',     1, true),
  ('crisis_matrimonial', 'crisis',       1, true)

ON CONFLICT DO NOTHING;

INSERT INTO pastoral_crisis_keyword_catalog (categoria, termino, version, activo) VALUES
  -- Ideación suicida
  ('ideacion_suicida', 'quitarme la vida', 1, true),
  ('ideacion_suicida', 'autolesión',        1, true),
  ('ideacion_suicida', 'self-harm',         1, true),
  ('ideacion_suicida', 'no vale la pena',  1, true),
  ('ideacion_suicida', 'mejor no estar',   1, true),
  ('ideacion_suicida', 'suicidio',          1, true)

ON CONFLICT DO NOTHING;

INSERT INTO pastoral_crisis_keyword_catalog (categoria, termino, version, activo) VALUES
  -- Violencia intrafamiliar
  ('violencia_intrafamiliar', 'violencia',  1, true),
  ('violencia_intrafamiliar', 'golpe',       1, true),
  ('violencia_intrafamiliar', 'abuso',       1, true),
  ('violencia_intrafamiliar', 'amenaza',     1, true),
  ('violencia_intrafamiliar', 'maltrato',    1, true),
  ('violencia_intrafamiliar', 'agresión',    1, true)

ON CONFLICT DO NOTHING;

INSERT INTO pastoral_crisis_keyword_catalog (categoria, termino, version, activo) VALUES
  -- Crisis de fe
  ('crisis_de_fe', 'dudar de dios',          1, true),
  ('crisis_de_fe', 'perdí la fe',            1, true),
  ('crisis_de_fe', 'no me importa',          1, true),
  ('crisis_de_fe', 'abandonado por dios',    1, true),
  ('crisis_de_fe', 'crisis de fe',           1, true),
  ('crisis_de_fe', 'dios me abandonó',       1, true),
  ('crisis_de_fe', 'no tengo fe',            1, true)

ON CONFLICT DO NOTHING;
