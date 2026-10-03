/**
 * Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md, T1) —
 * static SQL-text assertions over
 * supabase/migrations/20261003140000_talleres_cierre_de_edicion.sql
 * (pattern: pr48-emit-taller-certificado.test.ts).
 *
 * Behavior is proven against staging by
 * supabase/tests/talleres-cierre-de-edicion.test.sql; this file pins what a
 * later edit could silently break without any SQL run:
 *   - talleres_cerrar_edicion mints certificate codes in SQL, so its
 *     alphabet must stay identical to ALPHABET in
 *     lib/platform/talleres/certificates.ts (the public verifier and the
 *     app-side emitter both rely on it);
 *   - the codes come from a CSPRNG (extensions.gen_random_bytes);
 *   - every new function revokes anon, and the internal helper is never
 *     granted to authenticated;
 *   - identity comes from auth.uid(), never from a p_auth_id parameter.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { ALPHABET } from '@/lib/platform/talleres/certificates'

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

function functionBlock(sql: string, name: string): string {
  const pattern = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${name}\\s*\\([\\s\\S]*?\\$(function)?\\$;`,
    'i',
  )
  return sql.match(pattern)?.[0] ?? ''
}

describe('cierre de edición migration — talleres_previsualizar_cierre / talleres_cerrar_edicion', () => {
  const migrationPath = findMigration(/_talleres_cierre_de_edicion\.sql$/)

  it('migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const rawContent = readFileSync(migrationPath, 'utf-8')
  const sqlOnly = rawContent.replace(/--[^\n]*/g, '')

  const cerrarBlock = functionBlock(sqlOnly, 'talleres_cerrar_edicion')
  const previsualizarBlock = functionBlock(sqlOnly, 'talleres_previsualizar_cierre')
  const resultadosBlock = functionBlock(sqlOnly, 'talleres_cierre_resultados')

  it('defines the two RPCs and the shared helper', () => {
    expect(cerrarBlock).not.toBe('')
    expect(previsualizarBlock).not.toBe('')
    expect(resultadosBlock).not.toBe('')
  })

  describe('certificate codes', () => {
    it('uses exactly the ALPHABET exported by lib/platform/talleres/certificates.ts', () => {
      const declared = cerrarBlock.match(/c_alfabeto\s+constant\s+text\s*:=\s*'([^']*)'/i)?.[1]
      expect(declared).toBe(ALPHABET)
    })

    it('draws them from a CSPRNG in the extensions schema, 16 symbols long', () => {
      expect(cerrarBlock).toMatch(/extensions\.gen_random_bytes\s*\(/i)
      expect(cerrarBlock).toMatch(/c_largo_codigo\s+constant\s+integer\s*:=\s*16\s*;/i)
      expect(cerrarBlock).not.toMatch(/\brandom\s*\(\s*\)/i)
    })
  })

  describe('authority', () => {
    it('both RPCs are SECURITY DEFINER with a pinned search_path', () => {
      for (const block of [cerrarBlock, previsualizarBlock]) {
        expect(block).toMatch(/SECURITY\s+DEFINER/i)
        expect(block).toMatch(/SET\s+search_path\s+TO\s+'public'/i)
      }
    })

    it('both RPCs gate on director.write OR admin.manage scoped to the taller node', () => {
      for (const block of [cerrarBlock, previsualizarBlock]) {
        expect(block).toMatch(
          /auth_has_talleres_capability_scoped\('talleres_crecimiento\.director\.write',\s*v_equipo_id\)/,
        )
        expect(block).toMatch(
          /auth_has_talleres_capability_scoped\('talleres_crecimiento\.admin\.manage',\s*v_equipo_id\)/,
        )
        expect(block).toMatch(/v_equipo_id\s*:=\s*public\.talleres_equipo_de_edicion\(p_edicion_id\)/)
      }
    })

    it('takes no p_auth_id anywhere: identity is auth.uid()', () => {
      expect(sqlOnly).not.toMatch(/p_auth_id/i)
      expect(cerrarBlock).toMatch(/auth\.uid\(\)/)
    })

    it('revokes PUBLIC and anon on every new function', () => {
      for (const signature of [
        'talleres_previsualizar_cierre\\(uuid\\)',
        'talleres_cerrar_edicion\\(uuid\\)',
        'talleres_cierre_resultados\\(uuid\\)',
      ]) {
        expect(sqlOnly).toMatch(
          new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${signature}\\s+FROM\\s+PUBLIC,\\s*anon\\b`, 'i'),
        )
      }
    })

    it('grants the two RPCs to authenticated and keeps the helper away from it', () => {
      expect(sqlOnly).toMatch(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.talleres_previsualizar_cierre\(uuid\)\s+TO\s+authenticated,\s*service_role;/i,
      )
      expect(sqlOnly).toMatch(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.talleres_cerrar_edicion\(uuid\)\s+TO\s+authenticated,\s*service_role;/i,
      )
      expect(sqlOnly).toMatch(
        /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.talleres_cierre_resultados\(uuid\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i,
      )
      expect(sqlOnly).not.toMatch(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.talleres_cierre_resultados\(uuid\)\s+TO[^;]*authenticated/i,
      )
      expect(resultadosBlock).not.toMatch(/SECURITY\s+DEFINER/i)
    })
  })

  describe('one computation for preview and close', () => {
    it('both RPCs read their rows from talleres_cierre_resultados', () => {
      expect(previsualizarBlock).toMatch(/FROM\s+public\.talleres_cierre_resultados\(p_edicion_id\)/i)
      expect(cerrarBlock).toMatch(/FROM\s+public\.talleres_cierre_resultados\(p_edicion_id\)/i)
    })

    it('the close locks the edición row before touching anything', () => {
      expect(cerrarBlock).toMatch(/FROM\s+public\.taller_ediciones\s+WHERE\s+id\s*=\s*p_edicion_id\s+FOR\s+UPDATE/i)
    })

    it('the close raises the two contract errors', () => {
      expect(cerrarBlock).toMatch(/RAISE\s+EXCEPTION\s+'EDICION_YA_CERRADA'\s+USING\s+ERRCODE\s*=\s*'P0001'/i)
      expect(cerrarBlock).toMatch(/RAISE\s+EXCEPTION\s+'EDICION_NO_CERRABLE'\s+USING\s+ERRCODE\s*=\s*'P0001'/i)
    })
  })
})
