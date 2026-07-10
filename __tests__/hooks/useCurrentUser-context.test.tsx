import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { useCurrentUser, CurrentUserProvider, __resetCurrentUserCacheForTesting } from '@/hooks/useCurrentUser'

const createClient = jest.fn()

jest.mock('@/lib/supabase/client', () => ({ createClient: () => createClient() }))

jest.mock('@sentry/nextjs', () => ({
  addBreadcrumb: () => {},
}))

type MockAuthUser = { id: string }
type GetUserResponse = { data: { user: MockAuthUser | null }; error: { message: string } | null }
type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}
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

function setupSupabaseClient(getUserDeferred?: Deferred<GetUserResponse>) {
  const getUser = jest.fn()
  if (getUserDeferred) {
    getUser.mockReturnValueOnce(getUserDeferred.promise)
  } else {
    getUser.mockResolvedValueOnce(getUserResponse({ id: 'auth-1' }))
  }
  getUser.mockResolvedValueOnce(getUserResponse({ id: 'auth-1' }))

  const maybeSingle = jest.fn().mockResolvedValue({
    data: { id: 'usuario-1', auth_id: 'auth-1', nombre: 'Staff User' },
    error: null,
  })
  const rolesRpc = jest.fn().mockResolvedValue({ data: ['admin'], error: null })
  const supportCapabilitiesResolver = jest.fn().mockResolvedValue({ data: [], error: null })

  const client = {
    auth: {
      getUser,
      onAuthStateChange: jest.fn(() => {
        return { data: { subscription: { unsubscribe: jest.fn() } } }
      }),
    },
    from: jest.fn((table: string) => {
      if (table === 'usuarios') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle,
        }
      }
      if (table === 'support_user_capabilities') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          is: supportCapabilitiesResolver,
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
    rpc: rolesRpc,
  }
  createClient.mockReturnValue(client)

  return { client }
}

describe('CurrentUserProvider singleton behavior', () => {
  beforeEach(() => {
    createClient.mockReset()
  })

  afterEach(() => {
    __resetCurrentUserCacheForTesting()
    jest.restoreAllMocks()
  })

  it('shares a single fetch across multiple useCurrentUser consumers in the same provider', async () => {
    const getUserDeferred = createDeferred<GetUserResponse>()
    const { client } = setupSupabaseClient(getUserDeferred)

    function Wrapper({ children }: { children: ReactNode }) {
      return <CurrentUserProvider>{children}</CurrentUserProvider>
    }

    function useTwoConsumers() {
      const first = useCurrentUser()
      const second = useCurrentUser()
      return { first, second }
    }

    const { result } = renderHook(() => useTwoConsumers(), { wrapper: Wrapper })

    expect(result.current.first.loading).toBe(true)
    expect(result.current.second.loading).toBe(true)

    await act(async () => {
      getUserDeferred.resolve(getUserResponse({ id: 'auth-1' }))
      await flushPendingPromises()
    })

    await waitFor(() => expect(result.current.first.loading).toBe(false))
    expect(result.current.second.loading).toBe(false)

    expect(result.current.first.usuario?.id).toBe('usuario-1')
    expect(result.current.second.usuario?.id).toBe('usuario-1')
    // Two getUser calls total: one from the shared loadCurrentUserData fetch
    // and one from the post-fetch isCurrentAuthUser cache validation.
    expect(client.auth.getUser).toHaveBeenCalledTimes(2)
  })

  it('throws a clear error when useCurrentUser is used outside CurrentUserProvider', () => {
    expect(() => renderHook(() => useCurrentUser())).toThrow(
      /useCurrentUser must be used within CurrentUserProvider/i
    )
  })

  it('registers exactly one onAuthStateChange listener per provider instance', async () => {
    const { client } = setupSupabaseClient()

    function Wrapper({ children }: { children: ReactNode }) {
      return <CurrentUserProvider>{children}</CurrentUserProvider>
    }

    const { unmount } = renderHook(() => useCurrentUser(), { wrapper: Wrapper })

    await waitFor(() => expect(client.auth.onAuthStateChange).toHaveBeenCalledTimes(1))

    const unsubscribe = client.auth.onAuthStateChange.mock.results[0].value.data.subscription.unsubscribe
    expect(unsubscribe).not.toHaveBeenCalled()

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
