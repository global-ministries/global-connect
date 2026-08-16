/**
 * PR29-F.1 — Corrective migration dry-run probe.
 * F(talleres/schema/junction-backfill) — backfill missed
 * taller_edicion_global_participantes + FK drop on
 * taller_ediciones_globales.created_by_persona_id.
 *
 * RED test: verifies the PR29-F.1 migration file satisfies
 * acceptance criteria BEFORE application (mirrors the
 * ediciones-globales.test.ts pattern, see
 * __tests__/lib/platform/talleres/schema/ediciones-globales.test.ts).
 *
 * Background — Bug #A reported by user 2026-08-16:
 *   `/admin/talleres/ediciones-globales/[id]` for Edición Legacy
 *   showed 0 talleres even though 4 ediciones locales had
 *   edicion_global_id pointing to Legacy. The UI reads from
 *   taller_edicion_global_participantes (junction), but the PR29-B
 *   backfill only populated the FK column on taller_ediciones.
 *
 * Background — Bug #B reported by user 2026-08-16:
 *   Creating a new edicion_global via UI failed with
 *   "insert or update on table taller_ediciones_globales violates
 *   foreign key constraint taller_ediciones_globales_created_by_persona_id_fkey".
 *   The FK points to public.usuarios(id), but auth.uid() returns
 *   auth.users.id — different tables. Same systemic issue
 *   documented for dream_team_capability_grants.persona_id.
 *
 * Acceptance criteria:
 *  1. Migration file exists with the PR29-F.1 naming convention
 *     (`<ts>_pr29_f1_junction_backfill_and_fk_fix.sql`).
 *  2. INSERT INTO public.taller_edicion_global_participantes
 *     selects edicion_global_id and taller_id.
 *  3. JOIN through public.talleres (or talleres_crecimiento_metadata
 *     — the test accepts both names per the conceptual-vs-live
 *     naming convention documented in ediciones-globales.test.ts).
 *  4. Filters WHERE edicion_global_id IS NOT NULL.
 *  5. ON CONFLICT (edicion_global_id, taller_id) DO NOTHING
 *     (idempotent + preserves manual additions).
 *  6. ALTER TABLE public.taller_ediciones_globales DROP CONSTRAINT
 *     IF EXISTS taller_ediciones_globales_created_by_persona_id_fkey.
 *  7. COMMENT on created_by_persona_id documents the systemic
 *     auth.users.id vs public.usuarios.id mismatch.
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

describe('PR29-F.1 migration — junction backfill + FK drop', () => {
  const migrationPath = findMigration(/_pr29_f1_junction_backfill_and_fk_fix\.sql$/)

  it('PR29-F.1 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('Junction backfill — Bug #A', () => {
    it('INSERTs into public.taller_edicion_global_participantes', () => {
      // The junction table is the source of truth for the admin UI.
      // The migration MUST insert here to make the talleres list work.
      expect(content).toMatch(
        /INSERT\s+INTO\s+public\.taller_edicion_global_participantes/i
      )
    })

    it('JOINs through public.talleres (or talleres_crecimiento_metadata alias)', () => {
      // The live table is public.talleres (renamed from
      // talleres_crecimiento_metadata in PR23.2b). The test
      // accepts either name per the conceptual-vs-live naming
      // convention documented in ediciones-globales.test.ts §10.
      const joinsTalleres = /JOIN\s+public\.talleres\b/i.test(content)
      const joinsMetadata = /JOIN\s+public\.talleres_crecimiento_metadata\b/i.test(
        content
      )
      expect(joinsTalleres || joinsMetadata).toBe(true)
    })

    it('JOINs through public.taller_ediciones (or talleres_crecimiento_metadata alias)', () => {
      // Same naming flexibility — the local-ediciones source.
      const joinsEdiciones = /FROM\s+public\.taller_ediciones\b/i.test(content)
      const joinsMetadata =
        /FROM\s+public\.talleres_crecimiento_metadata\b/i.test(content)
      expect(joinsEdiciones || joinsMetadata).toBe(true)
    })

    it('filters WHERE edicion_global_id IS NOT NULL', () => {
      // Only ediciones that have been assigned to a global should
      // contribute to the junction. Ediciones with NULL FK are
      // orphans (the UI never shows them under a global anyway).
      expect(content).toMatch(
        /WHERE[\s\S]*?edicion_global_id\s+IS\s+NOT\s+NULL/i
      )
    })

    it('uses ON CONFLICT (edicion_global_id, taller_id) DO NOTHING', () => {
      // Idempotency + respect for manual additions. The user's
      // manual tests had already populated 2 junction rows; the
      // backfill must not duplicate them.
      expect(content).toMatch(
        /ON\s+CONFLICT\s*\(\s*edicion_global_id\s*,\s*taller_id\s*\)\s+DO\s+NOTHING/i
      )
    })
  })

  describe('FK drop — Bug #B', () => {
    it('DROP CONSTRAINT IF EXISTS taller_ediciones_globales_created_by_persona_id_fkey', () => {
      // The FK that pointed at public.usuarios(id) must be removed
      // so that INSERTs with auth.uid() (auth.users.id) do not
      // violate the constraint.
      expect(content).toMatch(
        /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+taller_ediciones_globales_created_by_persona_id_fkey/i
      )
    })

    it('targets public.taller_ediciones_globales for the FK drop', () => {
      // Make sure the DROP is on the correct table — not on
      // taller_ediciones (which has its own edicion_global_id FK
      // that we want to keep).
      expect(content).toMatch(
        /ALTER\s+TABLE\s+public\.taller_ediciones_globales[\s\S]*?DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+taller_ediciones_globales_created_by_persona_id_fkey/i
      )
    })

    it('documents the auth.users.id vs public.usuarios.id mismatch in a COMMENT', () => {
      // The migration must leave a trail explaining why the FK is
      // gone — so future agents don't try to "fix" it by re-adding
      // the constraint. The COMMENT must mention auth.uid().
      const commentMatch = content.match(
        /COMMENT\s+ON\s+COLUMN\s+public\.taller_ediciones_globales\.created_by_persona_id[\s\S]*?'([^']*)'/i
      )
      expect(commentMatch).not.toBeNull()
      if (!commentMatch) return
      expect(commentMatch[1]).toMatch(/auth\.uid\(\)/i)
      expect(commentMatch[1]).toMatch(/auth\.users/i)
      expect(commentMatch[1]).toMatch(/public\.usuarios/i)
    })
  })
})
