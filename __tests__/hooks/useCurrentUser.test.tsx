import { act, renderHook, waitFor } from '@testing-library/react'

import { useCurrentUser, __resetCurrentUserCacheForTesting, FETCH_TIMEOUT_MS } from '@/hooks/useCurrentUser'

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
// Mirrors the SIGNED_IN_DEBOUNCE_MS in the hook. Kept local rather than
// imported because the value is incidental to test correctness — tests
// only need "long enough to fire the debounce, short enough to not fire
// the 5s timeout".
const SIGNED_IN_DEBOUNCE_MS = 150
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
    __resetCurrentUserCacheForTesting()
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

  it('sets loading to false and clears state when getUser hangs past the timeout', async () => {
    jest.useFakeTimers()
    try {
      const pendingGetUser = createDeferred<GetUserResponse>()
      setupSupabaseClient([
        // Initial fetch — getUser never resolves. The cache is empty (first
        // render), so the cache-hit branch is skipped; the stalled getUser is
        // the one called by loadCurrentUserData. The hook must release
        // loading once the outer timeout fires.
        { user: { id: 'auth-1' }, getUserDeferred: pendingGetUser },
      ])

      const { result } = renderHook(() => useCurrentUser())

      // Loading starts true while we wait for getUser to resolve.
      expect(result.current.loading).toBe(true)

      // Advance past the fetch timeout. The hook must release loading without
      // ever receiving a response from getUser.
      await act(async () => {
        jest.advanceTimersByTime(FETCH_TIMEOUT_MS + 1000)
        await flushPendingPromises()
      })

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.usuario).toBeNull()
      expect(result.current.roles).toEqual([])
      expect(result.current.supportCapabilities).toEqual([])
      expect(result.current.platformSession).toBeNull()
      // Silent failure: don't alarm the user with a toast for a network stall.
      // The hook should clear state without setting an error.
      expect(result.current.error).toBeNull()
    } finally {
      jest.useRealTimers()
    }
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

  it('debounces rapid SIGNED_IN events to a single refetch', async () => {
    jest.useFakeTimers()
    try {
      const initialDeferred = createDeferred<GetUserResponse>()
      const user = { id: 'auth-1' }
      const usuario = { id: 'usuario-1', auth_id: 'auth-1', nombre: 'Staff User' }
      const { client, triggerAuthStateChange } = setupSupabaseClient([
        { user, usuario, roles: ['admin'], supportCapabilities: ['support.view'], getUserDeferred: initialDeferred },
        { user, usuario, roles: ['admin'], supportCapabilities: ['support.view'] },
      ])

      const { result } = renderHook(() => useCurrentUser())

      await act(async () => {
        initialDeferred.resolve(getUserResponse(user))
        await flushPendingPromises()
      })
      expect(result.current.loading).toBe(false)
      const getUserCallsAfterInitial = client.auth.getUser.mock.calls.length

      await act(async () => {
        triggerAuthStateChange('SIGNED_IN', AUTH_SESSION_PLACEHOLDER)
        triggerAuthStateChange('SIGNED_IN', AUTH_SESSION_PLACEHOLDER)
      })

      expect(client.auth.getUser).toHaveBeenCalledTimes(getUserCallsAfterInitial)

      await act(async () => {
        jest.advanceTimersByTime(SIGNED_IN_DEBOUNCE_MS + 100)
        await flushPendingPromises()
      })
      expect(result.current.loading).toBe(false)
      expect(client.auth.getUser).toHaveBeenCalledTimes(getUserCallsAfterInitial + 2)
    } finally {
      jest.useRealTimers()
    }
  })

  it('cancels pending SIGNED_IN debounce when SIGNED_OUT happens first', async () => {
    jest.useFakeTimers()
    try {
      const user = { id: 'auth-1' }
      const usuario = { id: 'usuario-1', auth_id: 'auth-1', nombre: 'Staff User' }
      const { client, triggerAuthStateChange } = setupSupabaseClient([
        { user, usuario, roles: ['admin'], supportCapabilities: ['support.view'] },
      ])

      const { result } = renderHook(() => useCurrentUser())
      await act(async () => {
        await flushPendingPromises()
      })
      expect(result.current.loading).toBe(false)
      const getUserCallsAfterInitial = client.auth.getUser.mock.calls.length

      await act(async () => {
        triggerAuthStateChange('SIGNED_IN', AUTH_SESSION_PLACEHOLDER)
        triggerAuthStateChange('SIGNED_OUT', null)
      })

      expect(result.current.loading).toBe(false)
      expect(result.current.usuario).toBeNull()
      expect(result.current.roles).toEqual([])
      expect(result.current.supportCapabilities).toEqual([])
      expect(result.current.platformSession).toBeNull()

      await act(async () => {
        jest.advanceTimersByTime(SIGNED_IN_DEBOUNCE_MS + 100)
        await flushPendingPromises()
      })
      expect(client.auth.getUser).toHaveBeenCalledTimes(getUserCallsAfterInitial)
    } finally {
      jest.useRealTimers()
    }
  })

  // Regression coverage for the 4R review of fix #257.
  // The previous GREEN commit (6187c53) wrapped loadCurrentUserData in a 5s
  // Promise.race, but four boundaries were left uncovered. These tests pin
  // the post-remediation behavior.

  it('times out when the cache-hit isCurrentAuthUser() hangs (R3 HIGH-1)', async () => {
    jest.useFakeTimers()
    try {
      // First render — seed the module-level cache with a fast path so the
      // second render takes the cache-hit branch at line 45.
      const seedDeferred = createDeferred<GetUserResponse>()
      const cachedUser = { id: 'auth-cached' }
      setupSupabaseClient([
        { user: cachedUser, roles: ['admin'], supportCapabilities: [], getUserDeferred: seedDeferred },
      ])
      const seed = renderHook(() => useCurrentUser())
      await act(async () => {
        seedDeferred.resolve(getUserResponse(cachedUser))
        await flushPendingPromises()
      })
      await waitFor(() => expect(seed.result.current.loading).toBe(false))
      seed.unmount()

      // Second render — cache is populated. The next setupSupabaseClient call
      // creates a fresh client; the first getUser queued is the one
      // isCurrentAuthUser will call on the cache-hit branch. Stalling it
      // reproduces the HIGH-1 bug.
      const stalledCacheCheck = createDeferred<GetUserResponse>()
      setupSupabaseClient([
        { user: null, cacheAuthUser: null, getUserDeferred: stalledCacheCheck },
      ])
      const { result } = renderHook(() => useCurrentUser())
      expect(result.current.loading).toBe(true)

      await act(async () => {
        jest.advanceTimersByTime(FETCH_TIMEOUT_MS + 1000)
        await flushPendingPromises()
      })

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.usuario).toBeNull()
      expect(result.current.error).toBeNull()

      // Resolve the stalled deferred so the test doesn't leak unhandled
      // rejection warnings — the cache check is irrelevant after the timeout.
      await act(async () => {
        stalledCacheCheck.resolve(getUserResponse(null))
        await flushPendingPromises()
      })
    } finally {
      jest.useRealTimers()
    }
  })

  it('does not populate currentUserCache when getUser resolves AFTER the timeout (R3 HIGH-2)', async () => {
    jest.useFakeTimers()
    try {
      const pendingGetUser = createDeferred<GetUserResponse>()
      const user = { id: 'auth-late' }
      const usuario = { id: 'usuario-late', auth_id: 'auth-late', nombre: 'Late User' }
      setupSupabaseClient([
        { user, usuario, roles: ['admin'], supportCapabilities: ['support.view'], getUserDeferred: pendingGetUser },
      ])
      const { result } = renderHook(() => useCurrentUser())

      // Advance past the timeout — the abandoned loadCurrentUserData is still
      // awaiting getUser.
      await act(async () => {
        jest.advanceTimersByTime(FETCH_TIMEOUT_MS + 100)
        await flushPendingPromises()
      })
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.usuario).toBeNull()

      // Late resolve. The work promise chain continues in the background; the
      // didTimeOut flag must prevent it from writing to currentUserCache.
      await act(async () => {
        pendingGetUser.resolve(getUserResponse(user))
        await flushPendingPromises()
      })

      // Inspect the module-level cache directly via the test-only reset
      // helper. If the cache was poisoned, this returns the stale entry; the
      // GREEN fix keeps it null.
      expect(__resetCurrentUserCacheForTesting()).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  it('returns user data when getUser resolves just under the timeout (R3 MEDIUM-3)', async () => {
    jest.useFakeTimers()
    try {
      const pendingGetUser = createDeferred<GetUserResponse>()
      const user = { id: 'auth-slow' }
      const usuario = { id: 'usuario-slow', auth_id: 'auth-slow', nombre: 'Slow User' }
      setupSupabaseClient([
        { user, usuario, roles: ['admin'], supportCapabilities: ['support.view'], getUserDeferred: pendingGetUser },
      ])
      const { result } = renderHook(() => useCurrentUser())

      // Advance 500ms before the timeout. The race timer has NOT fired yet.
      await act(async () => {
        jest.advanceTimersByTime(FETCH_TIMEOUT_MS - 500)
        await flushPendingPromises()
      })

      // Resolve just before the timeout — the work promise should win the race.
      await act(async () => {
        pendingGetUser.resolve(getUserResponse(user))
        await flushPendingPromises()
      })

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.usuario?.id).toBe('usuario-slow')
      expect(result.current.roles).toEqual(['admin'])
      expect(result.current.supportCapabilities).toEqual(['support.view'])

      // Advance past the timeout — should be a no-op now (timer was cleared).
      await act(async () => {
        jest.advanceTimersByTime(FETCH_TIMEOUT_MS + 1000)
        await flushPendingPromises()
      })
      expect(result.current.loading).toBe(false)
      expect(result.current.usuario?.id).toBe('usuario-slow')
    } finally {
      jest.useRealTimers()
    }
  })

  it('clears the timeout when getUser resolves well before the timeout (R3 HIGH-3)', async () => {
    jest.useFakeTimers()
    try {
      const pendingGetUser = createDeferred<GetUserResponse>()
      const user = { id: 'auth-fast' }
      const usuario = { id: 'usuario-fast', auth_id: 'auth-fast', nombre: 'Fast User' }
      const { client } = setupSupabaseClient([
        { user, usuario, roles: ['admin'], supportCapabilities: [], getUserDeferred: pendingGetUser },
      ])
      const { result } = renderHook(() => useCurrentUser())

      // Resolve well before the timeout — work promise wins, finally clears timer.
      await act(async () => {
        pendingGetUser.resolve(getUserResponse(user))
        jest.advanceTimersByTime(100)
        await flushPendingPromises()
      })

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.usuario?.id).toBe('usuario-fast')
      const getUserCallsAfterSettle = client.auth.getUser.mock.calls.length

      // Advance PAST the original timeout. If the timer wasn't cleared, the
      // setTimeout callback would still fire and (in the GREEN fix) emit a
      // Sentry breadcrumb. With proper cleanup, nothing observable changes.
      await act(async () => {
        jest.advanceTimersByTime(FETCH_TIMEOUT_MS + 1000)
        await flushPendingPromises()
      })
      expect(result.current.loading).toBe(false)
      expect(result.current.usuario?.id).toBe('usuario-fast')
      // No additional getUser calls should have been triggered by the timer.
      expect(client.auth.getUser).toHaveBeenCalledTimes(getUserCallsAfterSettle)
    } finally {
      jest.useRealTimers()
    }
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
