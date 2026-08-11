import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function findMigration(pattern: RegExp): string | null {
  const file = readdirSync(MIGRATIONS_DIR).find((entry: string): boolean => pattern.test(entry))
  return file ? join(MIGRATIONS_DIR, file) : null
}

describe('Talleres attendance schema — DT-026, DT-028', () => {
  const migrationPath = findMigration(/_talleres_tables_sesiones_asistencia\.sql$/)

  it('defines attendance with self-FK, append-only trigger, and indexes', () => {
    expect(migrationPath).not.toBeNull()
    if (!migrationPath) return
    const content = readFileSync(migrationPath, 'utf8')
    expect(content).toMatch(/CREATE TABLE IF NOT EXISTS public\.taller_asistencias/i)
    expect(content).toMatch(/correccion_de_asistencia_id uuid REFERENCES public\.taller_asistencias\(id\) ON DELETE RESTRICT/i)
    expect(content).toMatch(/UNIQUE \(sesion_id, inscripcion_id\)/i)
    expect(content).toMatch(/idx_taller_asistencias_sesion/i)
    expect(content).toMatch(/idx_taller_asistencias_persona/i)
    expect(content).toMatch(/trg_taller_asistencias_immutable_update/i)
  })

  it('requires corrections to point to the original row and rejects branches', () => {
    if (!migrationPath) return
    const content = readFileSync(migrationPath, 'utf8')
    expect(content).toMatch(/OLD\.estado = NEW\.estado/i)
    expect(content).toMatch(/IS NOT DISTINCT FROM/i)
    expect(content).toMatch(/NEW\.correccion_de_asistencia_id <> OLD\.id/i)
    expect(content).toMatch(/OLD\.correccion_de_asistencia_id IS NOT NULL/i)
    expect(content).toMatch(/Use INSERT for append/i)
  })

  it('has the exact additive-only I-6 invariant', () => {
    if (!migrationPath) return
    const content = readFileSync(migrationPath, 'utf8')
    expect(content).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|POLICY|INDEX)|DELETE\s+FROM|TRUNCATE|ALTER\s+COLUMN\s+\w+\s+TYPE/i)
  })
})
