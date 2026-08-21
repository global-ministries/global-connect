/**
 * PR48 (restructure PR E) — emit_taller_certificado(p_inscripcion_id, p_codigo_verificacion).
 *
 * Static SQL-text assertions (mirrors pr47-generate-taller-sesiones.test.ts).
 * Verifies the migration adds a SECURITY DEFINER RPC that mints the completion
 * certificate for an inscription, computing every *_snapshot column from the DB
 * with definer privileges.
 *
 * WHY AN RPC (not a direct INSERT under RLS): Postgres checks the table GRANT
 * layer BEFORE RLS. `authenticated` holds only SELECT on taller_certificados
 * (INSERT is service_role); a cookie-bound INSERT would fail "permission
 * denied" regardless of the RLS INSERT policy. A SECURITY DEFINER RPC inserts
 * with definer rights, and stays safe by gating internally on director.write
 * OR admin.manage — the same pattern as generate_taller_sesiones (PR47).
 *
 * Facts baked in (from the live schema):
 *   - taller_certificados.codigo_verificacion is UNIQUE + CHECK(length = 16),
 *     so the code is generated app-side (locked 16-char ALPHABET in
 *     lib/platform/talleres/certificates.ts) and passed in.
 *   - taller_certificados.taller_id references the EDICIÓN
 *     (talleres_crecimiento_metadata, renamed taller_ediciones), so it equals
 *     taller_inscripciones.taller_id directly.
 *   - the abstract taller name lives on public.talleres.nombre, reached via
 *     taller_ediciones.taller_id -> talleres.id.
 *   - taller_ediciones.firmantes is jsonb OBJECTS {persona_id, rol_etiqueta,
 *     orden}; the public verify endpoint projects firmantes_snapshot filtering
 *     to STRING elements, so the RPC must transform objects -> string[].
 *   - UNIQUE(inscripcion_id) enables idempotent ON CONFLICT DO NOTHING.
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

describe('PR48 migration — emit_taller_certificado(p_inscripcion_id, p_codigo_verificacion)', () => {
  const migrationPath = findMigration(/_pr48_emit_taller_certificado\.sql$/)

  it('migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const rawContent = readFileSync(migrationPath, 'utf-8')
  const sqlOnly = rawContent.replace(/--[^\n]*/g, '')

  const fnBlock =
    sqlOnly.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.emit_taller_certificado\s*\([\s\S]*?\$func\$;/i,
    )?.[0] ?? ''
  const fnSignature =
    sqlOnly.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.emit_taller_certificado\s*\(([\s\S]*?)\)\s*\n\s*RETURNS/i,
    )?.[1] ?? ''

  describe('Signature & attributes', () => {
    it('takes p_inscripcion_id uuid and p_codigo_verificacion text', () => {
      expect(fnSignature).toMatch(/p_inscripcion_id\s+uuid/i)
      expect(fnSignature).toMatch(/p_codigo_verificacion\s+text/i)
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

  describe('Input validation', () => {
    it('validates the 16-char verification code (matches the table CHECK)', () => {
      expect(fnBlock).toMatch(/length\(\s*p_codigo_verificacion\s*\)\s*(<>|!=|=)\s*16/i)
    })
  })

  describe('Resolves inscripción -> edición -> abstract taller + principal', () => {
    it('joins taller_inscripciones, taller_ediciones, talleres, usuarios', () => {
      expect(fnBlock).toMatch(/public\.taller_inscripciones/i)
      expect(fnBlock).toMatch(/public\.taller_ediciones/i)
      expect(fnBlock).toMatch(/public\.talleres\b/i)
      expect(fnBlock).toMatch(/public\.usuarios/i)
    })

    it('reads the principal via persona_principal_id', () => {
      expect(fnBlock).toMatch(/persona_principal_id/i)
    })

    it('raises NOT_FOUND (P0002) when the chain does not resolve', () => {
      expect(fnBlock).toMatch(/ERRCODE\s*=\s*'P0002'/i)
    })

    it('guards that the inscription is completed (unit_estado)', () => {
      expect(fnBlock).toMatch(/unit_estado/i)
      expect(fnBlock).toMatch(/'completado'/i)
    })
  })

  describe('Snapshot computation', () => {
    it('transforms firmantes objects into a string[] snapshot (jsonb_to_recordset)', () => {
      expect(fnBlock).toMatch(/firmantes/i)
      expect(fnBlock).toMatch(/jsonb_to_recordset/i)
      expect(fnBlock).toMatch(/rol_etiqueta/i)
    })

    it('writes nombre_taller_snapshot and nombre_participante_snapshot', () => {
      expect(fnBlock).toMatch(/nombre_taller_snapshot/i)
      expect(fnBlock).toMatch(/nombre_participante_snapshot/i)
    })
  })

  describe('Certificate insert', () => {
    it('inserts into public.taller_certificados', () => {
      expect(fnBlock).toMatch(/INSERT\s+INTO\s+public\.taller_certificados/i)
    })

    it('is idempotent — ON CONFLICT (inscripcion_id) DO NOTHING', () => {
      expect(fnBlock).toMatch(
        /ON\s+CONFLICT\s*\(\s*inscripcion_id\s*\)\s*DO\s+NOTHING/i,
      )
    })
  })

  describe('Grants', () => {
    it('revokes the (uuid, text) signature from PUBLIC and anon', () => {
      expect(sqlOnly).toMatch(
        /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.emit_taller_certificado\s*\(\s*uuid\s*,\s*text\s*\)\s+FROM\s+PUBLIC,\s*anon/i,
      )
    })

    it('grants EXECUTE on the (uuid, text) signature to authenticated', () => {
      expect(sqlOnly).toMatch(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.emit_taller_certificado\s*\(\s*uuid\s*,\s*text\s*\)\s+TO\s+authenticated/i,
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
