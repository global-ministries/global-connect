/**
 * PR45 (restructure PR B) — Global season model: `talleres_temporadas`.
 * F(talleres/schema/pr45-talleres-temporadas) — verifies the migration
 * file satisfies the acceptance criteria BEFORE application (static
 * SQL-text assertions, mirrors the schema-migration-dry-run pattern of
 * __tests__/lib/platform/talleres/schema/pr33-rollback.test.ts).
 *
 * Background — the roadmap maestro (Fase 5) mirrors Grupos de Vida:
 *   - Temporada global (public.talleres_temporadas) ≈ GdV `temporadas`.
 *     A season the Director General opens; it decides WHICH talleres
 *     open enrollment via the junction below.
 *   - Junction (public.talleres_temporada_talleres) ≈ the "elijo qué
 *     talleres abren" control surface: (temporada_id, taller_id).
 *   - Edición local (public.taller_ediciones) gains a nullable
 *     temporada_id FK linking each occurrence to its season.
 *
 * This revives the PR29-B shape (dropped by PR33) under GdV-parity
 * names, with three corrections baked in:
 *   1. created_by_persona_id has NO FK (PR29-F.1 lesson: auth.uid()
 *      returns auth.users.id, not public.usuarios.id).
 *   2. RLS ships WITH the table (PR29-B shipped none).
 *   3. Legacy backfill also populates the junction (PR29-F.1 Bug #A:
 *      the FK column alone left the admin UI showing 0 talleres).
 *
 * LIVE PRODUCTION — additive + forward-only + idempotent ONLY. No
 * destructive DDL on data tables. The 4 real prod ediciones (orphaned
 * by PR33) get parked under a 'legacy' temporada without data loss.
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

describe('PR45 migration — talleres_temporadas (global season model)', () => {
  const migrationPath = findMigration(/_pr45_talleres_temporadas\.sql$/)

  it('PR45 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('File discovery', () => {
    it('uses the PR45 naming convention (suffix _pr45_talleres_temporadas.sql)', () => {
      expect(migrationPath).toMatch(/_pr45_talleres_temporadas\.sql$/)
    })
  })

  describe('talleres_temporadas table (§1)', () => {
    it('CREATEs public.talleres_temporadas idempotently (IF NOT EXISTS)', () => {
      expect(content).toMatch(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.talleres_temporadas/i,
      )
    })

    it('nombre has a length CHECK (2..120)', () => {
      expect(content).toMatch(/length\s*\(\s*nombre\s*\)\s+BETWEEN\s+2\s+AND\s+120/i)
    })

    it('slug is UNIQUE with a lowercase-kebab CHECK', () => {
      expect(content).toMatch(/slug[\s\S]*?UNIQUE/i)
      expect(content).toMatch(/slug\s*~\s*'\^\[a-z0-9-\]\+\$'/i)
    })

    it('estado is constrained to borrador/abierto/cerrado/cancelado', () => {
      expect(content).toMatch(
        /estado[\s\S]*?CHECK[\s\S]*?IN\s*\(\s*'borrador'\s*,\s*'abierto'\s*,\s*'cerrado'\s*,\s*'cancelado'\s*\)/i,
      )
    })

    it('fecha_cierre must be after fecha_apertura (CHECK)', () => {
      expect(content).toMatch(/CHECK\s*\(\s*fecha_cierre\s*>\s*fecha_apertura\s*\)/i)
    })

    it('has created_by_persona_id as a free-form audit column WITHOUT a FK (PR29-F.1 lesson)', () => {
      expect(content).toMatch(/created_by_persona_id\s+uuid/i)
      // Must NOT declare a FK to usuarios on that column.
      expect(content).not.toMatch(
        /created_by_persona_id\s+uuid[^,\n]*REFERENCES/i,
      )
    })

    it('has an updated_at trigger', () => {
      expect(content).toMatch(/CREATE\s+TRIGGER[\s\S]*?talleres_temporadas/i)
      expect(content).toMatch(/NEW\.updated_at\s*:?=\s*now\(\)/i)
    })

    it('indexes estado and fecha_apertura', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?talleres_temporadas\s*\(\s*estado/i,
      )
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?talleres_temporadas\s*\(\s*fecha_apertura/i,
      )
    })
  })

  describe('talleres_temporada_talleres junction (§2)', () => {
    it('CREATEs public.talleres_temporada_talleres idempotently', () => {
      expect(content).toMatch(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.talleres_temporada_talleres/i,
      )
    })

    it('temporada_id FK cascades on delete of the season', () => {
      expect(content).toMatch(
        /temporada_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.talleres_temporadas\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE/i,
      )
    })

    it('taller_id FK restricts delete of the abstract taller', () => {
      expect(content).toMatch(
        /taller_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.talleres\s*\(\s*id\s*\)\s+ON\s+DELETE\s+RESTRICT/i,
      )
    })

    it('is unique per (temporada_id, taller_id)', () => {
      expect(content).toMatch(
        /UNIQUE\s*\(\s*temporada_id\s*,\s*taller_id\s*\)/i,
      )
    })
  })

  describe('taller_ediciones.temporada_id FK column (§3)', () => {
    it('ADDs the nullable temporada_id column idempotently', () => {
      expect(content).toMatch(
        /ALTER\s+TABLE\s+public\.taller_ediciones\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+temporada_id\s+uuid/i,
      )
    })

    it('the new column references talleres_temporadas ON DELETE SET NULL', () => {
      expect(content).toMatch(
        /temporada_id\s+uuid[\s\S]*?REFERENCES\s+public\.talleres_temporadas\s*\(\s*id\s*\)\s+ON\s+DELETE\s+SET\s+NULL/i,
      )
    })

    it('adds a partial index on temporada_id WHERE NOT NULL', () => {
      expect(content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*?taller_ediciones\s*\(\s*temporada_id\s*\)[\s\S]*?WHERE\s+temporada_id\s+IS\s+NOT\s+NULL/i,
      )
    })
  })

  describe('RLS on both new tables (§4)', () => {
    it('ENABLEs RLS on talleres_temporadas', () => {
      expect(content).toMatch(
        /ALTER\s+TABLE\s+public\.talleres_temporadas\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      )
    })

    it('ENABLEs RLS on talleres_temporada_talleres', () => {
      expect(content).toMatch(
        /ALTER\s+TABLE\s+public\.talleres_temporada_talleres\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      )
    })

    it('REVOKEs from PUBLIC and anon, GRANTs to authenticated (house style)', () => {
      expect(content).toMatch(/REVOKE\s+ALL\s+ON\s+TABLE\s+public\.talleres_temporadas\s+FROM\s+PUBLIC,\s*anon/i)
      expect(content).toMatch(/GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+public\.talleres_temporadas\s+TO\s+authenticated/i)
    })

    it('gates writes to director.write OR admin.manage', () => {
      // At least one write policy references director.write; admin.manage
      // is the DG override.
      expect(content).toMatch(/auth_has_talleres_capability\(\s*'talleres_crecimiento\.director\.write'/i)
      expect(content).toMatch(/auth_has_talleres_capability\(\s*'talleres_crecimiento\.admin\.manage'/i)
    })

    it('gates reads to metrics.read OR director.read OR admin.manage', () => {
      expect(content).toMatch(/auth_has_talleres_capability\(\s*'talleres_crecimiento\.metrics\.read'/i)
      expect(content).toMatch(/auth_has_talleres_capability\(\s*'talleres_crecimiento\.director\.read'/i)
    })

    it('uses uniquely-suffixed policy names (_select/_insert/_update/_delete) per table', () => {
      const normalized = content.toLowerCase()
      for (const table of ['talleres_temporadas', 'talleres_temporada_talleres']) {
        for (const suffix of ['select', 'insert', 'update', 'delete']) {
          expect(normalized).toContain(`create policy "${table}_${suffix}"`)
        }
      }
    })
  })

  describe('Idempotent legacy backfill (§5) — LIVE PRODUCTION safety', () => {
    it('inserts a legacy temporada ON CONFLICT (slug) DO NOTHING', () => {
      expect(content).toMatch(/'legacy'/)
      expect(content).toMatch(/ON\s+CONFLICT\s*\(\s*slug\s*\)\s+DO\s+NOTHING/i)
    })

    it('parks orphan ediciones under legacy ONLY where temporada_id IS NULL (never overwrites)', () => {
      expect(content).toMatch(
        /UPDATE\s+public\.taller_ediciones[\s\S]*?SET\s+temporada_id\s*=[\s\S]*?WHERE\s+temporada_id\s+IS\s+NULL/i,
      )
    })

    it('backfills the junction from existing ediciones (PR29-F.1 Bug #A) ON CONFLICT DO NOTHING', () => {
      expect(content).toMatch(
        /INSERT\s+INTO\s+public\.talleres_temporada_talleres[\s\S]*?ON\s+CONFLICT[\s\S]*?DO\s+NOTHING/i,
      )
    })
  })

  describe('Additive + forward-only — no destructive DDL on data tables (§6)', () => {
    it('contains NO DROP TABLE', () => {
      expect(content).not.toMatch(/DROP\s+TABLE/i)
    })

    it('contains NO DROP COLUMN', () => {
      expect(content).not.toMatch(/DROP\s+COLUMN/i)
    })

    it('contains NO TRUNCATE', () => {
      expect(content).not.toMatch(/TRUNCATE/i)
    })
  })
})
