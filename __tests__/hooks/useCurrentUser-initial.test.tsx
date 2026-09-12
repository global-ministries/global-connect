/**
 * CurrentUserProvider `initial` prop — server-resolved first paint.
 *
 * app/(auth)/layout.tsx and app/(pastoral)/layout.tsx resolve a
 * CurrentUserSnapshot on the server (lib/auth/currentUserSnapshot.ts) and
 * hand it down as `initial`. This must make the FIRST render already expose
 * roles/supportCapabilities/platformSession with loading === false — no
 * waiting for the mount effect — while the background fetch keeps running
 * as silent revalidation instead of flipping `loading` back to true (which
 * would undo the whole point: the sidebar would show gated items, then hide
 * them again for the duration of the revalidation).
 *
 * Every case that omits `initial` must behave exactly like before this
 * change — that is covered by the untouched existing suite in
 * __tests__/hooks/useCurrentUser.test.tsx and
 * __tests__/hooks/useCurrentUser-context.test.tsx.
 */

import { act, renderHook, waitFor } from '@testing-library/react'

import { useCurrentUser, CurrentUserProvider, __resetCurrentUserCacheForTesting, type CurrentUserResult } from '@/hooks/useCurrentUser'

const createClient = jest.fn()

jest.mock('@/lib/supabase/client', () => ({ createClient: () => createClient() }))
jest.mock('@sentry/nextjs', () => ({ addBreadcrumb: jest.fn() }))

type MockAuthUser = { id: string }
type GetUserResponse = { data: { user: MockAuthUser | null }; error: { message: string } | null }
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve']
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function getUserResponse(user: MockAuthUser | null): GetUserResponse {
  return { data: { user }, error: null }
}

async function flushPendingPromises() {
  for (let cycle = 0; cycle < 10; cycle += 1) {
    await Promise.resolve()
  }
}

const INITIAL_SNAPSHOT: CurrentUserResult = {
  authUserId: 'auth-1',
  usuario: { id: 'usuario-1', auth_id: 'auth-1', nombre: 'Staff User' } as CurrentUserResult['usuario'],
  roles: ['admin'],
  supportCapabilities: ['support.view'],
  platformSession: {
    personaId: 'usuario-1',
    subjectAuthId: 'auth-1',
    globalRoles: ['admin'],
    contexts: [],
    capabilities: [
      { key: 'dream_team.org.manage', experience: 'dream_team', scopeType: 'experience', source: 'manual' },
    ],
  },
}

/** A background fetch that never resolves — isolates "does the first render
 * already show the initial data" from anything the mount effect does. */
function setupHangingSupabaseClient() {
  const getUserDeferred = createDeferred<GetUserResponse>()
  const getUser = jest.fn().mockReturnValue(getUserDeferred.promise)
  const client = {
    auth: {
      getUser,
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: jest.fn(() => {
      throw new Error('Unexpected from() call before getUser() resolves')
    }),
    rpc: jest.fn(),
  }
  createClient.mockReturnValue(client)
  return { client, getUserDeferred }
}

describe('CurrentUserProvider with a server-resolved `initial` snapshot', () => {
  beforeEach(() => {
    createClient.mockReset()
  })

  afterEach(() => {
    __resetCurrentUserCacheForTesting()
    jest.restoreAllMocks()
  })

  it('exposes roles, support capabilities and the platform session on the first render, with loading already false', () => {
    setupHangingSupabaseClient()

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: ({ children }) => <CurrentUserProvider initial={INITIAL_SNAPSHOT}>{children}</CurrentUserProvider>,
    })

    // No `act(async …)`, no `waitFor` — the point of `initial` is that this
    // is already correct synchronously, before the mount effect's fetch
    // (deliberately left hanging above) could possibly have resolved.
    expect(result.current.loading).toBe(false)
    expect(result.current.authUserId).toBe('auth-1')
    expect(result.current.usuario).toEqual(INITIAL_SNAPSHOT.usuario)
    expect(result.current.roles).toEqual(['admin'])
    expect(result.current.supportCapabilities).toEqual(['support.view'])
    expect(result.current.platformSession).toEqual(INITIAL_SNAPSHOT.platformSession)
    expect(result.current.error).toBeNull()
  })

  it('keeps loading false when omitting `initial` is not the case (defaults still apply without it)', () => {
    // Sanity check for the flag itself: CurrentUserProvider with no
    // `initial` prop at all must start with loading === true, unchanged.
    setupHangingSupabaseClient()

    const { result } = renderHook(() => useCurrentUser(), { wrapper: CurrentUserProvider })

    expect(result.current.loading).toBe(true)
    expect(result.current.roles).toEqual([])
  })

  it('revalidates in the background without ever flashing loading back to true', async () => {
    const getUser = jest.fn()
    // getUser is called twice per successful load: once by loadCurrentUserData,
    // once by isCurrentAuthUser's cache-write check.
    getUser.mockResolvedValueOnce(getUserResponse({ id: 'auth-1' }))
    getUser.mockResolvedValueOnce(getUserResponse({ id: 'auth-1' }))
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { id: 'usuario-1', auth_id: 'auth-1', nombre: 'Refreshed Name' },
      error: null,
    })
    const rolesRpc = jest.fn().mockResolvedValue({ data: ['admin', 'lider'], error: null })
    const supportCapabilitiesResolver = jest.fn().mockResolvedValue({ data: [{ capability: 'support.view' }], error: null })
    const capabilityGrantsResolver = jest.fn().mockResolvedValue({ data: [], error: null })
    const client = {
      auth: {
        getUser,
        onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      },
      from: jest.fn((table: string) => {
        if (table === 'usuarios') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle }
        if (table === 'support_user_capabilities') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), is: supportCapabilitiesResolver }
        if (table === 'dream_team_capability_grants') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), is: capabilityGrantsResolver }
        throw new Error(`Unexpected table ${table}`)
      }),
      rpc: rolesRpc,
    }
    createClient.mockReturnValue(client)

    const loadingHistory: boolean[] = []
    const { result } = renderHook(
      () => {
        const value = useCurrentUser()
        loadingHistory.push(value.loading)
        return value
      },
      { wrapper: ({ children }) => <CurrentUserProvider initial={INITIAL_SNAPSHOT}>{children}</CurrentUserProvider> }
    )

    expect(result.current.loading).toBe(false)

    // Let the background revalidation run to completion.
    await act(async () => {
      await flushPendingPromises()
    })

    // The revalidation refreshed the data (new role picked up)...
    await waitFor(() => expect(result.current.roles).toEqual(['admin', 'lider']))
    expect(result.current.usuario?.nombre).toBe('Refreshed Name')
    // ...but `loading` never toggled to true at any point along the way.
    expect(loadingHistory.every((value) => value === false)).toBe(true)
  })
})

/**
 * A silent (initial-provided) revalidation must distinguish a genuine
 * auth failure from a data/RPC failure.
 *
 * A client-detected sign-out (auth.getUser() resolves with {user: null} and
 * NO error) already flows through `kind: 'ok'` with a signed-out payload and
 * correctly clears state — untouched by this fix.
 *
 * The gap this closes: supabase.auth.getUser() itself failing (e.g. an
 * invalidated/expired session returning a 401 AuthApiError) makes
 * loadCurrentUserData throw, which the silent branch used to swallow
 * unconditionally — the sidebar kept showing role-gated items from the SSR
 * snapshot until the next navigation. Middleware and RLS still gate real
 * access, so this was UI staleness, not an authorization bypass — but it
 * asserted something false. A data/RPC failure (not an auth failure) must
 * still degrade silently, preserving the good initial snapshot exactly as
 * a stalled network timeout does.
 */
describe('CurrentUserProvider silent revalidation: auth failure vs data failure', () => {
  beforeEach(() => {
    createClient.mockReset()
  })

  afterEach(() => {
    __resetCurrentUserCacheForTesting()
    jest.restoreAllMocks()
  })

  it('clears state on a silent run when auth.getUser() itself reports an error', async () => {
    const getUser = jest.fn().mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid_grant: refresh token revoked' },
    })
    const client = {
      auth: {
        getUser,
        onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      },
      from: jest.fn(() => {
        throw new Error('Unexpected from() call — auth.getUser() already failed')
      }),
      rpc: jest.fn(),
    }
    createClient.mockReturnValue(client)

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: ({ children }) => <CurrentUserProvider initial={INITIAL_SNAPSHOT}>{children}</CurrentUserProvider>,
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.usuario).toEqual(INITIAL_SNAPSHOT.usuario)

    await act(async () => {
      await flushPendingPromises()
    })

    // The session itself is no longer valid — the stale SSR snapshot must
    // not linger past this background revalidation.
    expect(result.current.authUserId).toBeNull()
    expect(result.current.usuario).toBeNull()
    expect(result.current.roles).toEqual([])
    expect(result.current.supportCapabilities).toEqual([])
    expect(result.current.platformSession).toBeNull()
    // Still silent: no user-facing toast for a background revalidation.
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('preserves state on a silent run when a data/RPC query fails, not auth.getUser() itself', async () => {
    const getUser = jest.fn().mockResolvedValue(getUserResponse({ id: 'auth-1' }))
    const maybeSingle = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'connection terminated' },
    })
    const client = {
      auth: {
        getUser,
        onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      },
      from: jest.fn((table: string) => {
        if (table === 'usuarios') return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle }
        throw new Error(`Unexpected table ${table}`)
      }),
      rpc: jest.fn(),
    }
    createClient.mockReturnValue(client)

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: ({ children }) => <CurrentUserProvider initial={INITIAL_SNAPSHOT}>{children}</CurrentUserProvider>,
    })

    await act(async () => {
      await flushPendingPromises()
    })

    // A data/RPC failure is not proof the session is invalid — the good
    // initial snapshot must survive, same reasoning as a stalled timeout.
    expect(result.current.authUserId).toBe('auth-1')
    expect(result.current.usuario).toEqual(INITIAL_SNAPSHOT.usuario)
    expect(result.current.roles).toEqual(INITIAL_SNAPSHOT.roles)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('surfaces an auth.getUser() failure through setError on a non-silent run, same as before this fix', async () => {
    // No `initial` — a normal, non-silent load. This pins that adding the
    // `auth_error` kind did not change the existing toast/setError path for
    // a real auth failure (also covered by the pre-existing test
    // "surfaces an auth error from loadCurrentUserData through setError" in
    // __tests__/hooks/useCurrentUser.test.tsx, kept untouched).
    const getUser = jest.fn().mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid_grant: refresh token revoked' },
    })
    createClient.mockReturnValue({
      auth: {
        getUser,
        onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      },
      from: jest.fn(),
      rpc: jest.fn(),
    })

    const { result } = renderHook(() => useCurrentUser(), { wrapper: CurrentUserProvider })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.usuario).toBeNull()
    expect(result.current.roles).toEqual([])
    expect(result.current.platformSession).toBeNull()
    expect(result.current.error).toMatch(/autenticaci/i)
  })
})
