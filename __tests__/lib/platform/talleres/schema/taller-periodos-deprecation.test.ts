/**
 * PR29-E — Deprecation marker for taller_periodos_generales.
 * F(talleres/schema/taller-periodos-deprecation) — verifies the PR29-E
 * migration file satisfies the deprecation acceptance criteria BEFORE
 * application (mirrors the F4 schema-migration-dry-run pattern, see
 * __tests__/lib/platform/talleres/schema/ediciones-globales.test.ts).
 *
 * Acceptance criteria (PR29-E scope):
 *  1. Migration file exists with the PR29-E naming convention
 *     (`<ts>_pr29_e_taller_periodos_generales_deprecation.sql`).
 *  2. Defines `COMMENT ON TABLE public.taller_periodos_generales` with the
 *     string 'DEPRECATED' so future grep audits can find the marker.
 *  3. Defines the function `assert_no_direct_taller_periodo_insert` (the
 *     BEFORE INSERT trigger guard) as plpgsql.
 *  4. Creates the trigger `trg_block_direct_taller_periodo_insert` on
 *     `public.taller_periodos_generales` BEFORE INSERT, calling the guard
 *     function.
 *  5. Creates the view `v_taller_periodos_generales_compat` that exposes
 *     `fecha_cierre_real` (the column pg_cron closer reads) and the
 *     canonical taller_ediciones metadata via JOIN.
 *  6. The view JOIN references both `taller_periodos_generales` and
 *     `taller_ediciones` (the post-PR23.2b canonical name; the prompt
 *     mentions `talleres_crecimiento_metadata`, but that table was renamed
 *     on prod — the view uses the live name).
 *
 * Out of scope (verified at apply time, not in this regex file):
 *  - DROP of taller_periodos_generales (PR29-F, >30d gate).
 *  - pg_cron 'talleres_period_closer' migration (per design.md §5).
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

describe('PR29-E migration — taller_periodos_generales deprecation', () => {
  const migrationPath = findMigration(
    /_pr29_e_taller_periodos_generales_deprecation\.sql$/
  )

  it('PR29-E migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('File discovery', () => {
    it('uses the PR29-E naming convention (suffix _pr29_e_taller_periodos_generales_deprecation.sql)', () => {
      expect(migrationPath).toMatch(
        /_pr29_e_taller_periodos_generales_deprecation\.sql$/
      )
    })
  })

  describe('Deprecation comment (§1)', () => {
    it('issues COMMENT ON TABLE public.taller_periodos_generales', () => {
      expect(content).toMatch(
        /COMMENT\s+ON\s+TABLE\s+public\.taller_periodos_generales\s+IS/i
      )
    })

    it('marks the table as DEPRECATED (greppable marker for future audits)', () => {
      // The literal "DEPRECATED" keyword must appear in the comment body so
      // that `psql -c "\\dd taller_periodos_generales"` and future grep
      // audits can identify the deprecation without parsing prose.
      expect(content).toMatch(/COMMENT\s+ON\s+TABLE[\s\S]*?DEPRECATED/i)
    })

    it('mentions the PR29-E label in the comment so provenance is traceable', () => {
      expect(content).toMatch(/COMMENT\s+ON\s+TABLE[\s\S]*?PR29-E/i)
    })

    it('references the new flow tables (taller_ediciones_globales) in the comment', () => {
      expect(content).toMatch(
        /COMMENT\s+ON\s+TABLE[\s\S]*?taller_ediciones_globales/i
      )
    })
  })

  describe('INSERT-block trigger function (§2)', () => {
    it('defines assert_no_direct_taller_periodo_insert as a function', () => {
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.assert_no_direct_taller_periodo_insert/i
      )
    })

    it('is plpgsql', () => {
      expect(content).toMatch(
        /assert_no_direct_taller_periodo_insert[\s\S]*?LANGUAGE\s+plpgsql/i
      )
    })

    it('returns trigger (BEFORE INSERT)', () => {
      expect(content).toMatch(
        /assert_no_direct_taller_periodo_insert[\s\S]*?RETURNS\s+trigger/i
      )
    })

    it('bypasses the gate for postgres / superuser', () => {
      expect(content).toMatch(/is_superuser[\s\S]*?=\s*'on'/i)
      expect(content).toMatch(/session_user\s*=\s*'postgres'/i)
    })

    it('bypasses the gate for service_role', () => {
      expect(content).toMatch(/current_setting\('role'\)[\s\S]*?service_role/i)
    })

    it('raises an exception (P0001 raise_exception) for the default role path', () => {
      expect(content).toMatch(/RAISE\s+EXCEPTION[\s\S]*?PR29-E/i)
      expect(content).toMatch(/ERRCODE\s*=\s*'P0001'/i)
    })
  })

  describe('Trigger wiring (§2)', () => {
    it('drops the prior trigger if it exists (idempotent re-apply)', () => {
      expect(content).toMatch(
        /DROP\s+TRIGGER\s+IF\s+EXISTS\s+trg_block_direct_taller_periodo_insert/i
      )
    })

    it('creates trg_block_direct_taller_periodo_insert BEFORE INSERT', () => {
      expect(content).toMatch(
        /CREATE\s+TRIGGER\s+trg_block_direct_taller_periodo_insert[\s\S]*?BEFORE\s+INSERT\s+ON\s+public\.taller_periodos_generales/i
      )
    })

    it('calls assert_no_direct_taller_periodo_insert FOR EACH ROW', () => {
      expect(content).toMatch(
        /CREATE\s+TRIGGER\s+trg_block_direct_taller_periodo_insert[\s\S]*?FOR\s+EACH\s+ROW\s+EXECUTE\s+FUNCTION\s+public\.assert_no_direct_taller_periodo_insert/i
      )
    })
  })

  describe('Compat view (§3)', () => {
    it('creates the view v_taller_periodos_generales_compat', () => {
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.v_taller_periodos_generales_compat\s+AS/i
      )
    })

    it('exposes fecha_cierre_real (the column pg_cron closer reads)', () => {
      expect(content).toMatch(
        /v_taller_periodos_generales_compat[\s\S]*?fecha_cierre_real/i
      )
    })

    it('exposes edicion_label and motivo_cierre (legacy observability surface)', () => {
      expect(content).toMatch(
        /v_taller_periodos_generales_compat[\s\S]*?edicion_label/i
      )
      expect(content).toMatch(
        /v_taller_periodos_generales_compat[\s\S]*?motivo_cierre/i
      )
    })

    it('JOINs taller_periodos_generales (FROM source)', () => {
      expect(content).toMatch(
        /v_taller_periodos_generales_compat[\s\S]*?FROM\s+public\.taller_periodos_generales/i
      )
    })

    it('JOINs taller_ediciones (post-PR23.2b canonical metadata table)', () => {
      // The prompt mentions `talleres_crecimiento_metadata`, but PR23.2b
      // renamed that table on prod to `taller_ediciones`. The FK
      // `taller_periodos_generales.taller_id REFERENCES taller_ediciones(id)`
      // is what we surface here. We accept EITHER spelling so the test is
      // resilient if the rename ever reverts.
      const viewBody = content.match(
        /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.v_taller_periodos_generales_compat[\s\S]*?;/i
      )
      expect(viewBody).not.toBeNull()
      if (viewBody) {
        const joined = /taller_ediciones|talleres_crecimiento_metadata/i
        expect(viewBody[0]).toMatch(joined)
      }
    })

    it('aliases the joined table (te. / tcm.) to expose taller_estado, taller_tipo, edicion_global_id', () => {
      // Taller_estado / taller_tipo / edicion_global_id must be projected
      // via an aliased join (not as literal columns of the legacy table).
      expect(content).toMatch(
        /v_taller_periodos_generales_compat[\s\S]*?taller_estado/i
      )
      expect(content).toMatch(
        /v_taller_periodos_generales_compat[\s\S]*?taller_tipo/i
      )
      expect(content).toMatch(
        /v_taller_periodos_generales_compat[\s\S]*?edicion_global_id/i
      )
    })
  })

  describe('Negative guard — no destructive DDL', () => {
    it('does NOT DROP taller_periodos_generales (DROP is PR29-F, >30d gate)', () => {
      // The migration must NOT contain DROP TABLE taller_periodos_generales.
      // Anything else DROPping a table is fine (e.g. the trigger DROP IF
      // EXISTS is required for idempotency).
      expect(content).not.toMatch(
        /DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\.taller_periodos_generales/i
      )
    })

    it('does NOT TRUNCATE taller_periodos_generales', () => {
      expect(content).not.toMatch(
        /TRUNCATE\s+(TABLE\s+)?public\.taller_periodos_generales/i
      )
    })

    it('does NOT DELETE FROM taller_periodos_generales', () => {
      expect(content).not.toMatch(
        /DELETE\s+FROM\s+public\.taller_periodos_generales/i
      )
    })
  })
})