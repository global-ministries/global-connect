/**
 * Talleres self-enroll — edicion inscribible + cohorte binding.
 * F(talleres/schema/self-enroll-edicion-inscribible) — verifies the
 * migration file satisfies the acceptance criteria BEFORE application
 * (static SQL-text assertions, mirrors pr49-spouse-self-enroll.test.ts).
 *
 * Background — odd/tasks/talleres-autoinscripcion.md T2: the self-enroll
 * branch of taller_inscripciones_insert never checked that the edicion
 * (taller_id) was actually open for enrollment, nor that cohorte_id
 * belonged to that same edicion. This migration ALTER POLICYs
 * taller_inscripciones_insert, keeping the coordinator.write /
 * director.write / admin.manage branches and every existing self-branch
 * guard (estado='pendiente', persona_principal_id = caller, pareja/
 * companero shape) byte-identical, and adds exactly two guards to the self
 * branch:
 *   - the edicion has estado IN ('abierto', 'en_curso')
 *   - cohorte_id belongs to that same edicion
 *     (talleres_crecimiento_cohortes.taller_id = taller_inscripciones.taller_id)
 *
 * Unlike PR49, this migration uses ALTER POLICY (not DROP+CREATE) — the
 * convention set by 20260821000004_cimiento3a_talleres_coordinador_scope_rls.sql.
 *
 * LIVE PRODUCTION — additive + forward-only ONLY. Policy rewrite via
 * ALTER POLICY; no destructive DDL on data tables.
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

describe('talleres self-enroll migration — edicion inscribible + cohorte binding', () => {
  const migrationPath = findMigration(/_talleres_autoinscripcion_edicion_inscribible\.sql$/)

  it('the migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('Policy rewrite convention (ALTER POLICY, not DROP+CREATE)', () => {
    it('uses ALTER POLICY on taller_inscripciones_insert', () => {
      expect(content).toMatch(
        /ALTER\s+POLICY\s+taller_inscripciones_insert\s+ON\s+public\.taller_inscripciones/i,
      )
    })

    it('sets a new WITH CHECK clause', () => {
      expect(content).toMatch(
        /ALTER\s+POLICY\s+taller_inscripciones_insert[\s\S]*?WITH\s+CHECK\s*\(/i,
      )
    })

    it('does NOT DROP the policy', () => {
      expect(content).not.toMatch(/DROP\s+POLICY/i)
    })
  })

  describe('Operativa branch preserved verbatim', () => {
    it('keeps the scoped coordinator.write branch', () => {
      expect(content).toMatch(
        /auth_has_talleres_capability_scoped\(\s*'talleres_crecimiento\.coordinator\.write'::text,\s*talleres_equipo_de_cohorte\(cohorte_id\)\s*\)/i,
      )
    })

    it('keeps director.write OR admin.manage', () => {
      expect(content).toMatch(
        /auth_has_talleres_capability\(\s*'talleres_crecimiento\.director\.write'/i,
      )
      expect(content).toMatch(
        /auth_has_talleres_capability\(\s*'talleres_crecimiento\.admin\.manage'/i,
      )
    })
  })

  describe('Self-enroll branch — existing guards preserved', () => {
    it('requires estado = pendiente (cannot self-approve)', () => {
      expect(content).toMatch(/estado\s*=\s*'pendiente'/i)
    })

    it('binds persona_principal_id to the caller (usuarios.auth_id = auth.uid())', () => {
      expect(content).toMatch(
        /persona_principal_id\s+IN\s*\(\s*SELECT\s+usuarios\.id\s+FROM\s+usuarios\s+WHERE\s+\(?usuarios\.auth_id\s*=\s*auth\.uid\(\)/i,
      )
    })

    it('keeps the companero_id IS NULL individual-case arm', () => {
      expect(content).toMatch(/companero_id\s+IS\s+NULL/i)
    })

    it('keeps the pareja companero guard (link_type IS NOT NULL, tipo = pareja)', () => {
      expect(content).toMatch(/link_type\s+IS\s+NOT\s+NULL/i)
      expect(content).toMatch(
        /EXISTS\s*\([\s\S]*?FROM\s+taller_ediciones\s+te[\s\S]*?te\.tipo\s*=\s*'pareja'/i,
      )
    })

    it('does NOT require participation.read in the self branch', () => {
      expect(content).not.toMatch(/participation\.read/i)
    })
  })

  describe('New guards — this migration', () => {
    it('requires the edicion referenced by taller_id to be abierto or en_curso', () => {
      expect(content).toMatch(
        /EXISTS\s*\([\s\S]*?FROM\s+taller_ediciones\s+te[\s\S]*?te\.id\s*=\s*taller_inscripciones\.taller_id[\s\S]*?te\.estado\s*=\s*ANY\s*\(\s*ARRAY\s*\[\s*'abierto'::text,\s*'en_curso'::text\s*\]\s*\)/i,
      )
    })

    it('requires cohorte_id to belong to the same edicion as taller_id', () => {
      expect(content).toMatch(
        /EXISTS\s*\([\s\S]*?FROM\s+talleres_crecimiento_cohortes\s+c[\s\S]*?c\.id\s*=\s*taller_inscripciones\.cohorte_id[\s\S]*?c\.taller_id\s*=\s*taller_inscripciones\.taller_id/i,
      )
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

    it('contains NO DELETE FROM', () => {
      expect(content).not.toMatch(/DELETE\s+FROM/i)
    })
  })
})

describe('PR49 migration still passes with the self-enroll branch now guarded', () => {
  // Sanity: this new migration must not have touched the pr49 file, and
  // pr49's own assertions (companero/pareja shape) still hold against its
  // own migration file, independent of this one.
  const pr49Path = findMigration(/_pr49_spouse_self_enroll\.sql$/)

  it('the pr49 migration file still exists untouched', () => {
    expect(pr49Path).not.toBeNull()
  })
})
