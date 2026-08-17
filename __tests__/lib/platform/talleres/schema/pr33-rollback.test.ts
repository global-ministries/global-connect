/**
 * PR33 — Rollback of the ediciones globales model (PR29-B/C/D/E/F.1/31/32).
 * F(talleres/schema/pr33-rollback) — verifies the PR33 migration
 * file satisfies the rollback acceptance criteria BEFORE application
 * (mirrors the F4 schema-migration-dry-run pattern, see
 * __tests__/lib/platform/talleres/schema/pr32-backfill.test.ts).
 *
 * Background — the roadmap maestro (Fase 5) does NOT include
 * ediciones globales as a model entity. The user-approved rollback
 * restores the simple model from PR21:
 *   - Taller abstracto = stable catalogue entry (public.talleres)
 *   - Edición local (public.taller_ediciones) = a specific occurrence
 *     with cohort + sesiones + inscripciones
 *   - Recurrence rule jsonb (PR11) = auto-generates local ediciones
 *   - Reporting = GROUP BY date in TypeScript, no model entity needed
 *
 * Acceptance criteria (PR33 scope):
 *  1. Migration file exists with the PR33 naming convention
 *     (`<ts>_pr33_rollback_global_ediciones.sql`).
 *  2. Drops the compat view v_taller_periodos_generales_compat
 *     BEFORE dropping the column (view depends on the column).
 *  3. Drops the index idx_taller_ediciones_edicion_global BEFORE
 *     dropping the column (idempotent DROP INDEX IF EXISTS).
 *  4. Drops the column public.taller_ediciones.edicion_global_id
 *     (ALTER TABLE … DROP COLUMN IF EXISTS).
 *  5. Drops the 4 RPCs: create_edicion_global, open_edicion_global,
 *     close_edicion_global, cancel_edicion_global (DROP FUNCTION IF
 *     EXISTS for each).
 *  6. Drops the table public.taller_ediciones_globales with CASCADE.
 *  7. Drops the trigger function
 *     public.fn_set_updated_at_taller_ediciones_globales
 *     (no other code uses it).
 *  8. Recreates the compat view v_taller_periodos_generales_compat
 *     WITHOUT the edicion_global_id projection (PR29-E kept the view
 *     as a documented compat surface; pg_cron
 *     'talleres_period_closer' reads the legacy table directly).
 *  9. Preserves taller_periodos_generales (PR29-E's deprecation
 *     marker, table, trigger, and view body stay — "PR33-F.1 (future)
 *     will deal with that").
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

describe('PR33 migration — rollback of global ediciones model', () => {
  const migrationPath = findMigration(/_pr33_rollback_global_ediciones\.sql$/)

  it('PR33 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('File discovery', () => {
    it('uses the PR33 naming convention (suffix _pr33_rollback_global_ediciones.sql)', () => {
      expect(migrationPath).toMatch(/_pr33_rollback_global_ediciones\.sql$/)
    })
  })

  describe('Compat view drop BEFORE column drop (§1)', () => {
    it('DROPs the compat view first (DROP VIEW IF EXISTS)', () => {
      // The view projects taller_ediciones.edicion_global_id. We must
      // drop it before the column drop to avoid an implicit CASCADE
      // destroying the view body.
      expect(content).toMatch(
        /DROP\s+VIEW\s+IF\s+EXISTS\s+public\.v_taller_periodos_generales_compat/i
      )
    })

    it('places the view drop BEFORE the column drop (ordering invariant)', () => {
      const viewDropIdx = content.search(
        /DROP\s+VIEW\s+IF\s+EXISTS\s+public\.v_taller_periodos_generales_compat/i,
      )
      const colDropIdx = content.search(
        /ALTER\s+TABLE\s+public\.taller_ediciones\s+DROP\s+COLUMN/i,
      )
      expect(viewDropIdx).toBeGreaterThan(-1)
      expect(colDropIdx).toBeGreaterThan(-1)
      expect(viewDropIdx).toBeLessThan(colDropIdx)
    })
  })

  describe('Index drop BEFORE column drop (§2)', () => {
    it('DROPs the partial index idx_taller_ediciones_edicion_global', () => {
      expect(content).toMatch(
        /DROP\s+INDEX\s+IF\s+EXISTS\s+public\.idx_taller_ediciones_edicion_global/i
      )
    })

    it('places the index drop BEFORE the column drop (ordering invariant)', () => {
      const idxDropIdx = content.search(
        /DROP\s+INDEX\s+IF\s+EXISTS\s+public\.idx_taller_ediciones_edicion_global/i,
      )
      const colDropIdx = content.search(
        /ALTER\s+TABLE\s+public\.taller_ediciones\s+DROP\s+COLUMN/i,
      )
      expect(idxDropIdx).toBeGreaterThan(-1)
      expect(colDropIdx).toBeGreaterThan(-1)
      expect(idxDropIdx).toBeLessThan(colDropIdx)
    })
  })

  describe('FK column drop (§3)', () => {
    it('DROPs the nullable FK column on taller_ediciones', () => {
      expect(content).toMatch(
        /ALTER\s+TABLE\s+public\.taller_ediciones\s+DROP\s+COLUMN\s+IF\s+EXISTS\s+edicion_global_id/i
      )
    })
  })

  describe('4 RPC drops (§4)', () => {
    const expectedRpcs = [
      'create_edicion_global',
      'open_edicion_global',
      'close_edicion_global',
      'cancel_edicion_global',
    ]

    for (const rpc of expectedRpcs) {
      it(`DROPs public.${rpc} (DROP FUNCTION IF EXISTS)`, () => {
        expect(content).toMatch(
          new RegExp(`DROP\\s+FUNCTION\\s+IF\\s+EXISTS\\s+public\\.${rpc}\\b`, 'i'),
        )
      })
    }
  })

  describe('Global ediciones table drop (§5)', () => {
    it('DROPs public.taller_ediciones_globales TABLE with CASCADE', () => {
      expect(content).toMatch(
        /DROP\s+TABLE\s+IF\s+EXISTS\s+public\.taller_ediciones_globales\s+CASCADE/i
      )
    })
  })

  describe('Trigger function drop (§6)', () => {
    it('DROPs the dedicated trigger function fn_set_updated_at_taller_ediciones_globales', () => {
      // The function only fired on the dropped table; no other code uses it.
      expect(content).toMatch(
        /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.fn_set_updated_at_taller_ediciones_globales\s*\(\s*\)/i
      )
    })
  })

  describe('Compat view recreated without edicion_global_id (§7)', () => {
    it('recreates v_taller_periodos_generales_compat after the rollback', () => {
      // The view is a documented PR29-E compat surface. The pg_cron
      // 'talleres_period_closer' reads taller_periodos_generales
      // directly (not this view), but the view stays as a stable
      // observability surface.
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.v_taller_periodos_generales_compat\s+AS/i
      )
    })

    it('recreated view body does NOT project edicion_global_id', () => {
      // Two CREATE OR REPLACE VIEW statements in the file: the second
      // is the recreated one. The recreated body must not include
      // edicion_global_id. We match the LAST occurrence of the view
      // definition to assert the new body is clean.
      const matches = [
        ...content.matchAll(
          /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.v_taller_periodos_generales_compat[\s\S]*?;/gi,
        ),
      ]
      expect(matches.length).toBeGreaterThan(0)
      const lastBody = matches[matches.length - 1][0]
      expect(lastBody).not.toMatch(/edicion_global_id/i)
    })

    it('recreated view still JOINs taller_periodos_generales and taller_ediciones', () => {
      const matches = [
        ...content.matchAll(
          /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.v_taller_periodos_generales_compat[\s\S]*?;/gi,
        ),
      ]
      const lastBody = matches[matches.length - 1][0]
      expect(lastBody).toMatch(/FROM\s+public\.taller_periodos_generales/i)
      expect(lastBody).toMatch(/JOIN\s+public\.taller_ediciones/i)
    })

    it('recreated view still exposes taller_estado and taller_tipo', () => {
      const matches = [
        ...content.matchAll(
          /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.v_taller_periodos_generales_compat[\s\S]*?;/gi,
        ),
      ]
      const lastBody = matches[matches.length - 1][0]
      expect(lastBody).toMatch(/taller_estado/i)
      expect(lastBody).toMatch(/taller_tipo/i)
    })
  })

  describe('PR29-E deprecation preserved (§8)', () => {
    it('does NOT drop public.taller_periodos_generales', () => {
      // The PR29-E deprecation marker + table + trigger stay. PR33-F.1
      // (future) will deal with the actual DROP. PR33 only rolls back
      // the ediciones globales model.
      expect(content).not.toMatch(
        /DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\.taller_periodos_generales/i
      )
    })

    it('does NOT drop the trigger function assert_no_direct_taller_periodo_insert', () => {
      // The PR29-E BEFORE INSERT trigger stays.
      expect(content).not.toMatch(
        /DROP\s+FUNCTION\s+(IF\s+EXISTS\s+)?public\.assert_no_direct_taller_periodo_insert/i
      )
    })

    it('does NOT drop the local-ediciones recurrence_rule column (PR11)', () => {
      // The recurrence path is the alternative to globales. Must stay.
      expect(content).not.toMatch(/DROP\s+COLUMN[^;]*?recurrence_rule/i)
    })
  })
})
