/**
 * Inscripción en pareja (odd/tasks/talleres-inscripcion-en-pareja.md, P1) —
 * static SQL-text assertions over
 * supabase/migrations/20261003160000_talleres_inscripcion_en_pareja.sql
 * (pattern: cierre-de-edicion.test.ts).
 *
 * Behavior is proven against staging by
 * supabase/tests/talleres-inscripcion-en-pareja.test.sql; this file pins what
 * a later edit could silently break without any SQL run:
 *   - identity comes from auth.uid(), never from a p_auth_id parameter, and a
 *     session without a ficha gets 42501 SIN_FICHA;
 *   - every new function is a definer with a pinned search_path, revokes
 *     PUBLIC and anon, and only the three RPCs reach authenticated;
 *   - acciones_limitadas is closed to anon and authenticated;
 *   - the lookup and the cédula mode share one throttle bucket, and the
 *     one-appearance trigger shares the cupo gate's lock;
 *   - taller_inscripciones_insert keeps only its staff branches.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

const PUBLIC_RPCS = [
  'talleres_mi_conyuge_registrado\\(\\)',
  'talleres_buscar_pareja_por_cedula\\(uuid, text\\)',
  'talleres_inscribirme\\(uuid, jsonb\\)',
] as const

const INTERNAL_HELPERS = [
  'talleres_inscripciones_una_aparicion\\(\\)',
  'consumir_limite_accion\\(uuid, text, integer, interval\\)',
  'talleres_conyuge_unico\\(uuid\\)',
  'talleres_cedula_pareja_normalizada\\(text\\)',
  'talleres_persona_activa_en_edicion\\(uuid, uuid\\)',
  'talleres_pareja_por_cedula\\(uuid, uuid, text\\)',
] as const

const FUNCTION_NAMES = [
  'talleres_mi_conyuge_registrado',
  'talleres_buscar_pareja_por_cedula',
  'talleres_inscribirme',
  'talleres_inscripciones_una_aparicion',
  'consumir_limite_accion',
  'talleres_conyuge_unico',
  'talleres_cedula_pareja_normalizada',
  'talleres_persona_activa_en_edicion',
  'talleres_pareja_por_cedula',
] as const

const STAFF_BRANCHES = [
  "auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_cohorte(cohorte_id))",
  "auth_has_talleres_capability_scoped('talleres_crecimiento.director.write'::text, talleres_equipo_de_cohorte(cohorte_id))",
  "auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, talleres_equipo_de_cohorte(cohorte_id))",
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
  // eslint-disable-next-line security/detect-non-literal-regexp -- name comes from fixed function names in this file
  const pattern = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${name}\\s*\\([\\s\\S]*?\\$function\\$;`,
    'i',
  )
  return sql.match(pattern)?.[0] ?? ''
}

describe('inscripción en pareja migration', () => {
  const migrationPath = findMigration(/_talleres_inscripcion_en_pareja\.sql$/)

  it('migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const rawContent = readFileSync(migrationPath, 'utf-8')
  const sqlOnly = rawContent.replace(/--[^\n]*/g, '')

  const blocks = Object.fromEntries(
    FUNCTION_NAMES.map((name): [string, string] => [name, functionBlock(sqlOnly, name)]),
  )

  it('defines the three RPCs and the six internal helpers', () => {
    for (const name of FUNCTION_NAMES) {
      expect(blocks[name]).not.toBe('')
    }
  })

  describe('identity', () => {
    it('takes no p_auth_id anywhere', () => {
      expect(sqlOnly).not.toMatch(/p_auth_id/i)
    })

    it('every RPC resolves the actor from auth.uid() and raises 42501 SIN_FICHA without a ficha', () => {
      for (const name of [
        'talleres_mi_conyuge_registrado',
        'talleres_buscar_pareja_por_cedula',
        'talleres_inscribirme',
      ]) {
        expect(blocks[name]).toMatch(
          /SELECT\s+u\.id\s+INTO\s+v_actor_id\s+FROM\s+public\.usuarios\s+u\s+WHERE\s+u\.auth_id\s*=\s*auth\.uid\(\)/i,
        )
        expect(blocks[name]).toMatch(/RAISE\s+EXCEPTION\s+'SIN_FICHA'\s+USING\s+ERRCODE\s*=\s*'42501'/i)
      }
    })
  })

  describe('grants', () => {
    it('every new function is a definer with search_path pinned to public', () => {
      for (const name of FUNCTION_NAMES) {
        expect(blocks[name]).toMatch(/SECURITY\s+DEFINER/i)
        expect(blocks[name]).toMatch(/SET\s+search_path\s+TO\s+'public'/i)
      }
    })

    it('the RPCs revoke PUBLIC and anon and are granted to authenticated and service_role', () => {
      for (const signature of PUBLIC_RPCS) {
        expect(sqlOnly).toMatch(
          // eslint-disable-next-line security/detect-non-literal-regexp -- built from a fixed local list
          new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${signature}\\s+FROM\\s+PUBLIC,\\s*anon;`, 'i'),
        )
        expect(sqlOnly).toMatch(
          // eslint-disable-next-line security/detect-non-literal-regexp -- built from a fixed local list
          new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${signature}\\s+TO\\s+authenticated,\\s*service_role;`, 'i'),
        )
      }
    })

    it('the internal helpers are granted to service_role only', () => {
      for (const signature of INTERNAL_HELPERS) {
        expect(sqlOnly).toMatch(
          // eslint-disable-next-line security/detect-non-literal-regexp -- built from a fixed local list
          new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${signature}\\s+FROM\\s+PUBLIC,\\s*anon,\\s*authenticated;`, 'i'),
        )
        expect(sqlOnly).toMatch(
          // eslint-disable-next-line security/detect-non-literal-regexp -- built from a fixed local list
          new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${signature}\\s+TO\\s+service_role;`, 'i'),
        )
      }
    })

    it('grants nothing to anon', () => {
      expect(sqlOnly).not.toMatch(/GRANT\s[^;]*\bTO\s[^;]*\banon\b/i)
    })

    it('acciones_limitadas has RLS on and is revoked from anon and authenticated', () => {
      expect(sqlOnly).toMatch(/ALTER\s+TABLE\s+public\.acciones_limitadas\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i)
      expect(sqlOnly).toMatch(
        /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.acciones_limitadas\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i,
      )
    })
  })

  describe('throttle and invariants', () => {
    it('the lookup and the cédula mode consume the same pareja_cedula bucket: 10 per 24 h', () => {
      for (const name of ['talleres_buscar_pareja_por_cedula', 'talleres_inscribirme']) {
        expect(blocks[name]).toMatch(
          /public\.consumir_limite_accion\(v_actor_id,\s*'pareja_cedula',\s*10,\s*interval\s+'24 hours'\)/i,
        )
      }
    })

    it('acciones_limitadas cannot store a cédula: accion allows no digits', () => {
      expect(sqlOnly).toMatch(/accion\s+text\s+NOT\s+NULL\s+CHECK\s*\(\s*accion\s*~\s*'\^\[a-z\]\[a-z_\]\{0,62\}\$'\s*\)/i)
    })

    it('the one-appearance trigger and the RPC take the cupo gate advisory lock', () => {
      expect(blocks.talleres_inscripciones_una_aparicion).toMatch(
        /pg_advisory_xact_lock\(hashtext\('talleres_cupo:'\s*\|\|\s*NEW\.taller_id::text\)\)/,
      )
      expect(blocks.talleres_inscribirme).toMatch(
        /pg_advisory_xact_lock\(hashtext\('talleres_cupo:'\s*\|\|\s*p_edicion_id::text\)\)/,
      )
      expect(blocks.talleres_inscripciones_una_aparicion).toMatch(
        /RAISE\s+EXCEPTION\s+'PERSONA_YA_EN_EDICION'\s+USING\s+ERRCODE\s*=\s*'P0001'/i,
      )
    })

    it('the effective vínculo is the edición link_type, then the taller vinculo, then the member choice', () => {
      expect(blocks.talleres_inscribirme).toMatch(
        /v_vinculo\s*:=\s*COALESCE\(\s*v_edicion\.link_type,\s*v_vinculo_taller,/i,
      )
    })

    it('outcomes after the throttle are returned, not raised', () => {
      for (const codigo of ['LIMITE_ALCANZADO', 'PAREJA_NO_CONFIRMADA', 'CUPO_LLENO']) {
        // eslint-disable-next-line security/detect-non-literal-regexp -- built from a fixed local list
        expect(blocks.talleres_inscribirme).toMatch(new RegExp(`'codigo',\\s*'${codigo}'`))
        // eslint-disable-next-line security/detect-non-literal-regexp -- built from a fixed local list
        expect(blocks.talleres_inscribirme).not.toMatch(new RegExp(`RAISE\\s+EXCEPTION\\s+'${codigo}'`, 'i'))
      }
    })
  })

  describe('insert policy', () => {
    const policy =
      sqlOnly.match(/ALTER\s+POLICY\s+taller_inscripciones_insert[\s\S]*?\n\);/i)?.[0] ?? ''

    it('keeps the three staff branches verbatim', () => {
      for (const branch of STAFF_BRANCHES) {
        expect(policy).toContain(branch)
      }
    })

    it('drops the self-enroll branch', () => {
      expect(policy).not.toBe('')
      expect(policy).not.toMatch(/auth\.uid\(\)/)
      expect(policy).not.toMatch(/persona_principal_id/)
    })
  })
})
