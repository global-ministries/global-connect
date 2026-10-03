/**
 * Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md, T1 + T1b) —
 * static SQL-text assertions over
 * supabase/migrations/20261003140000_talleres_cierre_de_edicion.sql
 * (pattern: pr48-emit-taller-certificado.test.ts).
 *
 * Behavior is proven against staging by
 * supabase/tests/talleres-cierre-de-edicion.test.sql; this file pins what a
 * later edit could silently break without any SQL run:
 *   - certificate codes are minted in SQL (talleres_codigo_certificado), so
 *     its alphabet must stay identical to ALPHABET in
 *     lib/platform/talleres/certificates.ts, and they come from a CSPRNG;
 *   - one certificate per PERSON: UNIQUE (inscripcion_id, persona_id),
 *     nombre_pareja_snapshot readable by anon, emit_taller_certificado keeps
 *     the keys generateCertificateForInscription reads;
 *   - only talleres_cerrar_edicion writes cerrada_en / cerrada_por;
 *   - the companero reads the couple's inscription;
 *   - every new function revokes anon, the internal helpers are never
 *     granted to authenticated, and identity comes from auth.uid(), never
 *     from a p_auth_id parameter.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { ALPHABET } from '@/lib/platform/talleres/certificates'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

const INTERNAL_HELPERS = [
  'talleres_cierre_resultados\\(uuid\\)',
  'talleres_codigo_certificado\\(\\)',
  'talleres_certificado_firmantes\\(jsonb\\)',
  'talleres_emitir_certificado_persona\\(uuid, uuid, uuid, text, text, text, jsonb, text\\)',
] as const

const PUBLIC_RPCS = [
  'talleres_previsualizar_cierre\\(uuid\\)',
  'talleres_cerrar_edicion\\(uuid\\)',
  'emit_taller_certificado\\(uuid, text\\)',
] as const

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

describe('cierre de edición migration', () => {
  const migrationPath = findMigration(/_talleres_cierre_de_edicion\.sql$/)

  it('migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const rawContent = readFileSync(migrationPath, 'utf-8')
  const sqlOnly = rawContent.replace(/--[^\n]*/g, '')

  const cerrarBlock = functionBlock(sqlOnly, 'talleres_cerrar_edicion')
  const previsualizarBlock = functionBlock(sqlOnly, 'talleres_previsualizar_cierre')
  const emitBlock = functionBlock(sqlOnly, 'emit_taller_certificado')
  const resultadosBlock = functionBlock(sqlOnly, 'talleres_cierre_resultados')
  const codigoBlock = functionBlock(sqlOnly, 'talleres_codigo_certificado')
  const emitirPersonaBlock = functionBlock(sqlOnly, 'talleres_emitir_certificado_persona')
  const guardBlock = functionBlock(sqlOnly, 'talleres_ediciones_cierre_solo_por_rpc')

  it('defines the three RPCs, the internal helpers and the guard', () => {
    for (const block of [
      cerrarBlock,
      previsualizarBlock,
      emitBlock,
      resultadosBlock,
      codigoBlock,
      emitirPersonaBlock,
      guardBlock,
    ]) {
      expect(block).not.toBe('')
    }
  })

  describe('certificate codes', () => {
    it('uses exactly the ALPHABET exported by lib/platform/talleres/certificates.ts', () => {
      const declared = codigoBlock.match(/c_alfabeto\s+constant\s+text\s*:=\s*'([^']*)'/i)?.[1]
      expect(declared).toBe(ALPHABET)
    })

    it('draws them from a CSPRNG in the extensions schema, 16 symbols long', () => {
      expect(codigoBlock).toMatch(/extensions\.gen_random_bytes\s*\(/i)
      expect(codigoBlock).toMatch(/c_largo_codigo\s+constant\s+integer\s*:=\s*16\s*;/i)
      expect(sqlOnly).not.toMatch(/\brandom\s*\(\s*\)/i)
    })
  })

  describe('one certificate per person', () => {
    it('replaces UNIQUE (inscripcion_id) with UNIQUE (inscripcion_id, persona_id)', () => {
      expect(sqlOnly).toMatch(/DROP\s+CONSTRAINT\s+taller_certificados_inscripcion_id_key\s*;/i)
      expect(sqlOnly).toMatch(/UNIQUE\s*\(\s*inscripcion_id\s*,\s*persona_id\s*\)/i)
    })

    it('adds nombre_pareja_snapshot and lets anon read it', () => {
      expect(sqlOnly).toMatch(/ADD\s+COLUMN\s+nombre_pareja_snapshot\s+text\s+NULL/i)
      expect(sqlOnly).toMatch(
        /GRANT\s+SELECT\s*\(\s*nombre_pareja_snapshot\s*\)\s+ON\s+public\.taller_certificados\s+TO\s+anon\b/i,
      )
    })

    it('the close and emit_taller_certificado both emit through the shared helper, principal and companero', () => {
      for (const block of [cerrarBlock, emitBlock]) {
        const calls = block.match(/public\.talleres_emitir_certificado_persona\s*\(/gi) ?? []
        expect(calls).toHaveLength(2)
      }
    })

    it('emit_taller_certificado keeps the keys generateCertificateForInscription reads and adds certificados', () => {
      for (const key of ['ok', 'created', 'certificado_id', 'codigo_verificacion', 'inscripcion_id', 'certificados']) {
        expect(emitBlock).toMatch(new RegExp(`'${key}'\\s*,`))
      }
      expect(emitBlock).toMatch(/p_inscripcion_id\s+uuid\s*,\s*p_codigo_verificacion\s+text/i)
    })
  })

  describe('close columns', () => {
    it('a BEFORE INSERT OR UPDATE OF cerrada_en, cerrada_por trigger refuses writes without the flag', () => {
      expect(sqlOnly).toMatch(
        /BEFORE\s+INSERT\s+OR\s+UPDATE\s+OF\s+cerrada_en\s*,\s*cerrada_por\s+ON\s+public\.taller_ediciones/i,
      )
      expect(guardBlock).toMatch(/current_setting\('talleres\.cierre_autorizado',\s*true\)/)
      expect(guardBlock).toMatch(/RAISE\s+EXCEPTION\s+'EDICION_CIERRE_SOLO_POR_RPC'\s+USING\s+ERRCODE\s*=\s*'P0001'/i)
    })

    it('only talleres_cerrar_edicion sets the flag, and clears it right after its UPDATE', () => {
      expect(cerrarBlock).toMatch(/set_config\('talleres\.cierre_autorizado',\s*'1',\s*true\)/)
      expect(cerrarBlock).toMatch(/set_config\('talleres\.cierre_autorizado',\s*'',\s*true\)/)
      const setters = sqlOnly.match(/set_config\('talleres\.cierre_autorizado',\s*'1'/g) ?? []
      expect(setters).toHaveLength(1)
    })
  })

  describe('authority', () => {
    it('the three RPCs are SECURITY DEFINER with a pinned search_path', () => {
      for (const block of [cerrarBlock, previsualizarBlock, emitBlock]) {
        expect(block).toMatch(/SECURITY\s+DEFINER/i)
        expect(block).toMatch(/SET\s+search_path\s+TO\s+'public'/i)
      }
    })

    it('preview and close gate on director.write OR admin.manage scoped to the taller node', () => {
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
      expect(emitBlock).toMatch(/auth\.uid\(\)/)
    })

    it('revokes PUBLIC and anon on every new or redefined function', () => {
      for (const signature of [...PUBLIC_RPCS, ...INTERNAL_HELPERS]) {
        expect(sqlOnly).toMatch(
          new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${signature}\\s+FROM\\s+PUBLIC,\\s*anon\\b`, 'i'),
        )
      }
    })

    it('grants the RPCs to authenticated and keeps every internal helper away from it', () => {
      for (const signature of PUBLIC_RPCS) {
        expect(sqlOnly).toMatch(
          new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${signature}\\s+TO\\s+authenticated,\\s*service_role;`, 'i'),
        )
      }
      for (const signature of INTERNAL_HELPERS) {
        expect(sqlOnly).toMatch(
          new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${signature}\\s+FROM\\s+PUBLIC,\\s*anon,\\s*authenticated;`, 'i'),
        )
        expect(sqlOnly).not.toMatch(
          new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${signature}\\s+TO[^;]*authenticated`, 'i'),
        )
      }
      for (const block of [resultadosBlock, codigoBlock, emitirPersonaBlock]) {
        expect(block).not.toMatch(/SECURITY\s+DEFINER/i)
      }
    })

    it('taller_inscripciones_select gains the companero branch and keeps the principal one', () => {
      const policy =
        sqlOnly.match(/ALTER\s+POLICY\s+taller_inscripciones_select[\s\S]*?\);/i)?.[0] ?? ''
      expect(policy).toMatch(
        /persona_principal_id\s+IN\s*\(SELECT\s+usuarios\.id\s+FROM\s+usuarios\s+WHERE\s+usuarios\.auth_id\s*=\s*auth\.uid\(\)\)/i,
      )
      expect(policy).toMatch(
        /companero_id\s+IN\s*\(SELECT\s+usuarios\.id\s+FROM\s+usuarios\s+WHERE\s+usuarios\.auth_id\s*=\s*auth\.uid\(\)\)/i,
      )
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
