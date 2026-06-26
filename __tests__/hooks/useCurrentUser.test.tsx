import { act, renderHook, waitFor } from '@testing-library/react'

import { useCurrentUser } from '@/hooks/useCurrentUser'

const createClient = jest.fn()

jest.mock('@/lib/supabase/client', () => ({ createClient: () => createClient() }))

type MockAuthUser = { id: string }
type MockUsuario = { id: string; auth_id: string; nombre: string; telefono?: string }
type AuthStateEvent = 'SIGNED_IN' | 'SIGNED_OUT'
type CapturedAuthStateCallback = (event: AuthStateEvent, session: unknown | null) => void
type GetUserResponse = { data: { user: MockAuthUser | null }; error: null }
type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}
type SupabaseMockStep = {
  user: MockAuthUser | null
  cacheAuthUser?: MockAuthUser | null
  usuario?: MockUsuario | null
  roles?: unknown[]
  supportCapabilities?: string[]
  getUserDeferred?: Deferred<GetUserResponse>
}

const DETERMINISTIC_NOW_MS = 1_700_000_000_000
const HOOK_CACHE_TTL_MS = 15_000
const CACHE_EXPIRY_ADVANCE_MS = HOOK_CACHE_TTL_MS + 5_000
const AUTH_SESSION_PLACEHOLDER = { user: { id: 'auth-session-placeholder' } }
let authStateCallback: CapturedAuthStateCallback | null = null

describe('useCurrentUser', () => {
  let mockNow = DETERMINISTIC_NOW_MS

  beforeEach(() => {
    mockNow += CACHE_EXPIRY_ADVANCE_MS
    jest.spyOn(Date, 'now').mockReturnValue(mockNow)
    authStateCallback = null
    createClient.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('loads support capabilities separately from role names', async () => {
    const user = { id: 'auth-1' }
    const usuario = { id: 'usuario-1', auth_id: 'auth-1', nombre: 'Staff User' }
    const { client, supportCapabilitiesQuery } = setupSupabaseClient([
      { user, usuario, roles: ['admin'], supportCapabilities: ['support.view', 'support.reply'] },
    ])

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
    const usuario = { id: 'usuario-1', auth_id: 'auth-1', nombre: 'Staff User' }
    setupSupabaseClient([
      { user, usuario, roles: [{ nombre_interno: 'admin' }], supportCapabilities: ['support.manage'] },
    ])

    const { result } = renderHook(() => useCurrentUser())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.platformSession).toEqual({
      personaId: 'usuario-1',
      subjectAuthId: 'auth-1',
      globalRoles: ['admin'],
      contexts: [],
      capabilities: [],
    })
  })

  it('fails closed to legacy data when no Persona row is linked', async () => {
    const user = { id: 'auth-missing-persona' }
    const { client } = setupSupabaseClient([
      { user, usuario: null, roles: ['lider'] },
    ])

    const { result } = renderHook(() => useCurrentUser())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.usuario).toBeNull()
    expect(result.current.roles).toEqual(['lider'])
    expect(result.current.supportCapabilities).toEqual([])
    expect(result.current.platformSession).toBeNull()
    expect(client.from).not.toHaveBeenCalledWith('support_user_capabilities')
  })

  it('clears user and platformSession state on SIGNED_OUT', async () => {
    const user = { id: 'auth-1' }
    const usuario = { id: 'usuario-1', auth_id: 'auth-1', nombre: 'Staff User' }
    const { triggerAuthStateChange } = setupSupabaseClient([
      { user, usuario, roles: ['admin'], supportCapabilities: ['support.view'] },
    ])

    const { result } = renderHook(() => useCurrentUser())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.usuario?.id).toBe('usuario-1')
    expect(result.current.platformSession?.personaId).toBe('usuario-1')

    await act(async () => {
      triggerAuthStateChange('SIGNED_OUT', null)
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.usuario).toBeNull()
    expect(result.current.roles).toEqual([])
    expect(result.current.supportCapabilities).toEqual([])
    expect(result.current.platformSession).toBeNull()
  })

  it('keeps user and platformSession cleared when SIGNED_OUT happens while a fetch is pending', async () => {
    const pendingGetUser = createDeferred<GetUserResponse>()
    const user = { id: 'auth-1' }
    const usuario = { id: 'usuario-1', auth_id: 'auth-1', nombre: 'Staff User' }
    const { client, triggerAuthStateChange } = setupSupabaseClient([
      { user, usuario, roles: ['admin'], supportCapabilities: ['support.view'], getUserDeferred: pendingGetUser },
    ])

    const { result } = renderHook(() => useCurrentUser())

    await act(async () => {
      triggerAuthStateChange('SIGNED_OUT', null)
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.usuario).toBeNull()
    expect(result.current.roles).toEqual([])
    expect(result.current.supportCapabilities).toEqual([])
    expect(result.current.platformSession).toBeNull()

    await act(async () => {
      pendingGetUser.resolve(getUserResponse(user))
      await flushPendingPromises()
    })

    await waitFor(() => expect(client.rpc).toHaveBeenCalledWith('obtener_roles_usuario', { p_auth_id: 'auth-1' }))
    expect(result.current.usuario).toBeNull()
    expect(result.current.roles).toEqual([])
    expect(result.current.supportCapabilities).toEqual([])
    expect(result.current.platformSession).toBeNull()
  })

  it('does not cache stale in-flight data after unmount and auth change', async () => {
    const pendingGetUser = createDeferred<GetUserResponse>()
    const user = { id: 'auth-1' }
    const usuario = { id: 'usuario-1', auth_id: 'auth-1', nombre: 'Staff User' }
    const { client } = setupSupabaseClient([
      { user, cacheAuthUser: null, usuario, roles: ['admin'], supportCapabilities: ['support.view'], getUserDeferred: pendingGetUser },
      { user: null },
    ])

    const { unmount } = renderHook(() => useCurrentUser())
    unmount()

    await act(async () => {
      pendingGetUser.resolve(getUserResponse(user))
      await flushPendingPromises()
    })

    await waitFor(() => expect(client.rpc).toHaveBeenCalledWith('obtener_roles_usuario', { p_auth_id: 'auth-1' }))
    unmount()

    const remounted = renderHook(() => useCurrentUser())

    await waitFor(() => expect(remounted.result.current.loading).toBe(false))
    expect(remounted.result.current.usuario).toBeNull()
    expect(remounted.result.current.roles).toEqual([])
    expect(remounted.result.current.supportCapabilities).toEqual([])
    expect(remounted.result.current.platformSession).toBeNull()
    expect(client.auth.getUser).toHaveBeenCalledTimes(4)

    remounted.unmount()
  })

  it('reloads platformSession for the signed-in user without stale Persona data', async () => {
    const firstUser = { id: 'auth-1' }
    const secondUser = { id: 'auth-2' }
    const firstUsuario = { id: 'usuario-1', auth_id: 'auth-1', nombre: 'First User' }
    const secondUsuario = { id: 'usuario-2', auth_id: 'auth-2', nombre: 'Second User' }
    const { client, triggerAuthStateChange } = setupSupabaseClient([
      { user: firstUser, usuario: firstUsuario, roles: ['admin'], supportCapabilities: ['support.view'] },
      { user: secondUser, usuario: secondUsuario, roles: ['lider'], supportCapabilities: ['support.reply'] },
    ])

    const { result } = renderHook(() => useCurrentUser())

    await waitFor(() => expect(result.current.platformSession?.personaId).toBe('usuario-1'))

    await act(async () => {
      triggerAuthStateChange('SIGNED_IN', AUTH_SESSION_PLACEHOLDER)
    })

    await waitFor(() => expect(result.current.platformSession?.personaId).toBe('usuario-2'))
    expect(result.current.usuario?.id).toBe('usuario-2')
    expect(result.current.roles).toEqual(['lider'])
    expect(result.current.supportCapabilities).toEqual(['support.reply'])
    expect(result.current.platformSession).toEqual({
      personaId: 'usuario-2',
      subjectAuthId: 'auth-2',
      globalRoles: ['lider'],
      contexts: [],
      capabilities: [],
    })
    expect(client.auth.getUser).toHaveBeenCalledTimes(4)
  })

})

function setupSupabaseClient(steps: SupabaseMockStep[]) {
  const getUser = jest.fn()
  const maybeSingle = jest.fn()
  const rolesRpc = jest.fn()
  const supportCapabilitiesResolver = jest.fn()

  for (const step of steps) {
    if (step.getUserDeferred) {
      getUser.mockReturnValueOnce(step.getUserDeferred.promise)
    } else {
      getUser.mockResolvedValueOnce(getUserResponse(step.user))
    }
    const cacheAuthUser = 'cacheAuthUser' in step ? step.cacheAuthUser ?? null : step.user
    getUser.mockResolvedValueOnce(getUserResponse(cacheAuthUser))

    if (!step.user) continue

    maybeSingle.mockResolvedValueOnce({ data: step.usuario ?? null, error: null })
    rolesRpc.mockResolvedValueOnce({ data: step.roles ?? [], error: null })

    if (step.usuario?.id) {
      supportCapabilitiesResolver.mockResolvedValueOnce({
        data: supportCapabilityRows(step.supportCapabilities ?? []),
        error: null,
      })
    }
  }

  const usuariosQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle,
  }
  const supportCapabilitiesQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: supportCapabilitiesResolver,
  }
  const client = {
    auth: {
      getUser,
      onAuthStateChange: jest.fn((callback: CapturedAuthStateCallback) => {
        authStateCallback = callback
        return { data: { subscription: { unsubscribe: jest.fn() } } }
      }),
    },
    from: jest.fn((table: string) => {
      if (table === 'usuarios') return usuariosQuery
      if (table === 'support_user_capabilities') return supportCapabilitiesQuery
      throw new Error(`Unexpected table ${table}`)
    }),
    rpc: rolesRpc,
  }
  createClient.mockReturnValue(client)

  return { client, usuariosQuery, supportCapabilitiesQuery, triggerAuthStateChange }
}

function triggerAuthStateChange(event: AuthStateEvent, session: unknown | null) {
  if (!authStateCallback) {
    throw new Error('Auth state change callback was not registered')
  }

  authStateCallback(event, session)
}

function supportCapabilityRows(capabilities: string[]) {
  return capabilities.map((capability) => ({ capability }))
}

function getUserResponse(user: MockAuthUser | null): GetUserResponse {
  return { data: { user }, error: null }
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve']
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

async function flushPendingPromises() {
  for (let cycle = 0; cycle < 10; cycle += 1) {
    await Promise.resolve()
  }
}
