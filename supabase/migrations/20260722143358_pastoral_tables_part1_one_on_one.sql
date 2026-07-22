-- ════════════════════════════════════════════════════════════════════
-- W02 — DT-008 / DT-009 — Pastoral 1:1 tables + RLS policies
-- Tables: pastoral_one_on_one, pastoral_one_on_one_participantes,
--         pastoral_one_on_one_notas
-- RLS: mentor autor read/write, asistido roadmap read,
--      pastoral.read.all admin read, notes annexable (never mutable).
-- Zero DDL destructive — only CREATE TABLE / INDEX / CONSTRAINT.
-- ════════════════════════════════════════════════════════════════════

-- ── Enums ──────────────────────────────────────────────────────────

CREATE TYPE pastoral_one_on_one_estado AS ENUM (
  'pending_participant',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'no_realizado'
);

-- ── Tabla principal ────────────────────────────────────────────────

CREATE TABLE pastoral_one_on_one (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_oficial_persona_id uuid NOT NULL,
  autor_persona_id uuid NOT NULL,
  estado pastoral_one_on_one_estado NOT NULL DEFAULT 'pending_participant',
  scheduled_at timestamptz,
  completed_at timestamptz,
  motivo_cancelacion text,
  resumen text,
  motivo_no_realizado text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- D12: resumen bounded to 500 chars + sensitive patterns blocked (D17, P4)
  CONSTRAINT chk_pastoral_one_on_one_resumen_length
    CHECK (resumen IS NULL OR length(resumen) <= 500),
  CONSTRAINT chk_pastoral_one_on_one_resumen_no_sensitive
    CHECK (
      resumen IS NULL OR
      resumen !~* '\y(cedula|pasaporte|diagnostico|suicidio|matrimonio infiel)\y'
    ),
  -- Terminal states cannot have NULL motivo_cancelacion / motivo_no_realizado
  CONSTRAINT chk_pastoral_one_on_one_cancelled_needs_motivo
    CHECK (
      estado != 'cancelled' OR
      (motivo_cancelacion IS NOT NULL AND motivo_cancelacion <> '')
    ),
  CONSTRAINT chk_pastoral_one_on_one_no_realizado_needs_motivo
    CHECK (
      estado != 'no_realizado' OR
      (motivo_no_realizado IS NOT NULL AND motivo_no_realizado <> '')
    )
);

CREATE INDEX idx_pastoral_one_on_one_mentor
  ON pastoral_one_on_one(mentor_oficial_persona_id);
CREATE INDEX idx_pastoral_one_on_one_autor
  ON pastoral_one_on_one(autor_persona_id);
CREATE INDEX idx_pastoral_one_on_one_estado
  ON pastoral_one_on_one(estado);
CREATE INDEX idx_pastoral_one_on_one_scheduled_at
  ON pastoral_one_on_one(scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- ── Tabla de participantes ─────────────────────────────────────────

CREATE TABLE pastoral_one_on_one_participantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  one_on_one_id uuid NOT NULL REFERENCES pastoral_one_on_one(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (one_on_one_id, persona_id)
);

CREATE INDEX idx_pastoral_one_on_one_participantes_one_on_one
  ON pastoral_one_on_one_participantes(one_on_one_id);
CREATE INDEX idx_pastoral_one_on_one_participantes_persona
  ON pastoral_one_on_one_participantes(persona_id);

-- ── Tabla de notas (anexables, nunca mutables) ─────────────────────

CREATE TABLE pastoral_one_on_one_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  one_on_one_id uuid NOT NULL REFERENCES pastoral_one_on_one(id) ON DELETE CASCADE,
  autor_persona_id uuid NOT NULL,
  contenido text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pastoral_one_on_one_notas_one_on_one
  ON pastoral_one_on_one_notas(one_on_one_id);
CREATE INDEX idx_pastoral_one_on_one_notas_autor
  ON pastoral_one_on_one_notas(autor_persona_id);

-- ── RLS ─────────────────────────────────────────────────────────────

ALTER TABLE pastoral_one_on_one ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_one_on_one_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_one_on_one_notas ENABLE ROW LEVEL SECURITY;

-- Revoke direct mutations — all writes go through service_role / RPC.
REVOKE ALL ON TABLE pastoral_one_on_one FROM anon, authenticated;
REVOKE ALL ON TABLE pastoral_one_on_one_participantes FROM anon, authenticated;
REVOKE ALL ON TABLE pastoral_one_on_one_notas FROM anon, authenticated;

-- Pastoral 1:1 read: mentor autor OR asistido (roadmap) OR pastoral.read.all
CREATE POLICY "pastoral_one_on_one_mentor_read"
  ON pastoral_one_on_one FOR SELECT USING (
    mentor_oficial_persona_id = auth.uid()
    OR auth_has_pastoral_capability('pastoral.read.all')
  );

CREATE POLICY "pastoral_one_on_one_asistido_read"
  ON pastoral_one_on_one FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pastoral_one_on_one_participantes p
      WHERE p.one_on_one_id = pastoral_one_on_one.id
        AND p.persona_id = auth.uid()
    )
  );

-- Pastoral 1:1 write: only mentor autor
CREATE POLICY "pastoral_one_on_one_mentor_write"
  ON pastoral_one_on_one FOR UPDATE USING (
    mentor_oficial_persona_id = auth.uid()
  ) WITH CHECK (
    mentor_oficial_persona_id = auth.uid()
  );

-- Pastoral 1:1 insert: requires pastoral.one_on_one.create capability
CREATE POLICY "pastoral_one_on_one_insert"
  ON pastoral_one_on_one FOR INSERT WITH CHECK (
    auth_has_pastoral_capability('pastoral.one_on_one.create')
  );

-- Pastoral 1:1 participantes: mentor autor or asistido can read their own
CREATE POLICY "pastoral_one_on_one_participantes_read"
  ON pastoral_one_on_one_participantes FOR SELECT USING (
    mentor_oficial_persona_id = auth.uid()
    OR auth_has_pastoral_capability('pastoral.read.all')
    OR EXISTS (
      SELECT 1 FROM pastoral_one_on_one ooo
      JOIN pastoral_one_on_one_participantes p ON p.one_on_one_id = ooo.id
      WHERE ooo.id = pastoral_one_on_one_participantes.one_on_one_id
        AND p.persona_id = auth.uid()
    )
  );

CREATE POLICY "pastoral_one_on_one_participantes_write"
  ON pastoral_one_on_one_participantes FOR INSERT WITH CHECK (
    auth_has_pastoral_capability('pastoral.one_on_one.create')
  );

-- Pastoral 1:1 notas: annexable (INSERT) by mentor autor or pastoral.read.all
-- Never mutable (no UPDATE/DELETE policies — deny all)
CREATE POLICY "pastoral_one_on_one_notas_read"
  ON pastoral_one_on_one_notas FOR SELECT USING (
    autor_persona_id = auth.uid()
    OR auth_has_pastoral_capability('pastoral.read.all')
  );

CREATE POLICY "pastoral_one_on_one_notas_insert"
  ON pastoral_one_on_one_notas FOR INSERT WITH CHECK (
    auth_has_pastoral_capability('pastoral.one_on_one.write_notes')
  );

-- Deny UPDATE and DELETE on notas (anexables, never mutable)
CREATE POLICY "pastoral_one_on_one_notas_no_update"
  ON pastoral_one_on_one_notas FOR UPDATE USING (false) WITH CHECK (false);

CREATE POLICY "pastoral_one_on_one_notas_no_delete"
  ON pastoral_one_on_one_notas FOR DELETE USING (false);

-- Grants to service_role for Supabase client operations
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pastoral_one_on_one TO service_role;
GRANT SELECT, INSERT ON TABLE pastoral_one_on_one_participantes TO service_role;
GRANT SELECT, INSERT ON TABLE pastoral_one_on_one_notas TO service_role;
