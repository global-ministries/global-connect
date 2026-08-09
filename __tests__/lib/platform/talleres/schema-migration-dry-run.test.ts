/**
 * PR2 — DT-006 / DT-007 / DT-008 — Talleres migration dry-run probe.
 * F(talleres/schema/helper) — auth_has_talleres_capability + scope helpers.
 *
 * RED test: verifies the migration files satisfy acceptance criteria
 * BEFORE application. Zero DDL destructive checks.
 *
 * Acceptance criteria:
 *  1. Migration file exists with correct naming convention
 *  2. auth_has_talleres_capability signature byte-identical to F4 precedent
 *     (CREATE OR REPLACE FUNCTION public.auth_has_talleres_capability
 *      (p_capability_key text) RETURNS boolean LANGUAGE sql STABLE
 *      SECURITY DEFINER SET search_path = public)
 *  3. Body queries public.dream_team_capability_grants with
 *     experience = 'talleres_crecimiento' and revoked_at IS NULL
 *  4. Persona resolution via usuarios.auth_id = auth.uid() (canonical,
 *     drift-fix proven pattern — never persona_id = auth.uid())
 *  5. Scope helpers present: puede_editar_taller_grupo,
 *     puede_gestionar_participantes_taller_grupo, puede_ver_taller_grupo
 *     (all LANGUAGE sql STABLE SECURITY DEFINER)
 *  6. GRANT EXECUTE ON FUNCTION ... TO authenticated, service_role (all 4)
 *  7. REVOKE from PUBLIC, anon, authenticated present
 *  8. No destructive DDL (no DROP TABLE, TRUNCATE, ALTER COLUMN DROP, DELETE FROM)
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function findMigration(pattern: RegExp): string | null {
  const allFiles = readdirSync(MIGRATIONS_DIR)
  const sqlFiles = allFiles.filter(function (f: string): boolean {
    return f.endsWith('.sql')
  })
  for (const file of sqlFiles) {
    if (pattern.test(file)) {
      return join(MIGRATIONS_DIR, file)
    }
  }
  return null
}

describe('Talleres migration — auth_has_talleres_capability + scope helpers', () => {
  const migrationPath = findMigration(/_talleres_helper_auth_has_capability\.sql$/)

  it('M1 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('auth_has_talleres_capability helper (DT-006)', () => {
    it('creates public.auth_has_talleres_capability with byte-identical F4 signature', () => {
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.auth_has_talleres_capability/i
      )
      expect(content).toMatch(
        /auth_has_talleres_capability\s*\(\s*p_capability_key\s+text\s*\)/i
      )
      expect(content).toMatch(/RETURNS\s+boolean/i)
      expect(content).toMatch(/LANGUAGE\s+sql/i)
      expect(content).toMatch(/STABLE/i)
      expect(content).toMatch(/SECURITY\s+DEFINER/i)
      expect(content).toMatch(/SET\s+search_path\s*=\s*public/i)
    })

    it('queries dream_team_capability_grants filtered by capability and experience', () => {
      expect(content).toMatch(/dream_team_capability_grants/i)
      expect(content).toMatch(/capability_key\s*=\s*p_capability_key/i)
      expect(content).toMatch(/experience\s*=\s*'talleres_crecimiento'/i)
      expect(content).toMatch(/revoked_at\s+IS\s+NULL/i)
    })

    it('binds identity server-side via usuarios.auth_id = auth.uid() (canonical)', () => {
      expect(content).toMatch(/usuarios/i)
      expect(content).toMatch(/auth_id\s*=\s*auth\.uid\(\)/i)
      // Must NOT bypass persona resolution or take a caller-supplied auth id
      expect(content).not.toMatch(/persona_id\s*=\s*auth\.uid\(\)/i)
      expect(content).not.toMatch(/p_auth_id/i)
    })
  })

  describe('Talleres scope helpers (DT-007)', () => {
    const scopeHelpers = [
      'puede_editar_taller_grupo',
      'puede_gestionar_participantes_taller_grupo',
      'puede_ver_taller_grupo',
    ]

    for (const helper of scopeHelpers) {
      describe(helper, () => {
        it('is created as LANGUAGE sql STABLE SECURITY DEFINER', () => {
          const re = new RegExp(
            `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${helper}\\s*\\([^)]*\\)[\\s\\S]*?RETURNS\\s+boolean[\\s\\S]*?(?=CREATE|$)` ,
            'i'
          )
          const match = content.match(re)
          expect(match).not.toBeNull()
          if (!match) return
          expect(match[0]).toMatch(/LANGUAGE\s+sql/i)
          expect(match[0]).toMatch(/STABLE/i)
          expect(match[0]).toMatch(/SECURITY\s+DEFINER/i)
        })

        it('accepts p_grupo_id uuid parameter', () => {
          expect(content).toMatch(
            new RegExp(
              `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${helper}\\s*\\(\\s*p_grupo_id\\s+uuid`,
              'i'
            )
          )
        })
      })
    }
  })

  describe('GRANT / REVOKE (DT-008)', () => {
    const allFour = [
      'auth_has_talleres_capability',
      'puede_editar_taller_grupo',
      'puede_gestionar_participantes_taller_grupo',
      'puede_ver_taller_grupo',
    ]

    for (const fn of allFour) {
      it(`GRANT EXECUTE ${fn} TO authenticated, service_role`, () => {
        expect(content).toMatch(
          new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\([^)]*\\)\\s+TO\\s+authenticated,\\s+service_role`, 'i')
        )
      })
    }

    it('REVOKE ALL from PUBLIC, anon, authenticated', () => {
      expect(content).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION/i)
      expect(content).toMatch(/FROM\s+PUBLIC,\s+anon,\s+authenticated/i)
    })
  })

  describe('No destructive DDL (I-6)', () => {
    it('does not DROP any table', () => {
      expect(content).not.toMatch(/DROP\s+TABLE/i)
    })

    it('does not ALTER COLUMN.*DROP', () => {
      expect(content).not.toMatch(/ALTER\s+COLUMN.*DROP/i)
    })

    it('does not TRUNCATE', () => {
      expect(content).not.toMatch(/TRUNCATE/i)
    })

    it('does not DELETE FROM any table', () => {
      expect(content).not.toMatch(/DELETE\s+FROM/i)
    })
  })
})