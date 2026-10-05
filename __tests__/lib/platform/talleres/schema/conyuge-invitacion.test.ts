/**
 * Ficha nueva del cónyuge e invitación (odd/tasks/talleres-conyuge-invitacion.md, C1) —
 * static SQL-text assertions over
 * supabase/migrations/20261004150000_talleres_conyuge_invitacion.sql
 * (pattern: inscripcion-en-pareja.test.ts).
 *
 * Behavior is proven against staging by
 * supabase/tests/talleres-conyuge-invitacion.test.sql; this file pins what a
 * later edit could silently break without any SQL run:
 *   - every function is a definer with a pinned search_path and revokes
 *     PUBLIC and anon; only talleres_inscribirme reaches authenticated;
 *   - invitaciones_acceso has RLS on and no grants for anon/authenticated;
 *   - the ficha_nueva mode keeps its throttles, its neutral refusal and
 *     never returns the invitation id;
 *   - the token is stored only as a 64-hex hash.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

const SERVICE_FUNCTIONS = [
  'invitacion_acceso_pendientes_de_envio\\(\\)',
  'invitacion_acceso_preparar_envio\\(uuid, text, timestamptz\\)',
  'invitacion_acceso_registrar_envio\\(uuid, boolean, text\\)',
  'talleres_inscripcion_cancela_invitaciones\\(\\)',
  'invitacion_acceso_consultar\\(text\\)',
  'invitacion_acceso_verificar\\(text, text\\)',
  'invitacion_acceso_vincular\\(uuid, uuid, boolean\\)',
  'ficha_tiene_invitacion_abierta\\(uuid\\)',
] as const

const FUNCTION_NAMES = [
  'talleres_inscribirme',
  'invitacion_acceso_pendientes_de_envio',
  'invitacion_acceso_preparar_envio',
  'invitacion_acceso_registrar_envio',
  'talleres_inscripcion_cancela_invitaciones',
  'invitacion_acceso_consultar',
  'invitacion_acceso_verificar',
  'invitacion_acceso_vincular',
  'ficha_tiene_invitacion_abierta',
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

describe('conyuge invitación migration', () => {
  const migrationPath = findMigration(/_talleres_conyuge_invitacion\.sql$/)

  it('migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const sqlOnly = readFileSync(migrationPath, 'utf-8').replace(/--[^\n]*/g, '')
  const blocks = Object.fromEntries(
    FUNCTION_NAMES.map((name): [string, string] => [name, functionBlock(sqlOnly, name)]),
  )

  it('defines every function', () => {
    for (const name of FUNCTION_NAMES) {
      expect(blocks[name]).not.toBe('')
    }
  })

  describe('grants', () => {
    it('every function is a definer with search_path pinned to public', () => {
      for (const name of FUNCTION_NAMES) {
        expect(blocks[name]).toMatch(/SECURITY\s+DEFINER/i)
        expect(blocks[name]).toMatch(/SET\s+search_path\s+TO\s+'public'/i)
      }
    })

    it('the service functions revoke PUBLIC, anon and authenticated and reach only service_role', () => {
      for (const signature of SERVICE_FUNCTIONS) {
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

    it('talleres_inscribirme stays closed to anon and open to authenticated', () => {
      expect(sqlOnly).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.talleres_inscribirme\(uuid, jsonb\)\s+FROM\s+PUBLIC,\s*anon;/i)
      expect(sqlOnly).toMatch(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.talleres_inscribirme\(uuid, jsonb\)\s+TO\s+authenticated,\s*service_role;/i,
      )
    })

    it('invitaciones_acceso has RLS on and no grant for anon or authenticated', () => {
      expect(sqlOnly).toMatch(/ALTER\s+TABLE\s+public\.invitaciones_acceso\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i)
      expect(sqlOnly).toMatch(/REVOKE\s+ALL\s+ON\s+TABLE\s+public\.invitaciones_acceso\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i)
      expect(sqlOnly).not.toMatch(/GRANT\s+[A-Z, ]+\s+ON\s+(TABLE\s+)?public\.invitaciones_acceso\s+TO/i)
    })
  })

  describe('ficha_nueva mode', () => {
    const body = blocks.talleres_inscribirme

    it('takes the actor from auth.uid()', () => {
      expect(body).toMatch(
        /SELECT\s+u\.id\s+INTO\s+v_actor_id\s+FROM\s+public\.usuarios\s+u\s+WHERE\s+u\.auth_id\s*=\s*auth\.uid\(\)/i,
      )
    })

    it('raises each validation code as 22023', () => {
      for (const code of [
        'CEDULA_INVALIDA',
        'NOMBRE_INVALIDO',
        'EMAIL_INVALIDO',
        'GENERO_INVALIDO',
        'FECHA_NACIMIENTO_INVALIDA',
      ]) {
        if (code === 'CEDULA_INVALIDA') {
          expect(body).toMatch(/talleres_cedula_pareja_normalizada\(p_pareja\s*->>\s*'cedula'\)/)
          continue
        }
        // eslint-disable-next-line security/detect-non-literal-regexp -- fixed local list
        expect(body).toMatch(new RegExp(`RAISE\\s+EXCEPTION\\s+'${code}'\\s+USING\\s+ERRCODE\\s*=\\s*'22023'`))
      }
    })

    it('limits to callers with a role, 2 per 30 days each and 30 per 24 h overall', () => {
      expect(body).toMatch(/FROM\s+public\.usuario_roles\s+ur\s+WHERE\s+ur\.usuario_id\s*=\s*v_actor_id/i)
      expect(body).toMatch(/consumir_limite_accion\(v_actor_id,\s*'pareja_ficha_nueva',\s*2,\s*interval\s+'30 days'\)/i)
      expect(body).toMatch(/interval\s+'24 hours'\)\s*>=\s*30/i)
    })

    it('checks cédula, email (usuarios and auth.users, lower case) and age before writing', () => {
      expect(body).toMatch(/u\.cedula\s*=\s*v_cedula/)
      expect(body).toMatch(/lower\(u\.email\)\s*=\s*v_email/)
      expect(body).toMatch(/auth\.users\s+au\s+WHERE\s+lower\(au\.email\)\s*=\s*v_email/)
      expect(body).toMatch(/interval\s+'18 years'/)
    })

    it('never returns the invitation id', () => {
      expect(body).not.toMatch(/'invitacion_id'/)
    })

    it('widens the pareja_origen CHECK to ficha_nueva', () => {
      expect(sqlOnly).toMatch(/pareja_origen\s+IN\s+\('conyuge_registrado',\s*'cedula',\s*'ficha_nueva'\)/)
    })
  })

  describe('token', () => {
    it('stores only a 64-hex hash, unique', () => {
      expect(sqlOnly).toMatch(/token_hash\s+text\s+NULL\s+UNIQUE\s+CHECK\s+\(token_hash\s+IS\s+NULL\s+OR\s+token_hash\s+~\s+'\^\[0-9a-f\]\{64\}\$'\)/)
    })

    it('blocks after 5 failed cédula checks', () => {
      expect(blocks.invitacion_acceso_verificar).toMatch(/intentos_activacion\s*\+\s*1\s*>=\s*5/)
      expect(blocks.invitacion_acceso_verificar).toMatch(/estado\s*=\s*'bloqueada'/)
    })

    it('consultar returns the creator name with an initial and the vinculo', () => {
      expect(blocks.invitacion_acceso_consultar).toMatch(/'nombre_invitante',\s*v_invitante/)
      expect(blocks.invitacion_acceso_consultar).toMatch(/'vinculo',\s*v_vinculo/)
      expect(blocks.invitacion_acceso_consultar).toMatch(/i\.link_type/)
    })

    it('links the ficha only when auth_id IS NULL', () => {
      expect(blocks.invitacion_acceso_vincular).toMatch(/WHERE\s+id\s*=\s*v_inv\.usuario_id\s+AND\s+auth_id\s+IS\s+NULL/i)
    })
  })
})
