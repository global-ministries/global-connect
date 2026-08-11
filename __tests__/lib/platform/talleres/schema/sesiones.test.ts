import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function findMigration(pattern: RegExp): string | null {
  const file = readdirSync(MIGRATIONS_DIR).find((entry: string): boolean => pattern.test(entry))
  return file ? join(MIGRATIONS_DIR, file) : null
}

describe('Talleres sessions schema — DT-025, DT-027, DT-028', () => {
  const migrationPath = findMigration(/_talleres_tables_sesiones_asistencia\.sql$/)

  it('migration exists and is additive', () => {
    expect(migrationPath).not.toBeNull()
    if (!migrationPath) return
    const content = readFileSync(migrationPath, 'utf8')
    expect(content).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|POLICY|INDEX)|DELETE\s+FROM|TRUNCATE|ALTER\s+COLUMN\s+\w+\s+TYPE/i)
  })

  it('defines sessions with exact states, scheduling fields, indexes, and sequential guards', () => {
    if (!migrationPath) return
    const content = readFileSync(migrationPath, 'utf8')
    expect(content).toMatch(/CREATE TABLE IF NOT EXISTS public\.taller_sesiones/i)
    expect(content).toMatch(/UNIQUE \(grupo_id, numero\)/i)
    expect(content).toMatch(/meeting_time_applies_to[\s\S]*this_session[\s\S]*this_and_subsequent/i)
    expect(content).toMatch(/estado text NOT NULL DEFAULT 'programada'[\s\S]*programada[\s\S]*en_curso[\s\S]*cerrada[\s\S]*cancelada/i)
    expect(content).toMatch(/trg_taller_sesiones_validate_insert/i)
    expect(content).toMatch(/trg_taller_sesiones_validate_update/i)
    expect(content).toMatch(/idx_taller_sesiones_grupo_estado/i)
    expect(content).toMatch(/idx_taller_sesiones_fecha_programada/i)
    expect(content).toMatch(/idx_taller_sesiones_fecha_realizada/i)
  })

  it('defines resource snapshot capture on completion', () => {
    if (!migrationPath) return
    const content = readFileSync(migrationPath, 'utf8')
    expect(content).toMatch(/taller_grupos_capture_recursos_snapshot/i)
    expect(content).toMatch(/NEW\.estado = 'completado'/i)
    expect(content).toMatch(/recursos_snapshot IS NULL/i)
    expect(content).toMatch(/completed_at = now\(\)/i)
  })

  it('enables RLS with the required policy suffix matrix', () => {
    if (!migrationPath) return
    const content = readFileSync(migrationPath, 'utf8')
    for (const table of ['taller_sesiones', 'taller_asistencias']) {
      expect(content).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'))
      for (const action of ['select', 'insert', 'update', 'delete']) {
        expect(content).toMatch(new RegExp(`CREATE POLICY ${table}_${action}`, 'i'))
      }
    }
  })
})
