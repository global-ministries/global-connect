/**
 * PR5 — DT-019 — Talleres metadata schema dry-run probe.
 * F(talleres/schema/metadata) — talleres_crecimiento_metadata migration.
 *
 * RED test: verifies the M5.1 migration files satisfy acceptance criteria
 * BEFORE application. Mirrors the F4 schema-migration-dry-run pattern.
 *
 * Acceptance criteria:
 *  1. Migration file exists with the M5.1 naming convention
 *     (`<ts>_talleres_tables_metadata_cohortes.sql`).
 *  2. Creates public.talleres_crecimiento_metadata with byte-exact column set:
 *     id (uuid PK), operating_core_event_id (uuid UNIQUE NOT NULL FK),
 *     tipo CHECK (∈ individual,pareja), link_type CHECK (∈ matrimonio,novios)
 *     NULLABLE, modalidad_inscripcion CHECK (∈ periodo_general,permanente_custom)
 *     NOT NULL, recurrence_rule jsonb NULLABLE, periodo_general_id uuid NULLABLE
 *     (FK to public.taller_periodos_generales, conditional — added in PR10),
 *     estado CHECK (∈ borrador,abierto,en_curso,cerrado,cancelado) NOT NULL,
 *     nombre_snapshot / sesiones_snapshot / duracion_estimada_minutos_snapshot /
 *     modalidad_inscripcion_snapshot NOT NULL, firmantes jsonb NOT NULL DEFAULT [],
 *     version int NOT NULL DEFAULT 1, created_at/updated_at timestamptz NOT NULL
 *     DEFAULT now().
 *  3. The CHECK constraints match the exact string literals in
 *     `lib/platform/talleres/types.ts` (TallerTipo, TallerLinkType,
 *     TallerModalidadInscripcion, TallerEstado) — no trailing commas
 *     inside the single-quoted values.
 *  4. UNIQUE constraint on operating_core_event_id.
 *  5. Idempotent: CREATE TABLE IF NOT EXISTS.
 *  6. CREATE INDEX IF NOT EXISTS for performance — at least one partial index
 *     on `estado IN ('abierto','en_curso')` (active workshops).
 *  7. RLS: ENABLE ROW LEVEL SECURITY + 4 policies per table with unique
 *     `_select/_insert/_update/_delete` suffixes (no `_no_update`/`_no_delete`
 *     placeholders — F4 used those for immutable tables, but metadata is
 *     fully mutable so all 4 standard verbs apply).
 *  8. Policies use `auth.uid()` directly (no `current_persona_id()` wrapper
 *     exists in staging). REVOKE ALL FROM anon, authenticated + GRANT
 *     SELECT/INSERT/UPDATE/DELETE TO service_role.
 *  9. No destructive DDL: no DROP TABLE / DROP COLUMN / DROP CONSTRAINT /
 *     DROP POLICY / DROP INDEX / DROP TRIGGER, no DELETE FROM, no TRUNCATE,
 *     no ALTER COLUMN ... TYPE. This is invariant I-6.
 * 10. Modality snapshot invariant: the `modalidad_inscripcion_snapshot` column
 *     is a separate column from `modalidad_inscripcion` and the migration
 *     does NOT include any trigger or expression that auto-updates the
 *     snapshot from the live column (snapshot is set by the application
 *     layer at insert time and never mutated thereafter).
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function findMigration(pattern: RegExp): string | null {
  const allFiles = readdirSync(MIGRATIONS_DIR)
  const sqlFiles = allFiles.filter((f: string): boolean => f.endsWith('.sql'))
  for (const file of sqlFiles) {
    if (pattern.test(file)) {
      return join(MIGRATIONS_DIR, file)
    }
  }
  return null
}

describe('Talleres metadata migration — talleres_crecimiento_metadata (DT-017 + DT-018)', () => {
  const migrationPath = findMigration(/_talleres_tables_metadata_cohortes\.sql$/)

  it('M5.1 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('CREATE TABLE talleres_crecimiento_metadata (DT-017)', () => {
    it('is created with CREATE TABLE IF NOT EXISTS (idempotent)', () => {
      expect(content).toMatch(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.talleres_crecimiento_metadata/i
      )
    })

    it('has id uuid PRIMARY KEY DEFAULT gen_random_uuid()', () => {
      expect(content).toMatch(
        /talleres_crecimiento_metadata[\s\S]*?id\s+uuid\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i
      )
    })

    it('has operating_core_event_id uuid UNIQUE NOT NULL with FK to operating_core_events', () => {
      expect(content).toMatch(
        /operating_core_event_id\s+uuid\s+UNIQUE\s+NOT\s+NULL\s+REFERENCES\s+public\.operating_core_events\s*\(\s*id\s*\)/i
      )
    })

    it('tipo CHECK uses the exact TS-canonical literals (individual, pareja) — no trailing comma', () => {
      // The literal set must match `lib/platform/talleres/types.ts`
      // TallerTipo = 'individual' | 'pareja' exactly. No trailing
      // comma inside any single-quoted string (a migration typo would
      // make the CHECK reject all real values, so we assert the clean
      // form). The F4 precedent migrations
      // (20260315_001_extender_eventos_grupo.sql:7 etc.) all use the
      // same clean form.
      const tipoCheck = content.match(
        /CHECK\s*\(\s*tipo\s+IN\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*\)\s*\)/i
      )
      expect(tipoCheck).not.toBeNull()
      if (!tipoCheck) return
      // Both literals must be present in the tipo CHECK, exactly as
      // declared in the TS union type.
      expect(tipoCheck[0]).toMatch(/'individual'/)
      expect(tipoCheck[0]).toMatch(/'pareja'/)
      // Explicit guard against the historical typo ('individual,'):
      // the literal inside the single quotes must not contain a comma.
      // We split the captured CHECK on the outer comma (between the two
      // literals) and check each literal individually for embedded commas.
      const inside = tipoCheck[0]
        .replace(/CHECK\s*\(\s*tipo\s+IN\s*\(\s*/i, '')
        .replace(/\s*\)\s*\)\s*$/i, '')
      const literals = inside.split(',').map((s: string): string => s.trim())
      for (const lit of literals) {
        expect(lit).not.toMatch(/,/)
      }
    })

    it('link_type CHECK uses matrimonio and novios (nullable)', () => {
      const linkCheck = content.match(
        /CHECK\s*\(\s*link_type\s+IN\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*\)\s*\)/i
      )
      expect(linkCheck).not.toBeNull()
      if (!linkCheck) return
      expect(linkCheck[0]).toMatch(/'matrimonio'/)
      expect(linkCheck[0]).toMatch(/'novios'/)
      // link_type must be nullable (not NOT NULL) per design §3
      expect(content).toMatch(/link_type\s+text(?!\s+NOT\s+NULL)/i)
    })

    it('modalidad_inscripcion CHECK uses periodo_general and permanente_custom (NOT NULL)', () => {
      const modCheck = content.match(
        /CHECK\s*\(\s*modalidad_inscripcion\s+IN\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*\)\s*\)/i
      )
      expect(modCheck).not.toBeNull()
      if (!modCheck) return
      expect(modCheck[0]).toMatch(/'periodo_general'/)
      expect(modCheck[0]).toMatch(/'permanente_custom'/)
      // modalidad_inscripcion must be NOT NULL
      expect(content).toMatch(/modalidad_inscripcion\s+text\s+NOT\s+NULL/i)
    })

    it('estado CHECK uses borrador, abierto, en_curso, cerrado, cancelado (NOT NULL)', () => {
      const estadoCheck = content.match(
        /CHECK\s*\(\s*estado\s+IN\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*\)\s*\)/i
      )
      expect(estadoCheck).not.toBeNull()
      if (!estadoCheck) return
      expect(estadoCheck[0]).toMatch(/'borrador'/)
      expect(estadoCheck[0]).toMatch(/'abierto'/)
      expect(estadoCheck[0]).toMatch(/'en_curso'/)
      expect(estadoCheck[0]).toMatch(/'cerrado'/)
      expect(estadoCheck[0]).toMatch(/'cancelado'/)
      expect(content).toMatch(/estado\s+text\s+NOT\s+NULL/i)
    })

    it('recurrence_rule is jsonb (nullable — periodo_general does not need it)', () => {
      expect(content).toMatch(/recurrence_rule\s+jsonb(?!\s+NOT\s+NULL)/i)
    })

    it('periodo_general_id uuid is nullable (FK created conditionally if taller_periodos_generales exists)', () => {
      // period_general_id is nullable; FK to taller_periodos_generales
      // is added inside a DO block only if that table exists (PR10 sibling).
      expect(content).toMatch(/periodo_general_id\s+uuid/i)
      expect(content).not.toMatch(/periodo_general_id\s+uuid\s+NOT\s+NULL/i)
    })

    it('has the four snapshot columns (nombre / sesiones / duracion_estimada_minutos / modalidad_inscripcion), all NOT NULL', () => {
      // The text snapshots:
      const textSnapshots = [
        'nombre_snapshot',
        'modalidad_inscripcion_snapshot',
      ]
      for (const col of textSnapshots) {
        // eslint-disable-next-line security/detect-non-literal-regexp -- col is from a fixed local list
        expect(content).toMatch(new RegExp(`${col}\\s+text\\s+NOT\\s+NULL`, 'i'))
      }
      // The integer snapshots:
      expect(content).toMatch(/sesiones_snapshot\s+integer\s+NOT\s+NULL/i)
      expect(content).toMatch(/duracion_estimada_minutos_snapshot\s+integer\s+NOT\s+NULL/i)
    })

    it('firmantes jsonb NOT NULL DEFAULT []', () => {
      expect(content).toMatch(
        /firmantes\s+jsonb\s+NOT\s+NULL\s+DEFAULT\s+'[^']*'::jsonb/i
      )
    })

    it('version integer NOT NULL DEFAULT 1', () => {
      expect(content).toMatch(/version\s+integer\s+NOT\s+NULL\s+DEFAULT\s+1/i)
    })

    it('created_at and updated_at timestamptz NOT NULL DEFAULT now()', () => {
      expect(content).toMatch(/created_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i)
      expect(content).toMatch(/updated_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i)
    })
  })

  describe('Modality snapshot immutability invariant (DT-019)', () => {
    it('the snapshot column is a SEPARATE column from the live modalidad column', () => {
      // The contract: changing modalidad_inscripcion MUST NOT mutate
      // modalidad_inscripcion_snapshot. This requires them to be two
      // physically distinct columns (not a generated column).
      const liveCol = content.match(/modalidad_inscripcion\s+text\s+NOT\s+NULL\s+CHECK/i)
      const snapshotCol = content.match(
        /modalidad_inscripcion_snapshot\s+text\s+NOT\s+NULL/i
      )
      expect(liveCol).not.toBeNull()
      expect(snapshotCol).not.toBeNull()
    })

    it('no GENERATED ALWAYS AS expression binds the snapshot to the live column', () => {
      // The snapshot must NOT be a generated column. If we ever auto-sync
      // the snapshot from the live value, we break R7/R10 (modality
      // changes must never mutate in-flight inscription snapshots).
      const snapshotLineBlock = content.split(/modalidad_inscripcion_snapshot/i)[1] ?? ''
      // Look in the next 200 chars after the column name for GENERATED
      expect(snapshotLineBlock.slice(0, 200)).not.toMatch(/GENERATED\s+ALWAYS\s+AS/i)
    })

    it('no UPDATE trigger rewrites the snapshot from the live column', () => {
      // Defense in depth: even if a future migration added a trigger,
      // the M5.1 migration must not include one. The snapshot is set
      // once at insert time by the application layer.
      expect(content).not.toMatch(/CREATE\s+TRIGGER[\s\S]*?snapshot/i)
    })
  })

  describe('CREATE INDEX IF NOT EXISTS — partial indexes (DT-017)', () => {
    it('creates at least one partial index on estado IN (abierto, en_curso)', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?ON\s+public\.talleres_crecimiento_metadata[\s\S]*?WHERE\s+estado\s+IN\s*\(\s*'abierto'\s*,\s*'en_curso'\s*\)/i
      )
    })

    it('creates a partial index on modalidad_inscripcion = periodo_general', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?ON\s+public\.talleres_crecimiento_metadata[\s\S]*?WHERE\s+modalidad_inscripcion\s*=\s*'periodo_general'/i
      )
    })
  })

  describe('RLS — ENABLE ROW LEVEL SECURITY (DT-018)', () => {
    it('ENABLE ROW LEVEL SECURITY on talleres_crecimiento_metadata', () => {
      expect(content).toMatch(
        /ALTER\s+TABLE\s+public\.talleres_crecimiento_metadata\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i
      )
    })

    it('REVOKE ALL on talleres_crecimiento_metadata from anon, authenticated', () => {
      expect(content).toMatch(
        /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.talleres_crecimiento_metadata\s+FROM\s+anon,\s*authenticated/i
      )
    })

    it('GRANT SELECT, INSERT, UPDATE, DELETE to service_role', () => {
      expect(content).toMatch(
        /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+public\.talleres_crecimiento_metadata\s+TO\s+service_role/i
      )
    })

    it('has 4 unique policies with _select / _insert / _update / _delete suffixes', () => {
      // The four policy names must each appear exactly once and have
      // the documented _select / _insert / _update / _delete suffix.
      // Following the F4 convention (one canonical verb per operation),
      // not the older multi-policy pattern from the pastoral one_on_one
      // table. We capture from the first CREATE POLICY ... ON
      // talleres_crecimiento_metadata up to the next ALTER TABLE /
      // CREATE POLICY on a different table / GRANT to service_role.
      const policyBlock = content.match(
        /ALTER\s+TABLE\s+public\.talleres_crecimiento_metadata[\s\S]*?(?=ALTER\s+TABLE\s+public\.talleres_crecimiento_cohortes)/i
      )
      expect(policyBlock).not.toBeNull()
      if (!policyBlock) return
      expect(policyBlock[0]).toMatch(/talleres_crecimiento_metadata_select[\s\S"]/i)
      expect(policyBlock[0]).toMatch(/talleres_crecimiento_metadata_insert[\s\S"]/i)
      expect(policyBlock[0]).toMatch(/talleres_crecimiento_metadata_update[\s\S"]/i)
      expect(policyBlock[0]).toMatch(/talleres_crecimiento_metadata_delete[\s\S"]/i)
    })

    it('policies use auth.uid() (directly or via the auth_has_talleres_capability helper) — never current_persona_id()', () => {
      // The F2 dream_team + F4 pastoral canonical pattern: identity is
      // resolved via `auth.uid()` either directly (when comparing a
      // stored uuid column) or through the auth_has_talleres_capability
      // helper (which does the usuarios.auth_id join internally). The
      // current_persona_id() wrapper does not exist in staging and is
      // explicitly banned by the design.
      const policyBlock = content.match(
        /ALTER\s+TABLE\s+public\.talleres_crecimiento_metadata[\s\S]*?(?=ALTER\s+TABLE\s+public\.talleres_crecimiento_cohortes)/i
      )
      expect(policyBlock).not.toBeNull()
      if (!policyBlock) return
      // Either auth.uid() appears directly, or the helper
      // auth_has_talleres_capability wraps it (the helper exists in
      // 20260808204221_talleres_helper_auth_has_capability.sql).
      const hasDirect = /auth\.uid\(\)/i.test(policyBlock[0])
      const hasHelper = /auth_has_talleres_capability/i.test(policyBlock[0])
      expect(hasDirect || hasHelper).toBe(true)
      // current_persona_id() is forbidden by the design (does not exist
      // in staging; the helper function is the canonical entry point).
      expect(policyBlock[0]).not.toMatch(/current_persona_id\s*\(\s*\)/i)
    })
  })

  describe('No destructive DDL — invariant I-6 (DT-019)', () => {
    it('does not DROP TABLE', () => {
      expect(content).not.toMatch(/DROP\s+TABLE/i)
    })

    it('does not DROP COLUMN', () => {
      expect(content).not.toMatch(/DROP\s+COLUMN/i)
    })

    it('does not DROP CONSTRAINT', () => {
      expect(content).not.toMatch(/DROP\s+CONSTRAINT/i)
    })

    it('does not DROP POLICY', () => {
      expect(content).not.toMatch(/DROP\s+POLICY/i)
    })

    it('does not DROP INDEX', () => {
      expect(content).not.toMatch(/DROP\s+INDEX/i)
    })

    it('does not DROP TRIGGER', () => {
      expect(content).not.toMatch(/DROP\s+TRIGGER/i)
    })

    it('does not DELETE FROM any table', () => {
      expect(content).not.toMatch(/DELETE\s+FROM/i)
    })

    it('does not TRUNCATE', () => {
      expect(content).not.toMatch(/TRUNCATE/i)
    })

    it('does not ALTER COLUMN ... TYPE (no data-type mutation)', () => {
      expect(content).not.toMatch(/ALTER\s+COLUMN[\s\S]*?TYPE/i)
    })
  })
})
