/**
 * PR37 — open_edicion creates the first cohorte automatically.
 *
 * This mirrors the static migration checks used by the PR35 test.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function findMigration(pattern: RegExp): string | null {
  const allFiles = readdirSync(MIGRATIONS_DIR)
  const sqlFiles = allFiles.filter((file: string): boolean => file.endsWith('.sql'))
  for (const file of sqlFiles) {
    if (pattern.test(file)) return join(MIGRATIONS_DIR, file)
  }
  return null
}

describe('PR37 migration — open_edicion creates first cohorte', () => {
  const migrationPath = findMigration(/_pr37_open_edicion_creates_cohorte\.sql$/)

  it('migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const rawContent = readFileSync(migrationPath, 'utf-8')
  const sqlOnly = rawContent.replace(/--[^\n]*/g, '')

  it('creates both open_edicion overloads', () => {
    expect(sqlOnly).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.open_edicion\s*\(\s*\n\s*p_taller_id\s+uuid\s*,\s*\n\s*p_nombre_edicion\s+text/i,
    )
    expect(sqlOnly).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.open_edicion\s*\(\s*\n\s*p_taller_id\s+uuid\s*,\s*\n\s*p_tipo\s+text/i,
    )
  })

  it('inserts a cohorte in both overloads', () => {
    const nineArgBody = sqlOnly.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.open_edicion\s*\(\s*\n\s*p_taller_id\s+uuid\s*,\s*\n\s*p_nombre_edicion\s+text[\s\S]*?END;\s*\$func\$;/i,
    )?.[0] ?? ''
    const tenArgBody = sqlOnly.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.open_edicion\s*\(\s*\n\s*p_taller_id\s+uuid\s*,\s*\n\s*p_tipo\s+text[\s\S]*?END;\s*\$func\$;/i,
    )?.[0] ?? ''

    for (const body of [nineArgBody, tenArgBody]) {
      expect(body).toMatch(/INSERT\s+INTO\s+public\.talleres_crecimiento_cohortes\s*\(/i)
      expect(body).toMatch(/p_taller_id\s*,[\s\S]*?p_nombre_edicion/i)
      expect(body).toMatch(/'cohorte_id'\s*,\s*v_cohorte_id/i)
    }
  })

  it('includes a backfill DO block with NOT EXISTS', () => {
    const backfill = sqlOnly.match(/DO\s+\$do\$([\s\S]*?)END\s+\$do\$;/i)?.[1] ?? ''
    expect(backfill).toMatch(/FOR\s+v_ed\s+IN\s+SELECT/i)
    expect(backfill).toMatch(/WHERE\s+NOT\s+EXISTS/i)
    expect(backfill).toMatch(/SELECT\s+1\s+FROM\s+public\.talleres_crecimiento_cohortes\s+c/i)
  })

  it('grants EXECUTE to authenticated for both overloads', () => {
    const grants = [...sqlOnly.matchAll(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.open_edicion\s*\(([^)]*)\)\s+TO\s+authenticated/gi)]
    expect(grants.map((grant) => grant[1].replace(/\s+/g, ' ').trim())).toEqual(
      expect.arrayContaining([
        'uuid, text, text, int, int, text, timestamptz, timestamptz, jsonb',
        'uuid, text, text, text, int, int, text, timestamptz, timestamptz, jsonb',
      ]),
    )
  })
})
