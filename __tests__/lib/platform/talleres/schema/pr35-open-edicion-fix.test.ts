/**
 * PR35 — Fix open_edicion RPC body after PR23.2b table rename.
 *
 * F(talleres/schema/pr35-open-edicion-fix) — verifies the PR35
 * migration file satisfies the fix acceptance criteria BEFORE
 * application (mirrors the F4 schema-migration-dry-run pattern, see
 * __tests__/lib/platform/talleres/schema/pr33-rollback.test.ts).
 *
 * Background — PR23.2b renamed `talleres_crecimiento_metadata` →
 * `taller_ediciones` on prod (applied directly via ALTER TABLE …
 * RENAME TO, not captured in a migration file). The `open_edicion`
 * RPC body was NOT updated alongside that rename. Every call to the
 * 9-arg overload of `open_edicion` was failing with:
 *   "relation 'public.talleres_crecimiento_metadata' does not exist"
 *
 * The admin flow "abrir edicion" (open-edicion-form.tsx →
 * actions.ts → client.rpc('open_edicion')) is blocked as a result.
 *
 * Acceptance criteria (PR35 scope):
 *  1. Migration file exists with the PR35 naming convention
 *     (`<ts>_pr35_fix_open_edicion_rename.sql`).
 *  2. Defines/REPLACES `public.open_edicion` (CREATE OR REPLACE
 *     FUNCTION).
 *  3. The new body does NOT reference the dead table name
 *     `talleres_crecimiento_metadata` in any SQL statement (only in
 *     comments, which we explicitly allow as "was the old name"
 *     historical notes).
 *  4. The new body INSERTs into `public.taller_ediciones`
 *     (the post-rename table).
 *  5. The new body UPDATEs `public.taller_ediciones` (not the old
 *     table) — the periodo backfill path.
 *  6. The migration ends with `GRANT EXECUTE ON FUNCTION
 *     public.open_edicion(...) TO authenticated` for both overloads
 *     (the 9-arg and the 10-arg).
 *
 * Out of scope (intentionally NOT asserted here):
 *  - The 9-arg overload's `tipo` column population — that overload
 *    has a pre-existing CHECK constraint violation that's been
 *    broken since PR23.2a (it writes `v_taller.modalidad_default`
 *    like 'periodo_general' into a `tipo` column that expects
 *    'individual'|'pareja'). PR35 only fixes the table rename; the
 *    9-arg is kept as legacy signature for back-compat. The admin
 *    UI (`openEdicion` action) always passes `p_tipo`, so it routes
 *    to the 10-arg overload, which works correctly.
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

describe('PR35 migration — fix open_edicion RPC after PR23.2b table rename', () => {
  const migrationPath = findMigration(/_pr35_fix_open_edicion_rename\.sql$/)

  it('PR35 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  // Strip SQL comments so we only assert on actual SQL statements
  // (not on "was the old name" historical notes in comments).
  const rawContent = readFileSync(migrationPath, 'utf-8')
  const sqlOnly = rawContent.replace(/--[^\n]*/g, '')

  describe('File discovery', () => {
    it('uses the PR35 naming convention (suffix _pr35_fix_open_edicion_rename.sql)', () => {
      expect(migrationPath).toMatch(/_pr35_fix_open_edicion_rename\.sql$/)
    })
  })

  describe('Function definition (§1)', () => {
    it('CREATE OR REPLACE FUNCTION public.open_edicion appears at least once', () => {
      // Both overloads are recreated; we expect at least 2 occurrences.
      const matches = [
        ...sqlOnly.matchAll(
          /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.open_edicion\s*\(/gi,
        ),
      ]
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })

    it('recreates both overloads (9-arg without p_tipo, 10-arg with p_tipo)', () => {
      // The 9-arg overload: uuid, text, text, int, int, text, timestamptz, timestamptz, jsonb
      // (no p_tipo between the first uuid and the second text).
      // The 10-arg overload: uuid, text, text, text, int, int, text, timestamptz, timestamptz, jsonb.
      // We match the parameter-list header lines inside the function signatures.
      const nineArgSig = sqlOnly.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.open_edicion\s*\(\s*\n\s*p_taller_id\s+uuid\s*,\s*\n\s*p_nombre_edicion\s+text/i,
      )
      const tenArgSig = sqlOnly.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.open_edicion\s*\(\s*\n\s*p_taller_id\s+uuid\s*,\s*\n\s*p_tipo\s+text/i,
      )
      expect(nineArgSig).not.toBeNull()
      expect(tenArgSig).not.toBeNull()
    })
  })

  describe('Dead table reference removed (§2)', () => {
    it('SQL body does NOT reference "talleres_crecimiento_metadata" in any statement', () => {
      // We strip comments first, so this assertion only catches real
      // SQL references (INSERT/UPDATE/SELECT/etc.), not the historical
      // "was the old name" notes in comments.
      expect(sqlOnly).not.toMatch(/talleres_crecimiento_metadata/i)
    })

    it('historical mention of the old name is allowed ONLY in comments (preserved in raw file)', () => {
      // The migration may include a comment explaining the rename
      // (e.g. "-- PR35: was `talleres_crecimiento_metadata`").
      // The raw file should keep at least one such comment for
      // historical context. This is a documentation invariant, not a
      // bug.
      expect(rawContent).toMatch(/talleres_crecimiento_metadata/i)
    })
  })

  describe('New table name referenced in SQL (§3)', () => {
    it('INSERTs into public.taller_ediciones (the post-PR23.2b table)', () => {
      expect(sqlOnly).toMatch(
        /INSERT\s+INTO\s+public\.taller_ediciones\s*\(/i,
      )
    })

    it('UPDATEs public.taller_ediciones (the periodo backfill path)', () => {
      expect(sqlOnly).toMatch(
        /UPDATE\s+public\.taller_ediciones\s+SET\s+periodo_general_id\s*=/i,
      )
    })

    it('does NOT INSERT into "talleres_crecimiento_metadata" anywhere', () => {
      expect(sqlOnly).not.toMatch(
        /INSERT\s+INTO\s+public\.talleres_crecimiento_metadata/i,
      )
    })

    it('does NOT UPDATE "talleres_crecimiento_metadata" anywhere', () => {
      expect(sqlOnly).not.toMatch(
        /UPDATE\s+public\.talleres_crecimiento_metadata/i,
      )
    })
  })

  describe('Read path preserved (§4)', () => {
    it('still reads from public.talleres (the abstract taller lookup)', () => {
      // The RPC validates the taller exists before creating the edicion.
      expect(sqlOnly).toMatch(
        /FROM\s+public\.talleres\s+WHERE\s+id\s*=\s*p_taller_id/i,
      )
    })

    it('still INSERTs into public.operating_core_events (kind=workshop)', () => {
      // The workshop event is created before the edicion row.
      expect(sqlOnly).toMatch(
        /INSERT\s+INTO\s+public\.operating_core_events\s*\(/i,
      )
      expect(sqlOnly).toMatch(/'workshop'/)
    })

    it('still INSERTs into public.taller_periodos_generales when modalidad=periodo_general', () => {
      expect(sqlOnly).toMatch(
        /INSERT\s+INTO\s+public\.taller_periodos_generales\s*\(/i,
      )
    })
  })

  describe('Auth + capability gate preserved (§5)', () => {
    it('still calls auth.uid() for the auth check', () => {
      expect(sqlOnly).toMatch(/v_user_id\s*:=\s*auth\.uid\(\s*\)/i)
    })

    it('still calls public.auth_has_talleres_capability for the cap gate', () => {
      expect(sqlOnly).toMatch(
        /public\.auth_has_talleres_capability\s*\(\s*'talleres_crecimiento\.director\.write'\s*\)/i,
      )
      expect(sqlOnly).toMatch(
        /public\.auth_has_talleres_capability\s*\(\s*'talleres_crecimiento\.admin\.manage'\s*\)/i,
      )
    })
  })

  describe('GRANTs re-issued at the end (§6)', () => {
    it('GRANTs EXECUTE on the 9-arg overload TO authenticated', () => {
      // The 9-arg signature: uuid, text, text, int, int, text, timestamptz, timestamptz, jsonb
      // (no p_tipo after the first uuid).
      const grant9 = sqlOnly.match(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.open_edicion\s*\(\s*uuid\s*,\s*text\s*,\s*text\s*,\s*int\s*,\s*int\s*,\s*text\s*,\s*timestamptz\s*,\s*timestamptz\s*,\s*jsonb\s*\)\s+TO\s+authenticated/i,
      )
      expect(grant9).not.toBeNull()
    })

    it('GRANTs EXECUTE on the 10-arg overload TO authenticated', () => {
      // The 10-arg signature: uuid, text, text, text, int, int, text, timestamptz, timestamptz, jsonb.
      const grant10 = sqlOnly.match(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.open_edicion\s*\(\s*uuid\s*,\s*text\s*,\s*text\s*,\s*text\s*,\s*int\s*,\s*int\s*,\s*text\s*,\s*timestamptz\s*,\s*timestamptz\s*,\s*jsonb\s*\)\s+TO\s+authenticated/i,
      )
      expect(grant10).not.toBeNull()
    })

    it('REVOKEs FROM PUBLIC, anon for both overloads (defense in depth)', () => {
      // The migration should explicitly REVOKE to prevent anon access.
      expect(sqlOnly).toMatch(
        /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.open_edicion\s*\(\s*uuid\s*,\s*text\s*,\s*text\s*,\s*int\s*,\s*int\s*,\s*text\s*,\s*timestamptz\s*,\s*timestamptz\s*,\s*jsonb\s*\)\s+FROM\s+PUBLIC\s*,\s*anon/i,
      )
      expect(sqlOnly).toMatch(
        /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.open_edicion\s*\(\s*uuid\s*,\s*text\s*,\s*text\s*,\s*text\s*,\s*int\s*,\s*int\s*,\s*text\s*,\s*timestamptz\s*,\s*timestamptz\s*,\s*jsonb\s*\)\s+FROM\s+PUBLIC\s*,\s*anon/i,
      )
    })
  })
})
