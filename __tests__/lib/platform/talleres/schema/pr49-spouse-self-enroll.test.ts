/**
 * PR49 (restructure PR G) — Spouse (cónyuge) self-enrollment RLS.
 * F(talleres/schema/pr49-spouse-self-enroll) — verifies the migration
 * file satisfies the acceptance criteria BEFORE application (static
 * SQL-text assertions, mirrors pr45-talleres-temporadas.test.ts).
 *
 * Background — the roadmap maestro (Fase 5) mirrors Grupos de Vida with a
 * self-enroll twist: a participant enrolls themselves (estado='pendiente';
 * a coordinator approves later). PR41
 * (20260817150000_allow_participant_self_enroll.sql) opened participant
 * self-enroll but hard-blocked couple units — `companero_id IS NULL` — so
 * only a coordinator could build a pareja inscription. That contradicts the
 * product intent: for a `pareja` taller the participant must enroll their
 * spouse in the same act.
 *
 * This migration forward-only REPLACES the `taller_inscripciones_insert`
 * policy (DROP POLICY + CREATE POLICY), preserving the operativa branch
 * verbatim and widening ONLY the participant branch so `companero_id` is
 * allowed when the target edición is `tipo='pareja'`:
 *
 *   companero_id IS NULL                       -- individual (unchanged), OR
 *   OR (
 *     companero_id <> persona_principal_id     -- not self
 *     AND EXISTS(companero_id in usuarios)     -- a real person
 *     AND link_type IS NOT NULL                -- couple-unit shape
 *     AND EXISTS(taller_ediciones.tipo='pareja') -- the taller allows it
 *   )
 *
 * R9 — the marriage relationship is NOT verified in-DB. The couple-unit
 * BEFORE trigger (trg_taller_inscripciones_couple_unit) keeps enforcing
 * link_type ⇔ companero_id; this policy only authorizes the INSERT.
 *
 * The correlated reference to the parent edición is written as
 * `taller_ediciones.tipo` correlated on `taller_inscripciones.taller_id`
 * (fully qualified) so it binds to the NEW inscription row unambiguously,
 * even if the occurrence table ever gains its own `taller_id` column.
 *
 * LIVE PRODUCTION — additive + forward-only ONLY. Policy swap via
 * DROP POLICY + CREATE POLICY; no destructive DDL on data tables.
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

describe('PR49 migration — spouse self-enrollment RLS', () => {
  const migrationPath = findMigration(/_pr49_spouse_self_enroll\.sql$/)

  it('PR49 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('File discovery', () => {
    it('uses the PR49 naming convention (suffix _pr49_spouse_self_enroll.sql)', () => {
      expect(migrationPath).toMatch(/_pr49_spouse_self_enroll\.sql$/)
    })
  })

  describe('Forward-only policy replace (§5)', () => {
    it('DROPs the existing taller_inscripciones_insert policy IF EXISTS', () => {
      expect(content).toMatch(
        /DROP\s+POLICY\s+IF\s+EXISTS\s+"taller_inscripciones_insert"\s+ON\s+public\.taller_inscripciones/i,
      )
    })

    it('re-CREATEs the taller_inscripciones_insert policy FOR INSERT', () => {
      expect(content).toMatch(
        /CREATE\s+POLICY\s+"taller_inscripciones_insert"[\s\S]*?ON\s+public\.taller_inscripciones[\s\S]*?FOR\s+INSERT/i,
      )
    })
  })

  describe('Operativa branch preserved verbatim (§5)', () => {
    it('keeps coordinator.write OR director.write OR admin.manage', () => {
      expect(content).toMatch(
        /auth_has_talleres_capability\(\s*'talleres_crecimiento\.coordinator\.write'/i,
      )
      expect(content).toMatch(
        /auth_has_talleres_capability\(\s*'talleres_crecimiento\.director\.write'/i,
      )
      expect(content).toMatch(
        /auth_has_talleres_capability\(\s*'talleres_crecimiento\.admin\.manage'/i,
      )
    })
  })

  describe('Participant branch — self-service guards preserved (§5)', () => {
    it('requires participation.read', () => {
      expect(content).toMatch(
        /auth_has_talleres_capability\(\s*'talleres_crecimiento\.participation\.read'/i,
      )
    })

    it('requires estado = pendiente (cannot self-approve)', () => {
      expect(content).toMatch(/estado\s*=\s*'pendiente'/i)
    })

    it('binds persona_principal_id to the caller (usuarios.auth_id = auth.uid())', () => {
      expect(content).toMatch(
        /persona_principal_id\s+IN\s*\(\s*SELECT\s+id\s+FROM\s+public\.usuarios\s+WHERE\s+auth_id\s*=\s*auth\.uid\(\)\s*\)/i,
      )
    })
  })

  describe('Participant branch — companero_id widened for pareja (§5)', () => {
    it('still allows the individual case (companero_id IS NULL) as one arm of an OR', () => {
      expect(content).toMatch(/companero_id\s+IS\s+NULL\s+OR/i)
    })

    it('rejects self as compañero (companero_id <> persona_principal_id)', () => {
      expect(content).toMatch(/companero_id\s*<>\s*persona_principal_id/i)
    })

    it('requires the compañero to be a real usuario', () => {
      expect(content).toMatch(
        /EXISTS\s*\([\s\S]*?FROM\s+public\.usuarios[\s\S]*?=\s*taller_inscripciones\.companero_id/i,
      )
    })

    it('requires link_type IS NOT NULL (couple-unit shape)', () => {
      expect(content).toMatch(/link_type\s+IS\s+NOT\s+NULL/i)
    })

    it('gates the spouse case on the target edición being tipo = pareja', () => {
      expect(content).toMatch(
        /EXISTS\s*\([\s\S]*?FROM\s+public\.taller_ediciones[\s\S]*?tipo\s*=\s*'pareja'/i,
      )
    })

    it('correlates the edición lookup on the NEW row via qualified taller_inscripciones.taller_id', () => {
      expect(content).toMatch(
        /taller_ediciones\s+\w+[\s\S]*?=\s*taller_inscripciones\.taller_id/i,
      )
    })
  })

  describe('R9 — no in-DB marriage verification', () => {
    it('does NOT query a relationship/marriage table', () => {
      expect(content).not.toMatch(
        /FROM\s+public\.(matrimonios|conyuges|c[oó]nyuges|relaciones|parejas|vinculos|v[ií]nculos)/i,
      )
    })

    it('does NOT assert a specific link_type value (shape only, not the relationship)', () => {
      expect(content).not.toMatch(/link_type\s*=\s*'(matrimonio|novios)'/i)
    })
  })

  describe('Additive + forward-only — no destructive DDL on data tables', () => {
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
