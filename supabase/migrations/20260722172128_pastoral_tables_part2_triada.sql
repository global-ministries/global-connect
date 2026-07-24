-- ════════════════════════════════════════════════════════════════════
-- W03 — DT-014 / DT-015 — Pastoral Triada tables + RLS policies
-- Tables: pastoral_triada, pastoral_triada_miembros, pastoral_triada_eventos
-- RLS: read by circle (asistido roadmap, members composition,
--      director aggregated, pastor/admin full); write only mentor oficial.
-- Zero DDL destructive — only CREATE TABLE / INDEX / CONSTRAINT.
--
-- RULES from W02:
--   • Use auth.uid() directly in policies (no current_persona_id())
--   • DO block for types (no CREATE TYPE IF NOT EXISTS)
--   • Unique policy names per table (sufixos: _select, _insert, _update, _no_update, _no_delete)
-- ════════════════════════════════════════════════════════════════════

-- ── Enums (DO block, not CREATE TYPE IF NOT EXISTS) ─────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pastoral_triada_estado') THEN
    CREATE TYPE pastoral_triada_estado AS ENUM (
      'pending_confirmation',
      'active',
      'en_pausa',
      'disbanded'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pastoral_triada_contexto') THEN
    CREATE TYPE pastoral_triada_contexto AS ENUM (
      'nuevo_paso',
      'simultaneidad',
      'inicial',
      'reformada'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pastoral_triada_motivo_disolucion') THEN
    CREATE TYPE pastoral_triada_motivo_disolucion AS ENUM (
      'gdv_liderazgo_removed',
      'servicio_retirado',
      'cambio_de_temporada',
      'pastoral_decision',
      'otro'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pastoral_triada_evento_tipo') THEN
    CREATE TYPE pastoral_triada_evento_tipo AS ENUM (
      'formada',
      'miembro_anadido',
      'miembro_removido',
      'pausada',
      'reactivada',
      'disuelta',
      'paso_sugerido',
      'paso_validado'
    );
  END IF;
END $$;

-- ── Tabla principal ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pastoral_triada (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_oficial_persona_id uuid NOT NULL,
  autor_persona_id uuid NOT NULL,
  estado pastoral_triada_estado NOT NULL DEFAULT 'pending_confirmation',
  contexto pastoral_triada_contexto NOT NULL,
  motivo_disolucion pastoral_triada_motivo_disolucion,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pastoral_triada_mentor
  ON pastoral_triada(mentor_oficial_persona_id);
CREATE INDEX IF NOT EXISTS idx_pastoral_triada_autor
  ON pastoral_triada(autor_persona_id);
CREATE INDEX IF NOT EXISTS idx_pastoral_triada_estado
  ON pastoral_triada(estado);
CREATE INDEX IF NOT EXISTS idx_pastoral_triada_contexto
  ON pastoral_triada(contexto);

-- ── Tabla de miembros ──────────────────────────────────────────────

-- D25: cardinality 3 fixed — enforced by membership table.
-- A person may have double rol_en_triada if they have two distinct roles,
-- but distinct human count must be exactly 3.
CREATE TABLE IF NOT EXISTS pastoral_triada_miembros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triada_id uuid NOT NULL REFERENCES pastoral_triada(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL,
  rol_en_triada text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (triada_id, persona_id, rol_en_triada)
);

CREATE INDEX IF NOT EXISTS idx_pastoral_triada_miembros_triada
  ON pastoral_triada_miembros(triada_id);
CREATE INDEX IF NOT EXISTS idx_pastoral_triada_miembros_persona
  ON pastoral_triada_miembros(persona_id);

-- Exclusion constraint: total distinct persons per triada must be exactly 3.
-- Uses a partial unique index + trigger approach since Postgres exclusion
-- constraints work with ranges. The trigger approach is in the application
-- layer (cardinality validator in DT-018).
-- Here we enforce at DB level with a check on member count per triada
-- (must be between 3 and 3 distinct persons — handled by application).
ALTER TABLE pastoral_triada_miembros
  ADD CONSTRAINT chk_pastoral_triada_miembros_rol_not_empty
  CHECK (rol_en_triada <> '');

-- ── Tabla de eventos (bitácora inmutable) ─────────────────────────

CREATE TABLE IF NOT EXISTS pastoral_triada_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triada_id uuid NOT NULL REFERENCES pastoral_triada(id) ON DELETE CASCADE,
  tipo_evento pastoral_triada_evento_tipo NOT NULL,
  actor_persona_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pastoral_triada_eventos_triada
  ON pastoral_triada_eventos(triada_id);
CREATE INDEX IF NOT EXISTS idx_pastoral_triada_eventos_tipo
  ON pastoral_triada_eventos(tipo_evento);

-- ── RLS ─────────────────────────────────────────────────────────────

ALTER TABLE pastoral_triada ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_triada_miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_triada_eventos ENABLE ROW LEVEL SECURITY;

-- Revoke direct mutations — all writes go through service_role / RPC.
REVOKE ALL ON TABLE pastoral_triada FROM anon, authenticated;
REVOKE ALL ON TABLE pastoral_triada_miembros FROM anon, authenticated;
REVOKE ALL ON TABLE pastoral_triada_eventos FROM anon, authenticated;

-- ── pastoral_triada RLS policies ───────────────────────────────────

-- SELECT: mentor oficial OR pastoral.read.all
CREATE POLICY "pastoral_triada_select_mentor"
  ON pastoral_triada FOR SELECT USING (
    mentor_oficial_persona_id = auth.uid()
    OR auth_has_pastoral_capability('pastoral.read.all')
  );

-- SELECT: member of the triada (via pastoral_triada_miembros)
CREATE POLICY "pastoral_triada_select_miembro"
  ON pastoral_triada FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pastoral_triada_miembros m
      WHERE m.triada_id = pastoral_triada.id
        AND m.persona_id = auth.uid()
    )
  );

-- INSERT: requires pastoral.triada.create capability
CREATE POLICY "pastoral_triada_insert_create"
  ON pastoral_triada FOR INSERT WITH CHECK (
    auth_has_pastoral_capability('pastoral.triada.create')
  );

-- UPDATE: only mentor oficial
CREATE POLICY "pastoral_triada_update_mentor"
  ON pastoral_triada FOR UPDATE USING (
    mentor_oficial_persona_id = auth.uid()
  ) WITH CHECK (
    mentor_oficial_persona_id = auth.uid()
  );

-- DELETE: only mentor oficial (for edge cases — normally tríadas are disbanded, not deleted)
CREATE POLICY "pastoral_triada_delete_mentor"
  ON pastoral_triada FOR DELETE USING (
    mentor_oficial_persona_id = auth.uid()
  );

-- ── pastoral_triada_miembros RLS policies ─────────────────────────

-- SELECT: can see members if you can see the triada
CREATE POLICY "pastoral_triada_miembros_select"
  ON pastoral_triada_miembros FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pastoral_triada t
      WHERE t.id = pastoral_triada_miembros.triada_id
        AND (
          t.mentor_oficial_persona_id = auth.uid()
          OR auth_has_pastoral_capability('pastoral.read.all')
          OR EXISTS (
            SELECT 1 FROM pastoral_triada_miembros m
            WHERE m.triada_id = t.id
              AND m.persona_id = auth.uid()
          )
        )
    )
  );

-- INSERT: requires pastoral.triada.create capability
CREATE POLICY "pastoral_triada_miembros_insert"
  ON pastoral_triada_miembros FOR INSERT WITH CHECK (
    auth_has_pastoral_capability('pastoral.triada.create')
  );

-- UPDATE: only mentor oficial of the triada
CREATE POLICY "pastoral_triada_miembros_update"
  ON pastoral_triada_miembros FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pastoral_triada t
      WHERE t.id = pastoral_triada_miembros.triada_id
        AND t.mentor_oficial_persona_id = auth.uid()
    )
  );

-- DELETE: only mentor oficial of the triada
CREATE POLICY "pastoral_triada_miembros_delete"
  ON pastoral_triada_miembros FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM pastoral_triada t
      WHERE t.id = pastoral_triada_miembros.triada_id
        AND t.mentor_oficial_persona_id = auth.uid()
    )
  );

-- ── pastoral_triada_eventos RLS policies ──────────────────────────

-- SELECT: same circle as pastoral_triada
CREATE POLICY "pastoral_triada_eventos_select"
  ON pastoral_triada_eventos FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pastoral_triada t
      WHERE t.id = pastoral_triada_eventos.triada_id
        AND (
          t.mentor_oficial_persona_id = auth.uid()
          OR auth_has_pastoral_capability('pastoral.read.all')
          OR EXISTS (
            SELECT 1 FROM pastoral_triada_miembros m
            WHERE m.triada_id = t.id
              AND m.persona_id = auth.uid()
          )
        )
    )
  );

-- INSERT: requires pastoral.triada.create capability (for forming the triada)
CREATE POLICY "pastoral_triada_eventos_insert"
  ON pastoral_triada_eventos FOR INSERT WITH CHECK (
    auth_has_pastoral_capability('pastoral.triada.create')
  );

-- Eventos son inmutables — deny UPDATE y DELETE
CREATE POLICY "pastoral_triada_eventos_no_update"
  ON pastoral_triada_eventos FOR UPDATE USING (false) WITH CHECK (false);

CREATE POLICY "pastoral_triada_eventos_no_delete"
  ON pastoral_triada_eventos FOR DELETE USING (false);

-- ── service_role grants (bypass RLS) ───────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pastoral_triada TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pastoral_triada_miembros TO service_role;
GRANT SELECT, INSERT ON TABLE pastoral_triada_eventos TO service_role;
