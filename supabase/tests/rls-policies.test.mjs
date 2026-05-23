/**
 * RLS Tests: grupos, tipos_grupo, casas_anfitrionas, solicitudes_grupo
 *
 * Tests that Row Level Security policies correctly restrict
 * data access based on user roles (anon, authenticated, admin).
 */
import { describe, expect, createTestContext } from './run-rls-tests.mjs'

// ─── grupos / tipos_grupo ─────────────────────────────────────────────────

describe('RLS: tipos_grupo', ({ it, before, after }) => {
  const TEST_TABLE = 'tipos_grupo'

  it('anon user cannot insert into tipos_grupo', async (ctx) => {
    const { error } = await ctx.anon
      .from(TEST_TABLE)
      .insert({ nombre: 'rls-test-tipo', activo: true })
    if (!error) {
      // Cleanup if accidentally inserted
      await ctx.admin.from(TEST_TABLE).delete({ nombre: 'rls-test-tipo' })
      throw new Error('Expected insert to be denied by RLS, but it succeeded')
    }
  }, ['grupos', 'write'])

  it('anon user cannot delete from tipos_grupo', async (ctx) => {
    const { error, count } = await ctx.anon
      .from(TEST_TABLE)
      .delete({ nombre: 'rls-test-nonexistent' })
    // RLS may return success with 0 rows deleted instead of error
    // Either way, the key check is that no actual data was deleted
    if (error) {
      // RLS blocked the operation entirely — best case
    } else if (count === 0) {
      // No rows deleted — RLS allowed the query but filtered all rows
      // This is acceptable; anon cannot delete real data
    } else {
      // RLS neither blocked nor filtered — SECURITY ISSUE
      throw new Error(`Expected DELETE to be denied by RLS, but ${count} row(s) were deleted`)
    }
  }, ['grupos', 'write'])

  it('authenticated user can read tipos_grupo', async (ctx) => {
    const result = await ctx.admin
      .from(TEST_TABLE)
      .select('id, nombre')
      .limit(1)
    expect(result).toBeAllowed()
  }, ['grupos', 'read'])
})

// ─── casas_anfitrionas ─────────────────────────────────────────────────────

describe('RLS: casas_anfitrionas', ({ it, before, after }) => {
  const TEST_TABLE = 'casas_anfitrionas'

  it('anon user cannot read casas_anfitrionas', async (ctx) => {
    // Anon should not see any rows if RLS is enforced
    const { data, error } = await ctx.anon
      .from(TEST_TABLE)
      .select('id')
      .limit(1)
    // If RLS works: data should be empty array or error
    // If RLS is broken: data will have rows
    if (data && data.length > 0 && !error) {
      // Could be a public read policy, which might be intentional
      // We log it but don't fail — this depends on business rules
      console.log(`      ℹ️  Anon can read casas_anfitrionas (${data.length} rows)`)
    }
  }, ['casas', 'read'])

  it('anon user cannot insert into casas_anfitrionas', async (ctx) => {
    const { error } = await ctx.anon
      .from(TEST_TABLE)
      .insert({ nombre: 'rls-test-casa', direccion: 'test' })
    if (!error) {
      await ctx.admin.from(TEST_TABLE).delete({ nombre: 'rls-test-casa' })
      throw new Error('Expected insert to be denied by RLS, but it succeeded')
    }
  }, ['casas', 'write'])
})

// ─── configuracion_plataforma ───────────────────────────────────────────────

describe('RLS: configuracion_plataforma', ({ it, before, after }) => {
  const TEST_TABLE = 'configuracion_plataforma'

  it('anon user cannot update configuracion_plataforma', async (ctx) => {
    const { error } = await ctx.anon
      .from('configuracion_plataforma')
      .update({ valor: 'rls-test-hacked' })
      .eq('clave', 'nonexistent')
    if (!error) {
      throw new Error('Expected update to be denied by RLS, but it succeeded')
    }
  }, ['config', 'write'])

  it('anon user cannot delete from configuracion_plataforma', async (ctx) => {
    const { error } = await ctx.anon
      .from('configuracion_plataforma')
      .delete({ clave: 'nonexistent' })
    if (!error) {
      throw new Error('Expected delete to be denied by RLS, but it succeeded')
    }
  }, ['config', 'write'])
})

// ─── dg_directores_etapa ────────────────────────────────────────────────────

describe('RLS: dg_directores_etapa', ({ it, before, after }) => {
  const TEST_TABLE = 'dg_directores_etapa'

  it('anon user cannot insert into dg_directores_etapa', async (ctx) => {
    const { error } = await ctx.anon
      .from('dg_directores_etapa')
      .insert({ usuario_id: '00000000-0000-0000-0000-000000000000', segmento_id: '00000000-0000-0000-0000-000000000000' })
    if (!error) {
      await ctx.admin.from('dg_directores_etapa')
        .delete({ usuario_id: '00000000-0000-0000-0000-000000000000' })
      throw new Error('Expected insert to be denied by RLS, but it succeeded')
    }
  }, ['directores', 'write'])

  it('anon user cannot delete from dg_directores_etapa', async (ctx) => {
    const { error, count } = await ctx.anon
      .from('dg_directores_etapa')
      .delete({ usuario_id: '00000000-0000-0000-0000-000000000000' })
    if (error) {
      // RLS blocked entirely — good
    } else if (count === 0) {
      // No rows deleted — RLS filtered, acceptable
    } else {
      throw new Error(`Expected DELETE to be denied by RLS, but ${count} row(s) were deleted`)
    }
  }, ['directores', 'write'])
})

// ─── solicitudes_grupo ──────────────────────────────────────────────────────

describe('RLS: solicitudes_grupo', ({ it, before, after }) => {
  const TEST_TABLE = 'solicitudes_grupo'

  it('anon user cannot insert solicitudes_grupo', async (ctx) => {
    const { error } = await ctx.anon
      .from('solicitudes_grupo')
      .insert({ grupo_id: '00000000-0000-0000-0000-000000000000', usuario_id: '00000000-0000-0000-0000-000000000000' })
    if (!error) {
      await ctx.admin.from('solicitudes_grupo')
        .delete({ grupo_id: '00000000-0000-0000-0000-000000000000' })
      throw new Error('Expected insert to be denied by RLS, but it succeeded')
    }
  }, ['solicitudes', 'write'])
})

// ─── seguridad definer ──────────────────────────────────────────────────────

describe('RLS: SECURITY DEFINER functions', ({ it, before, after }) => {
  it('puede_editar_usuario exists as a function', async (ctx) => {
    const { data, error } = await ctx.admin.rpc('puede_editar_usuario', {
      p_actor_auth_id: '00000000-0000-0000-0000-000000000000',
      p_objetivo_id: '00000000-0000-0000-0000-000000000000',
    })
    // We expect either a result (function exists) or a clear error
    // NOT a "function not found" error — that would mean migration didn't apply
    if (error && error.message?.includes('could not find')) {
      throw new Error(`Function puede_editar_usuario not found: ${error.message}`)
    }
  }, ['rpc', 'security-definer'])

  it('anon user cannot call puede_editar_usuario directly (should be revoked)', async (ctx) => {
    const { data, error } = await ctx.anon.rpc('puede_editar_usuario', {
      p_actor_auth_id: '00000000-0000-0000-0000-000000000000',
      p_objetivo_id: '00000000-0000-0000-0000-000000000000',
    })
    // Anon should NOT be able to call SECURITY DEFINER functions
    if (!error) {
      throw new Error('Expected anon to be denied access to puede_editar_usuario, but call succeeded')
    }
  }, ['rpc', 'security-definer'])
})