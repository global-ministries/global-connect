/**
 * W02 — DT-007 / DT-008 — Pastoral migration dry-run probe.
 * F(pastoral/schema/helper) — auth_has_pastoral_capability helper.
 * F(pastoral/schema/one-on-one-migration) — 1:1 tables + RLS.
 *
 * RED test: verifies the migration files satisfy acceptance criteria
 * BEFORE application. Zero DDL destructive checks (I-6, I-19, I-20).
 *
 * Acceptance criteria:
 *  1. M1 migration file exists with correct naming convention
 *  2. auth_has_pastoral_capability has correct signature (STABLE SECURITY DEFINER)
 *  3. GRANT EXECUTE TO authenticated, service_role present
 *  4. M2 migration file exists with correct naming convention
 *  5. pastoral_one_on_one, pastoral_one_on_one_participantes, pastoral_one_on_one_notas tables present
 *  6. RLS enabled on all three tables
 *  7. CHECK constraint for resumen length and sensitive patterns (D17)
 *  8. version column present on pastoral_one_on_one
 *  9. No DDL destructive statements (no DROP TABLE on protected tables)
 * 10. No writes to uno_a_uno_reuniones / uno_a_uno_participantes (I-19)
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

describe('Pastoral M1 migration — auth_has_pastoral_capability', () => {
  const migrationPath = findMigration(/_pastoral_helper_auth_has_capability\.sql$/)

  it('M1 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  it('creates auth_has_pastoral_capability with STABLE SECURITY DEFINER', () => {
    expect(content).toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.auth_has_pastoral_capability/i)
    expect(content).toMatch(/LANGUAGE\s+sql/i)
    expect(content).toMatch(/STABLE/i)
    expect(content).toMatch(/SECURITY\s+DEFINER/i)
  })

  it('accepts p_capability_key text parameter', () => {
    expect(content).toMatch(/auth_has_pastoral_capability\s*\(\s*p_capability_key\s+text/i)
  })

  it('queries platform_capability_grants', () => {
    expect(content).toMatch(/platform_capability_grants/i)
    expect(content).toMatch(/capability_key\s*=\s*p_capability_key/i)
  })

  it('binds auth.uid() server-side (not caller-supplied)', () => {
    expect(content).toMatch(/auth\.uid\(\)/i)
    // Must NOT have a parameter like p_auth_id
    expect(content).not.toMatch(/p_auth_id/i)
  })

  it('GRANT EXECUTE TO authenticated, service_role', () => {
    expect(content).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION/i)
    expect(content).toMatch(/authenticated/i)
    expect(content).toMatch(/service_role/i)
  })

  it('REVOKE from anon, PUBLIC', () => {
    expect(content).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION/i)
    expect(content).toMatch(/anon/i)
  })
})

describe('Pastoral M2 migration — 1:1 tables + RLS', () => {
  const migrationPath = findMigration(/_pastoral_tables_part1_one_on_one\.sql$/)

  it('M2 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('Tables created', () => {
    it('creates pastoral_one_on_one', () => {
      expect(content).toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?pastoral_one_on_one/i)
    })

    it('creates pastoral_one_on_one_participantes', () => {
      expect(content).toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?pastoral_one_on_one_participantes/i)
    })

    it('creates pastoral_one_on_one_notas', () => {
      expect(content).toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?pastoral_one_on_one_notas/i)
    })
  })

  describe('RLS activated', () => {
    it('ALTER TABLE pastoral_one_on_one ENABLE ROW LEVEL SECURITY', () => {
      expect(content).toMatch(/ALTER\s+TABLE\s+(?:public\.)?pastoral_one_on_one\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    })

    it('ALTER TABLE pastoral_one_on_one_participantes ENABLE ROW LEVEL SECURITY', () => {
      expect(content).toMatch(/ALTER\s+TABLE\s+(?:public\.)?pastoral_one_on_one_participantes\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    })

    it('ALTER TABLE pastoral_one_on_one_notas ENABLE ROW LEVEL SECURITY', () => {
      expect(content).toMatch(/ALTER\s+TABLE\s+(?:public\.)?pastoral_one_on_one_notas\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    })
  })

  describe('pastoral_one_on_one constraints', () => {
    it('has version column with integer type', () => {
      expect(content).toMatch(/version\s+integer\s+NOT\s+NULL\s+DEFAULT\s+1/i)
    })

    it('has CHECK constraint for resumen length (D17)', () => {
      expect(content).toMatch(/CHECK\s*\(\s*resumen\s+IS\s+NULL\s+OR\s+length\s*\(\s*resumen\s*\)\s*<=\s*500/i)
    })

    it('has CHECK constraint for sensitive patterns in resumen (D17, P4)', () => {
      expect(content).toMatch(/cedula.*pasaporte.*diagnostico.*suicidio/i)
      // Matches: CHECK (... resumen !~* '...' ) — Postgres NOT regex match
      expect(content).toMatch(/CHECK\s*\(\s*resumen\s+IS\s+NULL\s+OR\s+resumen\s+!~\*/i)
    })

    it('has CHECK for cancelled requiring motivo_cancelacion', () => {
      expect(content).toMatch(/chk_pastoral_one_on_one_cancelled_needs_motivo/i)
    })

    it('references auth_has_pastoral_capability in policies', () => {
      expect(content).toMatch(/auth_has_pastoral_capability/i)
    })
  })

  describe('pastoral_one_on_one_notas — annexable, never mutable', () => {
    it('has INSERT policy for write_notes capability', () => {
      expect(content).toMatch(/pastoral\.one_on_one\.write_notes/i)
    })

    it('denies UPDATE policy (anexables never mutable)', () => {
      expect(content).toMatch(/pastoral_one_on_one_notas_no_update/i)
      expect(content).toMatch(/USING\s*\(\s*false\s*\)/i)
    })

    it('denies DELETE policy', () => {
      expect(content).toMatch(/pastoral_one_on_one_notas_no_delete/i)
      expect(content).toMatch(/USING\s*\(\s*false\s*\)/i)
    })
  })

  describe('Zero DDL destructive (I-6, I-19, I-20)', () => {
    it('does not DROP any protected table', () => {
      const drops = [
        'operating_core_participation_eventos',
        'uno_a_uno_reuniones',
        'uno_a_uno_participantes',
      ]
      for (const table of drops) {
        expect(content).not.toMatch(new RegExp(`DROP\\s+TABLE\\s+.*${table}`, 'i'))
      }
    })

    it('does not write to uno_a_uno_* tables (I-19)', () => {
      expect(content).not.toMatch(/uno_a_uno_reuniones/i)
      expect(content).not.toMatch(/uno_a_uno_participantes/i)
    })

    it('does not DELETE FROM operating_core_participation_eventos', () => {
      expect(content).not.toMatch(/DELETE\s+FROM\s+operating_core_participation_eventos/i)
    })

    it('does not ALTER COLUMN.*DROP', () => {
      expect(content).not.toMatch(/ALTER\s+COLUMN.*DROP/i)
    })

    it('does not TRUNCATE', () => {
      expect(content).not.toMatch(/TRUNCATE/i)
    })
  })

  describe('GRANT to service_role', () => {
    it('grants service_role on pastoral_one_on_one', () => {
      expect(content).toMatch(/GRANT\s+.+\s+ON\s+TABLE\s+(?:public\.)?pastoral_one_on_one\s+TO\s+service_role/i)
    })

    it('grants service_role on pastoral_one_on_one_notas', () => {
      expect(content).toMatch(/GRANT\s+.+\s+ON\s+TABLE\s+(?:public\.)?pastoral_one_on_one_notas\s+TO\s+service_role/i)
    })
  })
})
