import { renderHook, waitFor } from '@testing-library/react'

import { useCurrentUser } from '@/hooks/useCurrentUser'

const createClient = jest.fn()

jest.mock('@/lib/supabase/client', () => ({ createClient: () => createClient() }))

describe('useCurrentUser', () => {
  let mockNow = 1_700_000_000_000

  beforeEach(() => {
    mockNow += 20_000
    jest.spyOn(Date, 'now').mockReturnValue(mockNow)
    createClient.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('loads support capabilities separately from role names', async () => {
    const user = { id: 'auth-1' }
    const usuario = { id: 'usuario-1', auth_id: 'auth-1', nombre: 'Staff User' }
    const rolesRpc = jest.fn().mockResolvedValue({ data: ['admin'], error: null })
    const supportCapabilitiesQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockResolvedValue({ data: [{ capability: 'support.view' }, { capability: 'support.reply' }], error: null }),
    }
    const usuariosQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: usuario, error: null }),
    }
    const client = {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }),
        onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      },
      from: jest.fn((table: string) => {
        if (table === 'usuarios') return usuariosQuery
        if (table === 'support_user_capabilities') return supportCapabilitiesQuery
        throw new Error(`Unexpected table ${table}`)
      }),
      rpc: rolesRpc,
    }
    createClient.mockReturnValue(client)

    const { result } = renderHook(() => useCurrentUser())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.roles).toEqual(['admin'])
    expect(result.current.supportCapabilities).toEqual(['support.view', 'support.reply'])
    expect(client.from).toHaveBeenCalledWith('support_user_capabilities')
    expect(supportCapabilitiesQuery.eq).toHaveBeenCalledWith('usuario_id', 'usuario-1')
    expect(supportCapabilitiesQuery.is).toHaveBeenCalledWith('revoked_at', null)
  })

  it('exposes a client-safe read-only platformSession for a linked user', async () => {
    const user = { id: 'auth-1' }
    const usuario = {
      id: 'usuario-1',
      auth_id: 'auth-1',
      nombre: 'Staff User',
      telefono: '+5491111111111',
    }
    const rolesRpc = jest.fn().mockResolvedValue({ data: [{ nombre_interno: 'admin' }], error: null })
    const supportCapabilitiesQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockResolvedValue({ data: [{ capability: 'support.manage' }], error: null }),
    }
    const usuariosQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: usuario, error: null }),
    }
    const client = {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }),
        onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      },
      from: jest.fn((table: string) => {
        if (table === 'usuarios') return usuariosQuery
        if (table === 'support_user_capabilities') return supportCapabilitiesQuery
        throw new Error(`Unexpected table ${table}`)
      }),
      rpc: rolesRpc,
    }
    createClient.mockReturnValue(client)

    const { result } = renderHook(() => useCurrentUser())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.roles).toEqual(['admin'])
    expect(result.current.supportCapabilities).toEqual(['support.manage'])
    expect(result.current.platformSession).toEqual({
      personaId: 'usuario-1',
      subjectAuthId: 'auth-1',
      globalRoles: ['admin'],
      contexts: [],
      capabilities: [],
    })
    expect(Object.keys(result.current.platformSession ?? {}).sort()).toEqual([
      'capabilities',
      'contexts',
      'globalRoles',
      'personaId',
      'subjectAuthId',
    ])
  })

  it('fails closed to legacy data when no Persona row is linked', async () => {
    const user = { id: 'auth-missing-persona' }
    const rolesRpc = jest.fn().mockResolvedValue({ data: ['lider'], error: null })
    const usuariosQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }
    const client = {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }),
        onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      },
      from: jest.fn((table: string) => {
        if (table === 'usuarios') return usuariosQuery
        throw new Error(`Unexpected table ${table}`)
      }),
      rpc: rolesRpc,
    }
    createClient.mockReturnValue(client)

    const { result } = renderHook(() => useCurrentUser())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.usuario).toBeNull()
    expect(result.current.roles).toEqual(['lider'])
    expect(result.current.supportCapabilities).toEqual([])
    expect(result.current.platformSession).toBeNull()
    expect(client.from).not.toHaveBeenCalledWith('support_user_capabilities')
  })
})
