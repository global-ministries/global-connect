import { renderHook, waitFor } from '@testing-library/react'

import { useCurrentUser } from '@/hooks/useCurrentUser'

const createClient = jest.fn()

jest.mock('@/lib/supabase/client', () => ({ createClient: () => createClient() }))

describe('useCurrentUser', () => {
  beforeEach(() => {
    createClient.mockReset()
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
})
