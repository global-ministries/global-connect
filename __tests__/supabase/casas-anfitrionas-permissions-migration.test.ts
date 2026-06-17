import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
const supabaseTestsDir = join(process.cwd(), 'supabase', 'tests')
const generatedTypesPath = join(process.cwd(), 'lib', 'supabase', 'database.types.ts')
const rpcNames = [
  'obtener_permisos_casa_anfitriona',
  'puede_ver_casa_anfitriona',
  'puede_crear_casa_anfitriona_para',
  'puede_aprobar_casa_anfitriona',
  'puede_editar_casa_anfitriona',
  'puede_cambiar_estado_casa_anfitriona',
]
const expectedStagingMigrationFiles = [
  '20260617161620_casas_anfitrionas_granular_permissions.sql',
  '20260617161954_revoke_anon_from_casas_permission_rpcs.sql',
]
const rpcSignatures = {
  obtener_permisos_casa_anfitriona: 'obtener_permisos_casa_anfitriona(uuid, uuid)',
  puede_ver_casa_anfitriona: 'puede_ver_casa_anfitriona(uuid, uuid)',
  puede_crear_casa_anfitriona_para: 'puede_crear_casa_anfitriona_para(uuid, uuid)',
  puede_aprobar_casa_anfitriona: 'puede_aprobar_casa_anfitriona(uuid, uuid)',
  puede_editar_casa_anfitriona: 'puede_editar_casa_anfitriona(uuid, uuid)',
  puede_cambiar_estado_casa_anfitriona: 'puede_cambiar_estado_casa_anfitriona(uuid, uuid)',
}
const requiredFixtureTables = [
  'public.roles_sistema',
  'public.usuarios',
  'public.usuario_roles',
  'public.segmentos',
  'public.temporadas',
  'public.grupos',
  'public.grupo_miembros',
  'public.segmento_lideres',
  'public.director_etapa_grupos',
  'public.casas_anfitrionas',
]

function readCasasPermissionsMigration(): string {
  const file = readdirSync(migrationsDir).find((name) =>
    name.endsWith('_casas_anfitrionas_granular_permissions.sql'),
  )

  if (!file) throw new Error('Missing casas anfitrionas granular permissions migration')

  return readFileSync(join(migrationsDir, file), 'utf8')
}

function readCasasRpcChecks(): string {
  return readFileSync(
    join(supabaseTestsDir, 'casas-anfitrionas-permissions-rpc.test.sql'),
    'utf8',
  )
}

function readGeneratedTypes(): string {
  return readFileSync(generatedTypesPath, 'utf8')
}

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, ' ')
}

function functionSql(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)

  if (start === -1) throw new Error(`Missing function ${name}`)

  const end = sql.indexOf('$$;', start)
  return compactSql(sql.slice(start, end + '$$;'.length))
}

describe('casas anfitrionas granular permissions migration', () => {
  it('keeps checked-in migration history aligned with global staging evidence', () => {
    const migrationFiles = readdirSync(migrationsDir)

    for (const file of expectedStagingMigrationFiles) {
      expect(migrationFiles).toContain(file)
    }

    expect(migrationFiles).not.toContain('20260617120000_casas_anfitrionas_granular_permissions.sql')
  })

  it('defines the additive Casas RPC contract', () => {
    const sql = readCasasPermissionsMigration()

    for (const name of rpcNames) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${name}`)
    }
  })

  it('protects every RPC with security definer search path and explicit grants', () => {
    const sql = readCasasPermissionsMigration()

    for (const name of rpcNames) {
      const body = functionSql(sql, name)
      const signature = rpcSignatures[name as keyof typeof rpcSignatures]

      expect(body).toMatch(/LANGUAGE plpgsql (STABLE )?SECURITY DEFINER SET search_path TO 'public'/i)
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC;`)
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM anon;`)
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated, service_role;`)
      expect(sql).not.toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO anon`)
    }
  })

  it('binds every authenticated RPC call to the real caller identity', () => {
    const sql = readCasasPermissionsMigration()

    for (const name of rpcNames) {
      const body = functionSql(sql, name)

      expect(body).toContain('p_auth_id IS DISTINCT FROM auth.uid()')
    }
  })

  it('keeps the migration additive and does not repair production data', () => {
    const sql = readCasasPermissionsMigration()

    expect(sql).not.toMatch(/\bDROP\b/i)
    expect(sql).not.toMatch(/\bTRUNCATE\b/i)
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i)
    expect(sql).not.toMatch(/\bUPDATE\s+public\./i)
  })

  it('does not use user-editable JWT metadata for authorization', () => {
    const sql = readCasasPermissionsMigration()

    expect(sql).not.toMatch(/user_metadata|raw_user_meta_data|auth\.jwt\(\)/i)
  })

  it('documents deterministic staging RPC checks for allowed and denied role/scope cases', () => {
    const sql = readCasasRpcChecks()

    expect(sql).toContain('BEGIN;')
    expect(sql).toContain('ROLLBACK;')
    expect(sql).toContain("set_config('request.jwt.claim.sub'")
    expect(sql).toContain('assert_permission(')
    expect(sql).toContain('admin can approve an in-scope house')
    expect(sql).toContain('director etapa cannot approve')
    expect(sql).toContain('director etapa can edit in-scope house')
    expect(sql).toContain('leader can create only for same active group')
    expect(sql).toContain('spoofed p_auth_id is denied')
  })

  it('documents executable effective RPC privilege checks for every exposed role', () => {
    const sql = readCasasRpcChecks()

    expect(sql).toContain('has_function_privilege(')
    expect(sql).toContain('assert_function_privilege(')

    for (const signature of Object.values(rpcSignatures)) {
      expect(sql).toContain(`('anon', 'public.${signature}', 'EXECUTE', false)`)
      expect(sql).toContain(`('authenticated', 'public.${signature}', 'EXECUTE', true)`)
      expect(sql).toContain(`('service_role', 'public.${signature}', 'EXECUTE', true)`)
    }
  })

  it('keeps RPC contract evidence self-contained without manual fixture replacement', () => {
    const sql = readCasasRpcChecks()
    const compacted = compactSql(sql)

    expect(sql).not.toMatch(/replace the fixture|manual|placeholder/i)
    expect(sql).not.toContain('00000000-0000-0000-0000-')
    expect(sql).toContain('gc_casas_permissions_fixture')

    for (const table of requiredFixtureTables) {
      expect(compacted).toContain(`INSERT INTO ${table}`)
    }

    expect(sql).toContain("SELECT set_config('request.jwt.claim.sub', fixture_id('admin_auth_id')::text, true);")
    expect(sql).toContain("SELECT set_config('request.jwt.claim.sub', fixture_id('director_etapa_auth_id')::text, true);")
    expect(sql).toContain("SELECT set_config('request.jwt.claim.sub', fixture_id('leader_auth_id')::text, true);")
    expect(sql).toContain("SELECT set_config('request.jwt.claim.sub', fixture_id('outsider_auth_id')::text, true);")
  })

  it('includes the Casas permission RPCs in generated Supabase types', () => {
    const types = readGeneratedTypes()

    expect(types).toContain('obtener_permisos_casa_anfitriona: {')
    expect(types).toContain('puede_ver_casa_anfitriona: {')
    expect(types).toContain('puede_crear_casa_anfitriona_para: {')
    expect(types).toContain('puede_aprobar_casa_anfitriona: {')
    expect(types).toContain('puede_editar_casa_anfitriona: {')
    expect(types).toContain('puede_cambiar_estado_casa_anfitriona: {')
    expect(types).toContain('Args: { p_auth_id: string; p_casa_id?: string }')
    expect(types).toContain('Args: { p_auth_id: string; p_casa_id: string }')
    expect(types).toContain('Args: { p_auth_id: string; p_usuario_id: string }')
  })
})
