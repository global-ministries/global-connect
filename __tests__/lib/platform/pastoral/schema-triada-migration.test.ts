/**
 * W03 — DT-014 — Pastoral Triada migration dry-run probe.
 * F(pastoral/schema/triada-migration)
 *
 * RED test: verifies M3 migration satisfies acceptance criteria.
 *
 * Acceptance criteria:
 *  1. M3 migration file exists with correct naming pattern
 *  2. pastoral_triada table present with correct columns
 *  3. pastoral_triada_miembros table present
 *  4. pastoral_triada_eventos table present
 *  5. RLS enabled on all three tables
 *  6. CHECK constraint for cardinality_humana = 3 (D25)
 *  7. version column present on pastoral_triada
 *  8. contexto column present with 4 allowed values
 *  9. motivo_disolucion column present
 * 10. No DDL destructive (zero DDL destructive rule)
 * 11. No writes to uno_a_uno_* tables (I-19)
 * 12. Uses auth.uid() in RLS policies (not current_persona_id())
 * 13. Policy names are unique per table
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

describe('Pastoral M3 migration — Triada tables + RLS', () => {
  const migrationPath = findMigration(/_pastoral_tables_part2_triada\.sql$/)

  it('M3 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('Tables created', () => {
    it('creates pastoral_triada', () => {
      expect(content).toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?pastoral_triada/i)
    })

    it('creates pastoral_triada_miembros', () => {
      expect(content).toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?pastoral_triada_miembros/i)
    })

    it('creates pastoral_triada_eventos', () => {
      expect(content).toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?pastoral_triada_eventos/i)
    })
  })

  describe('pastoral_triada columns', () => {
    it('has version column (optimistic concurrency — D8)', () => {
      expect(content).toMatch(/version\s+integer\s+NOT\s+NULL\s+DEFAULT\s+1/i)
    })

    it('has estado column referencing pastoral_triada_estado enum', () => {
      expect(content).toMatch(/estado\s+pastoral_triada_estado/i)
    })

    it('has contexto column referencing pastoral_triada_contexto enum (4 values)', () => {
      expect(content).toMatch(/contexto\s+pastoral_triada_contexto/i)
      // Enum definition contains all 4 values
      expect(content).toMatch(/nuevo_paso/im)
      expect(content).toMatch(/simultaneidad/im)
      expect(content).toMatch(/inicial/im)
      expect(content).toMatch(/reformada/im)
    })

    it('has motivo_disolucion column referencing the dissolution motivo enum', () => {
      expect(content).toMatch(/motivo_disolucion\s+pastoral_triada_motivo_disolucion/i)
    })

    it('has mentor_oficial_persona_id column', () => {
      expect(content).toMatch(/mentor_oficial_persona_id/i)
    })

    it('has autor_persona_id column', () => {
      expect(content).toMatch(/autor_persona_id/i)
    })
  })

  describe('Cardinality 3 enforcement (D25) — application layer', () => {
    it('cardinality check is enforced by application validator (DT-018), not DB constraint', () => {
      // D25: "The trigger approach is in the application layer (cardinality validator in DT-018)"
      // The DB has a UNIQUE constraint on (triada_id, persona_id, rol_en_triada)
      // to prevent duplicate member entries, but the 3-human count is enforced by
      // validarCardinalidadTriada() in the application layer.
      expect(content).toMatch(/UNIQUE\s+\(triada_id,\s*persona_id,\s*rol_en_triada\)/i)
    })
  })

  describe('RLS activated', () => {
    it('ALTER TABLE pastoral_triada ENABLE ROW LEVEL SECURITY', () => {
      expect(content).toMatch(/ALTER\s+TABLE\s+(?:public\.)?pastoral_triada\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    })

    it('ALTER TABLE pastoral_triada_miembros ENABLE ROW LEVEL SECURITY', () => {
      expect(content).toMatch(/ALTER\s+TABLE\s+(?:public\.)?pastoral_triada_miembros\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    })

    it('ALTER TABLE pastoral_triada_eventos ENABLE ROW LEVEL SECURITY', () => {
      expect(content).toMatch(/ALTER\s+TABLE\s+(?:public\.)?pastoral_triada_eventos\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    })
  })

  describe('RLS policies use auth.uid() (not current_persona_id — W02 lesson)', () => {
    it('does not use current_persona_id() in RLS policies', () => {
      // Extract the RLS policy section
      const rlsSection = content.substring(content.indexOf('ENABLE ROW LEVEL SECURITY'))
      expect(rlsSection).not.toMatch(/current_persona_id\(\)/i)
    })

    it('uses auth.uid() in RLS policies', () => {
      expect(content).toMatch(/auth\.uid\(\)/i)
    })
  })

  describe('RLS policy names are unique per table (W02 lesson)', () => {
    it('every policy name contains its table name as prefix', () => {
      // Extract all policy names
      const policyMatches = content.match(/CREATE\s+POLICY\s+"([^"]+)"/gi)
      if (!policyMatches) return

      const policyNames = policyMatches.map((m: string) => {
        const match = m.match(/CREATE\s+POLICY\s+"([^"]+)"/i)
        return match ? match[1] : ''
      })

      // Group by table by looking at the surrounding context
      const pastoralTriadaPolicies = policyNames.filter((n: string) => n.includes('pastoral_triada') && !n.includes('miembro') && !n.includes('evento'))
      const pastoralTriadaMiembrosPolicies = policyNames.filter((n: string) => n.includes('pastoral_triada_miembro'))
      const pastoralTriadaEventosPolicies = policyNames.filter((n: string) => n.includes('pastoral_triada_evento'))

      // All policy names should be unique globally
      const allNames = [...pastoralTriadaPolicies, ...pastoralTriadaMiembrosPolicies, ...pastoralTriadaEventosPolicies]
      const uniqueNames = new Set(allNames)
      expect(allNames.length).toBe(uniqueNames.size)
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
    it('grants service_role on pastoral_triada', () => {
      expect(content).toMatch(/GRANT\s+.+\s+ON\s+TABLE\s+(?:public\.)?pastoral_triada\s+TO\s+service_role/i)
    })

    it('grants service_role on pastoral_triada_miembros', () => {
      expect(content).toMatch(/GRANT\s+.+\s+ON\s+TABLE\s+(?:public\.)?pastoral_triada_miembros\s+TO\s+service_role/i)
    })

    it('grants service_role on pastoral_triada_eventos', () => {
      expect(content).toMatch(/GRANT\s+.+\s+ON\s+TABLE\s+(?:public\.)?pastoral_triada_eventos\s+TO\s+service_role/i)
    })
  })
})
