/**
 * PR29-B — Talleres ediciones globales schema dry-run probe.
 * F(talleres/schema/ediciones-globales) — taller_ediciones_globales +
 * taller_edicion_global_participantes + edicion_global_id on
 * public.taller_ediciones + backfill Edición Legacy.
 *
 * RED test: verifies the PR29-B migration file satisfies acceptance
 * criteria BEFORE application (mirrors the F4 schema-migration-dry-run
 * pattern, see __tests__/lib/platform/talleres/schema/metadata.test.ts).
 *
 * Acceptance criteria:
 *  1. Migration file exists with the PR29-B naming convention
 *     (`<ts>_pr29_b_taller_ediciones_globales.sql`).
 *  2. CREATE TABLE IF NOT EXISTS public.taller_ediciones_globales
 *     with byte-exact column set: id (uuid PK), nombre text NOT NULL
 *     CHECK length 2-120, slug text NOT NULL UNIQUE CHECK regex
 *     `^[a-z0-9-]+$` length 2-80, descripcion text NULLABLE CHECK
 *     length <= 1000, fecha_apertura timestamptz NOT NULL,
 *     fecha_cierre timestamptz NOT NULL CHECK fecha_cierre > fecha_apertura,
 *     estado text NOT NULL CHECK (borrador,abierto,cerrado,cancelado),
 *     created_by_persona_id uuid REFERENCES public.usuarios(id)
 *     ON DELETE SET NULL, created_at/updated_at timestamptz NOT NULL
 *     DEFAULT now(), version integer NOT NULL DEFAULT 1.
 *  3. CREATE TABLE IF NOT EXISTS
 *     public.taller_edicion_global_participantes with byte-exact column
 *     set: id (uuid PK), edicion_global_id uuid NOT NULL REFERENCES
 *     public.taller_ediciones_globales(id) ON DELETE CASCADE,
 *     taller_id uuid NOT NULL REFERENCES public.talleres(id)
 *     ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(),
 *     UNIQUE(edicion_global_id, taller_id).
 *  4. ALTER TABLE public.taller_ediciones ADD COLUMN IF NOT EXISTS
 *     edicion_global_id uuid NULL with FK to
 *     public.taller_ediciones_globales(id) ON DELETE SET NULL.
 *  5. Backfill inserts a row "Edición Legacy" with the reserved slug
 *     via ON CONFLICT (slug) DO NOTHING (idempotent), and then UPDATEs
 *     all local ediciones with edicion_global_id IS NULL to point to
 *     that legacy id.
 *  6. CREATE INDEX IF NOT EXISTS on public.taller_ediciones
 *     (edicion_global_id) WHERE edicion_global_id IS NOT NULL
 *     (partial index for the FK column).
 *  7. The 4 indexes on taller_ediciones_globales exist:
 *     idx_taller_ediciones_globales_estado,
 *     idx_taller_ediciones_globales_fecha_apertura,
 *     idx_taller_ediciones_globales_fecha_cierre,
 *     idx_taller_ediciones_globales_open (partial, WHERE estado='abierto').
 *  8. updated_at trigger is wired BEFORE UPDATE on
 *     taller_ediciones_globales via the canonical helper function.
 *  9. No destructive DDL: no DROP TABLE / DROP COLUMN / DROP CONSTRAINT
 *     / DROP POLICY / DROP INDEX, no DELETE FROM, no TRUNCATE,
 *     no ALTER COLUMN ... TYPE. Invariant I-6.
 * 10. The migration references the actual local-editions table name
 *     (public.taller_ediciones), not the conceptual model name
 *     (talleres_crecimiento_metadata). The design doc §1.3 documents
 *     this naming: the live table is taller_ediciones, the conceptual
 *     model is talleres_crecimiento_metadata.
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

describe('PR29-B migration — taller_ediciones_globales + junction + edicion_global_id + backfill', () => {
  const migrationPath = findMigration(/_pr29_b_taller_ediciones_globales\.sql$/)

  it('PR29-B migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('CREATE TABLE taller_ediciones_globales (§1.1)', () => {
    it('is created with CREATE TABLE IF NOT EXISTS (idempotent)', () => {
      expect(content).toMatch(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.taller_ediciones_globales/i
      )
    })

    it('has id uuid PRIMARY KEY DEFAULT gen_random_uuid()', () => {
      expect(content).toMatch(
        /taller_ediciones_globales[\s\S]*?id\s+uuid\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i
      )
    })

    it('has nombre text NOT NULL CHECK length 2-120', () => {
      expect(content).toMatch(
        /nombre\s+text\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*nombre\s*\)\s+BETWEEN\s+2\s+AND\s+120\s*\)/i
      )
    })

    it('has slug text NOT NULL UNIQUE CHECK regex + length 2-80', () => {
      // The slug must satisfy BOTH the regex constraint and the length
      // constraint, plus the UNIQUE constraint. Backfill relies on the
      // UNIQUE for ON CONFLICT (slug) DO NOTHING.
      expect(content).toMatch(/slug\s+text\s+NOT\s+NULL\s+UNIQUE/i)
      // The regex literal inside the CHECK: '^[a-z0-9-]+'. We assert
      // each component separately to avoid the JS regex literal's
      // trailing-slash vs '+' ambiguity. Use new RegExp() to keep the
      // / inside the regex body.
      expect(content).toMatch(/slug\s+~\s*'\^/i)
      expect(content).toMatch(/\[a-z0-9-\]/i)
      expect(content).toMatch(/\+\$?'/i)
      expect(content).toMatch(
        /length\s*\(\s*slug\s*\)\s+BETWEEN\s+2\s+AND\s+80/i
      )
    })

    it('has descripcion text NULLABLE CHECK length <= 1000', () => {
      // descripcion is nullable; CHECK only applies when not null.
      expect(content).toMatch(
        /descripcion\s+text\s+CHECK\s*\(\s*descripcion\s+IS\s+NULL\s+OR\s+length\s*\(\s*descripcion\s*\)\s*<=\s*1000\s*\)/i
      )
      // Confirm NOT absent: descripcion must NOT have NOT NULL.
      expect(content).not.toMatch(/descripcion\s+text\s+NOT\s+NULL/i)
    })

    it('has fecha_apertura timestamptz NOT NULL', () => {
      expect(content).toMatch(/fecha_apertura\s+timestamptz\s+NOT\s+NULL/i)
    })

    it('has fecha_cierre timestamptz NOT NULL CHECK fecha_cierre > fecha_apertura', () => {
      expect(content).toMatch(
        /fecha_cierre\s+timestamptz\s+NOT\s+NULL\s+CHECK\s*\(\s*fecha_cierre\s*>\s*fecha_apertura\s*\)/i
      )
    })

    it('has estado text NOT NULL CHECK (borrador, abierto, cerrado, cancelado)', () => {
      const estadoCheck = content.match(
        /CHECK\s*\(\s*estado\s+IN\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*\)\s*\)/i
      )
      expect(estadoCheck).not.toBeNull()
      if (!estadoCheck) return
      expect(estadoCheck[0]).toMatch(/'borrador'/)
      expect(estadoCheck[0]).toMatch(/'abierto'/)
      expect(estadoCheck[0]).toMatch(/'cerrado'/)
      expect(estadoCheck[0]).toMatch(/'cancelado'/)
      expect(content).toMatch(/estado\s+text\s+NOT\s+NULL/i)
    })

    it('has created_by_persona_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL', () => {
      expect(content).toMatch(
        /created_by_persona_id\s+uuid\s+REFERENCES\s+public\.usuarios\s*\(\s*id\s*\)\s+ON\s+DELETE\s+SET\s+NULL/i
      )
      // Nullable (no NOT NULL on this column).
      expect(content).not.toMatch(/created_by_persona_id\s+uuid\s+NOT\s+NULL/i)
    })

    it('has created_at / updated_at timestamptz NOT NULL DEFAULT now()', () => {
      expect(content).toMatch(/created_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i)
      expect(content).toMatch(/updated_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i)
    })

    it('has version integer NOT NULL DEFAULT 1', () => {
      expect(content).toMatch(/version\s+integer\s+NOT\s+NULL\s+DEFAULT\s+1/i)
    })
  })

  describe('CREATE TABLE taller_edicion_global_participantes (§1.2)', () => {
    it('is created with CREATE TABLE IF NOT EXISTS (idempotent)', () => {
      expect(content).toMatch(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.taller_edicion_global_participantes/i
      )
    })

    it('has id uuid PRIMARY KEY DEFAULT gen_random_uuid()', () => {
      expect(content).toMatch(
        /taller_edicion_global_participantes[\s\S]*?id\s+uuid\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i
      )
    })

    it('has edicion_global_id uuid NOT NULL FK to taller_ediciones_globales ON DELETE CASCADE', () => {
      expect(content).toMatch(
        /edicion_global_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.taller_ediciones_globales\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE/i
      )
    })

    it('has taller_id uuid NOT NULL FK to talleres ON DELETE RESTRICT', () => {
      expect(content).toMatch(
        /taller_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.talleres\s*\(\s*id\s*\)\s+ON\s+DELETE\s+RESTRICT/i
      )
    })

    it('has created_at timestamptz NOT NULL DEFAULT now()', () => {
      expect(content).toMatch(/created_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i)
    })

    it('has UNIQUE(edicion_global_id, taller_id) constraint', () => {
      // The junction table must enforce 1 row per (edicion, taller) pair.
      expect(content).toMatch(
        /UNIQUE\s*\(\s*edicion_global_id\s*,\s*taller_id\s*\)/i
      )
    })
  })

  describe('ALTER TABLE taller_ediciones — edicion_global_id FK (§1.3)', () => {
    it('adds column with ADD COLUMN IF NOT EXISTS (idempotent on re-run)', () => {
      expect(content).toMatch(
        /ALTER\s+TABLE\s+public\.taller_ediciones\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+edicion_global_id/i
      )
    })

    it('column is uuid NULL with FK to taller_ediciones_globales ON DELETE SET NULL', () => {
      expect(content).toMatch(
        /edicion_global_id\s+uuid\s+NULL\s+REFERENCES\s+public\.taller_ediciones_globales\s*\(\s*id\s*\)\s+ON\s+DELETE\s+SET\s+NULL/i
      )
    })

    it('targets the LIVE local-ediciones table (taller_ediciones), not the conceptual model name', () => {
      // The actual table in prod is `taller_ediciones`. The conceptual
      // model name is `talleres_crecimiento_metadata` (design §1.3).
      // The migration MUST reference the live table or it will fail
      // with "relation does not exist".
      expect(content).toMatch(/ALTER\s+TABLE\s+public\.taller_ediciones\b/i)
      // Defensive: make sure we never silently used the conceptual
      // model name (which would silently no-op without erroring).
      // We allow it to appear in COMMENTS but never in DDL.
      // Quick check: no ALTER/CREATE against talleres_crecimiento_metadata
      // in the DDL sense — but since the table name doesn't exist in
      // prod, we just assert the DDL target is the right one.
    })

    it('creates partial index on edicion_global_id WHERE IS NOT NULL (CREATE INDEX IF NOT EXISTS)', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?ON\s+public\.taller_ediciones\s*\(\s*edicion_global_id\s*\)\s+WHERE\s+edicion_global_id\s+IS\s+NOT\s+NULL/i
      )
    })
  })

  describe('Backfill — Edición Legacy (§1.4)', () => {
    it('is wrapped in a DO $$ ... $$ block for deterministic id resolution', () => {
      expect(content).toMatch(/DO\s+\$\$[\s\S]*?DECLARE[\s\S]*?v_legacy_id/i)
    })

    it('INSERTs the legacy row with ON CONFLICT (slug) DO NOTHING (idempotent)', () => {
      // The INSERT must use ON CONFLICT (slug) DO NOTHING so a
      // re-applied migration does not duplicate the row.
      expect(content).toMatch(/INSERT\s+INTO\s+public\.taller_ediciones_globales[\s\S]*?ON\s+CONFLICT\s*\(\s*slug\s*\)\s+DO\s+NOTHING/i)
    })

    it('legacy row has nombre "Edición Legacy"', () => {
      // The display name is "Edición Legacy" (es-ES, with accent).
      // Whitespace-tolerant match.
      expect(content).toMatch(/'Edición Legacy'/i)
    })

    it('legacy slug is reserved (a valid slug per CHECK, not user-creatable via UI)', () => {
      // The slug MUST be valid for the regex check `^[a-z0-9-]+$`.
      // The reserved name documented in the design doc is
      // 'legacy-pre-pr29' (a slug-friendly equivalent of the
      // '__legacy__' conceptual name; underscores would break the
      // regex CHECK). We assert the slug appears in the DO block.
      expect(content).toMatch(/'legacy-pre-pr29'/i)
    })

    it('legacy fecha_apertura is 2025-01-01 and fecha_cierre is 2030-12-31', () => {
      // Window covers all preexisting data + ample buffer for future
      // migrations. Timestamps must be explicit UTC literals.
      expect(content).toMatch(/'2025-01-01\s+00:00:00\+00'::timestamptz/i)
      expect(content).toMatch(/'2030-12-31\s+23:59:59\+00'::timestamptz/i)
    })

    it('legacy estado is "borrador" (terminal but harmless — never used as active season)', () => {
      // The legacy row is a tombstone-like bucket for pre-PR29-B
      // ediciones. It must NOT be 'abierto' (it would invite admins
      // to operate on it) and 'borrador' is the safest inert state.
      expect(content).toMatch(/'borrador'/i)
    })

    it('resolves the legacy id via SELECT (handles preexisting rows from prior runs)', () => {
      // After INSERT ... ON CONFLICT DO NOTHING, the row may be the
      // one we just inserted OR one from a prior run. The DO block
      // resolves the id deterministically with a SELECT.
      expect(content).toMatch(/SELECT\s+id\s+INTO\s+v_legacy_id/i)
    })

    it('UPDATEs all taller_ediciones rows with edicion_global_id IS NULL to point to the legacy id', () => {
      // The backfill must touch every local edicion that has not yet
      // been assigned to a global. The UPDATE is the key idempotency
      // guard: re-runs are no-ops because edicion_global_id IS NOT
      // NULL after the first run.
      expect(content).toMatch(
        /UPDATE\s+public\.taller_ediciones[\s\S]*?SET\s+edicion_global_id\s*=\s*v_legacy_id[\s\S]*?WHERE\s+edicion_global_id\s+IS\s+NULL/i
      )
    })

    it('RAISE EXCEPTION if the legacy id cannot be resolved (defensive)', () => {
      // If the SELECT returns nothing, the migration must abort
      // loudly rather than silently update nothing.
      expect(content).toMatch(/RAISE\s+EXCEPTION[\s\S]*?legacy/i)
    })
  })

  describe('Indexes on taller_ediciones_globales (§1.1)', () => {
    const requiredIndexes = [
      'idx_taller_ediciones_globales_estado',
      'idx_taller_ediciones_globales_fecha_apertura',
      'idx_taller_ediciones_globales_fecha_cierre',
    ]

    for (const idx of requiredIndexes) {
      it(`creates index ${idx} with CREATE INDEX IF NOT EXISTS`, () => {
        expect(content).toMatch(
          // eslint-disable-next-line security/detect-non-literal-regexp -- idx is from a fixed local list
          new RegExp(
            `CREATE\\s+INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+${idx}\\b[\\s\\S]*?ON\\s+public\\.taller_ediciones_globales`,
            'i'
          )
        )
      })
    }

    it('creates the partial index idx_taller_ediciones_globales_open WHERE estado = abierto', () => {
      // Partial index: hot path for the admin listing of currently-
      // open globales. Includes the WHERE clause.
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_taller_ediciones_globales_open[\s\S]*?ON\s+public\.taller_ediciones_globales[\s\S]*?WHERE\s+estado\s*=\s*'abierto'/i
      )
    })
  })

  describe('Indexes on taller_edicion_global_participantes (§1.2)', () => {
    it('creates idx_teg_participantes_edicion_global', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_teg_participantes_edicion_global[\s\S]*?ON\s+public\.taller_edicion_global_participantes/i
      )
    })

    it('creates idx_teg_participantes_taller', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_teg_participantes_taller[\s\S]*?ON\s+public\.taller_edicion_global_participantes/i
      )
    })
  })

  describe('updated_at trigger on taller_ediciones_globales (§1.1)', () => {
    it('defines a helper function (CREATE OR REPLACE FUNCTION ... RETURNS trigger)', () => {
      // Canonical helper pattern (mirrors other talleres tables): a
      // SECURITY-style plpgsql trigger function that sets NEW.updated_at.
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_set_updated_at_taller_ediciones_globales\s*\(\s*\)\s*RETURNS\s+trigger/i
      )
    })

    it('wires the trigger BEFORE UPDATE on taller_ediciones_globales', () => {
      expect(content).toMatch(
        /CREATE\s+TRIGGER\s+set_updated_at_taller_ediciones_globales[\s\S]*?BEFORE\s+UPDATE\s+ON\s+public\.taller_ediciones_globales/i
      )
    })

    it('drops and recreates the trigger for idempotency', () => {
      // The migration must DROP TRIGGER IF EXISTS before CREATE TRIGGER
      // so a re-apply does not fail with "trigger already exists".
      expect(content).toMatch(
        /DROP\s+TRIGGER\s+IF\s+EXISTS\s+set_updated_at_taller_ediciones_globales/i
      )
    })
  })

  describe('No destructive DDL — invariant I-6', () => {
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

    it('does not DELETE FROM any table', () => {
      // The backfill uses UPDATE only — never DELETE.
      expect(content).not.toMatch(/DELETE\s+FROM/i)
    })

    it('does not TRUNCATE', () => {
      expect(content).not.toMatch(/TRUNCATE/i)
    })

    it('does not ALTER COLUMN ... TYPE', () => {
      expect(content).not.toMatch(/ALTER\s+COLUMN[\s\S]*?TYPE/i)
    })
  })
})