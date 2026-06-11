import {
  grantSupportCapability,
  revokeSupportCapability,
} from '@/lib/actions/support-capabilities.actions'

const createSupabaseServerClient = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))

describe('support capability admin actions', () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset()
    revalidatePath.mockReset()
  })

  it('rejects unsupported support capabilities before invoking the audited RPC', async () => {
    const rpc = jest.fn()
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true }),
      rpc,
    })

    const result = await grantSupportCapability('target-1', 'support.delete')

    expect(result).toEqual({ success: false, error: 'Capacidad de soporte invalida' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('denies capability changes without support.manage before invoking the audited RPC', async () => {
    const rpc = jest.fn()
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: false }),
      rpc,
    })

    const result = await grantSupportCapability('target-1', 'support.view')

    expect(result).toEqual({ success: false, error: 'No autorizado' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('denies pure support.manage staff without higher role context before invoking the audited RPC', async () => {
    const rpc = createSupportCapabilityRpcMock(['miembro'])
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true }),
      rpc,
    })

    const result = await grantSupportCapability('target-1', 'support.view')

    expect(result).toEqual({ success: false, error: 'No autorizado' })
    expect(rpc).not.toHaveBeenCalledWith('grant_support_capability', expect.anything())
  })

  it('denies pure support.manage staff from revoking capabilities before invoking the audited RPC', async () => {
    const rpc = createSupportCapabilityRpcMock(['miembro'])
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true }),
      rpc,
    })

    const result = await revokeSupportCapability('target-1', 'support.reply')

    expect(result).toEqual({ success: false, error: 'No autorizado' })
    expect(rpc).not.toHaveBeenCalledWith('revoke_support_capability', expect.anything())
  })

  it('grants an allowed support capability through the audited RPC', async () => {
    const rpc = createSupportCapabilityRpcMock(['admin'])
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true }),
      rpc,
    })

    const result = await grantSupportCapability('target-1', 'support.reply')

    expect(result).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('grant_support_capability', { p_target_usuario_id: 'target-1', p_capability: 'support.reply' })
    expect(revalidatePath).toHaveBeenCalledWith('/configuracion/soporte')
  })

  it('revokes an allowed support capability through the audited RPC', async () => {
    const rpc = createSupportCapabilityRpcMock(['pastor'])
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
      from: createStaffActionFromMock({ usuarioId: 'usuario-1', hasCapability: true }),
      rpc,
    })

    const result = await revokeSupportCapability('target-1', 'support.manage')

    expect(result).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('revoke_support_capability', { p_target_usuario_id: 'target-1', p_capability: 'support.manage' })
    expect(revalidatePath).toHaveBeenCalledWith('/configuracion/soporte')
  })
})

function createStaffActionFromMock(input: { usuarioId: string; hasCapability: boolean }) {
  return jest.fn((table) => {
    if (table === 'usuarios') return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: input.usuarioId }, error: null }) }) }) }
    if (table === 'support_user_capabilities') return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ is: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: input.hasCapability ? { capability: 'support.manage' } : null, error: null }) }) }) }) }) }
    throw new Error(`Unexpected table ${table}`)
  })
}

function createSupportCapabilityRpcMock(roles: string[]) {
  return jest.fn((rpcName) => {
    if (rpcName === 'obtener_roles_usuario') return Promise.resolve({ data: roles, error: null })
    return Promise.resolve({ error: null })
  })
}
