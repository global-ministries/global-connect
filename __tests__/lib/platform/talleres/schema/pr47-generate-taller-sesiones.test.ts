/**
 * PR47 (restructure PR D) — generate_taller_sesiones(p_grupo_id).
 *
 * Static SQL-text assertions (mirrors pr46-open-edicion-temporada.test.ts).
 * Verifies the migration adds a SECURITY DEFINER RPC that materialises the
 * per-grupo weekly sessions from the edición's sesiones_snapshot (N), under
 * the "1 semana = 1 sesión" model.
 *
 * Facts baked in (from the live schema):
 *   - taller_sesiones has a BEFORE INSERT trigger that REQUIRES estado
 *     'programada' and sequential numero (numero-1 must already exist), so the
 *     RPC MUST insert numero = 1..N ascending.
 *   - fecha_programada is `date`; weekly cadence = anchor + (numero-1)*7.
 *   - grupo -> cohorte -> edición: taller_grupos.cohorte_id ->
 *     talleres_crecimiento_cohortes.taller_id -> taller_ediciones.id
 *     (talleres_crecimiento_cohortes was NOT renamed).
 *   - UNIQUE(grupo_id, numero) enables idempotent ON CONFLICT DO NOTHING.
 *
 * ⚠️ LIVE PRODUCTION: additive + forward-only only (no DROP/TRUNCATE).
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function findMigration(pattern: RegExp): string | null {
  const sqlFiles = readdirSync(MIGRATIONS_DIR).filter((file: string): boolean =>
    file.endsWith('.sql'),
  )
  for (const file of sqlFiles) {
    if (pattern.test(file)) return join(MIGRATIONS_DIR, file)
  }
  return null
}

describe('PR47 migration — generate_taller_sesiones(p_grupo_id)', () => {
  const migrationPath = findMigration(/_pr47_generate_taller_sesiones\.sql$/)

  it('migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const rawContent = readFileSync(migrationPath, 'utf-8')
  const sqlOnly = rawContent.replace(/--[^\n]*/g, '')

  const fnBlock =
    sqlOnly.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.generate_taller_sesiones\s*\([\s\S]*?\$func\$;/i,
    )?.[0] ?? ''
  const fnSignature =
    sqlOnly.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.generate_taller_sesiones\s*\(([\s\S]*?)\)\s*\n\s*RETURNS/i,
    )?.[1] ?? ''

  describe('Signature & attributes', () => {
    it('takes a single p_grupo_id uuid parameter', () => {
      expect(fnSignature).toMatch(/p_grupo_id\s+uuid/i)
    })

    it('is plpgsql, SECURITY DEFINER, fixed search_path', () => {
      expect(fnBlock).toMatch(/LANGUAGE\s+plpgsql/i)
      expect(fnBlock).toMatch(/SECURITY\s+DEFINER/i)
      expect(fnBlock).toMatch(/SET\s+search_path\s*=\s*public/i)
    })
  })

  describe('Auth + capability gate', () => {
    it('rejects unauthenticated (auth.uid() IS NULL -> RAISE)', () => {
      expect(fnBlock).toMatch(/auth\.uid\(\)/i)
      expect(fnBlock).toMatch(/IS\s+NULL[\s\S]*?RAISE\s+EXCEPTION/i)
    })

    it('requires director.write OR admin.manage', () => {
      expect(fnBlock).toMatch(
        /auth_has_talleres_capability\(\s*'talleres_crecimiento\.director\.write'/i,
      )
      expect(fnBlock).toMatch(
        /auth_has_talleres_capability\(\s*'talleres_crecimiento\.admin\.manage'/i,
      )
    })
  })

  describe('Resolves grupo -> cohorte -> edición and reads N', () => {
    it('joins taller_grupos, talleres_crecimiento_cohortes, taller_ediciones', () => {
      expect(fnBlock).toMatch(/public\.taller_grupos/i)
      expect(fnBlock).toMatch(/public\.talleres_crecimiento_cohortes/i)
      expect(fnBlock).toMatch(/public\.taller_ediciones/i)
    })

    it('reads sesiones_snapshot as the session count N', () => {
      expect(fnBlock).toMatch(/sesiones_snapshot/i)
    })

    it('raises NOT_FOUND (P0002) when the chain does not resolve', () => {
      expect(fnBlock).toMatch(/ERRCODE\s*=\s*'P0002'/i)
    })
  })

  describe('Session generation', () => {
    it('inserts into public.taller_sesiones', () => {
      expect(fnBlock).toMatch(/INSERT\s+INTO\s+public\.taller_sesiones/i)
    })

    it("inserts each session as estado 'programada' (trigger requires it)", () => {
      expect(fnBlock).toMatch(/'programada'/i)
    })

    it('generates ascending numero 1..N (sequential-trigger safe)', () => {
      expect(fnBlock).toMatch(/FOR\s+\w+\s+IN\s+1\s*\.\.\s*\w+\s+LOOP/i)
    })

    it('schedules weekly (7-day cadence from an anchor date)', () => {
      expect(fnBlock).toMatch(/\*\s*7/)
    })

    it('is idempotent — ON CONFLICT (grupo_id, numero) DO NOTHING', () => {
      expect(fnBlock).toMatch(
        /ON\s+CONFLICT\s*\(\s*grupo_id\s*,\s*numero\s*\)\s*DO\s+NOTHING/i,
      )
    })
  })

  describe('Grants', () => {
    it('revokes the (uuid) signature from PUBLIC and anon', () => {
      expect(sqlOnly).toMatch(
        /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.generate_taller_sesiones\s*\(\s*uuid\s*\)\s+FROM\s+PUBLIC,\s*anon/i,
      )
    })

    it('grants EXECUTE on the (uuid) signature to authenticated', () => {
      expect(sqlOnly).toMatch(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.generate_taller_sesiones\s*\(\s*uuid\s*\)\s+TO\s+authenticated/i,
      )
    })
  })

  describe('Additive + forward-only — never breaks existing schema', () => {
    it('contains NO DROP TABLE / DROP COLUMN / TRUNCATE / DROP FUNCTION', () => {
      expect(sqlOnly).not.toMatch(/DROP\s+TABLE/i)
      expect(sqlOnly).not.toMatch(/DROP\s+COLUMN/i)
      expect(sqlOnly).not.toMatch(/TRUNCATE/i)
      expect(sqlOnly).not.toMatch(/DROP\s+FUNCTION/i)
    })
  })
})
