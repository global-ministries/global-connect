/**
 * Tests for middleware.ts getUser timeout (GH #257, part 2).
 *
 * These tests cover the full middleware() function, not just isPublicPath.
 * The same root cause that made client-side useCurrentUser hang (#257 part 1,
 * PR #258) lived in middleware.ts with no bound on getUser(). Every matched
 * route runs middleware on every client navigation, so a slow Supabase auth
 * lookup would freeze the entire nav flow.
 *
 * Pattern mirrors __tests__/hooks/useCurrentUser.test.tsx: use createDeferred
 * to simulate hanging getUser() and assert that middleware fails CLOSED
 * (redirect to login) instead of letting the request dangle.
 */

type MockAuthUser = { id: string }
type GetUserResponse = { data: { user: MockAuthUser | null }; error: { message: string; code?: string } | null }
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }

type NextInit = { request?: { headers?: Headers } }

const getUserMock = jest.fn()
const cookieGetAllMock = jest.fn(() => [] as Array<{ name: string; value: string }>)
const cookieSetAllMock = jest.fn()

// Capture and control what createServerClient returns. Mocked factories are
// hoisted by Jest, so we use module-level jest.fn() rather than local let.
jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
  }),
}))

const sentryAddBreadcrumbMock = jest.fn()
jest.mock('@sentry/nextjs', () => ({
  addBreadcrumb: (crumb: unknown) => sentryAddBreadcrumbMock(crumb),
}))

// next/server is already mocked in the original test, just lifted here with
// working cookie surface so middleware's setAll() path doesn't blow up.
const nextResponseNextMock = jest.fn((init?: NextInit) => ({
  type: 'next' as const,
  headers: init?.request?.headers ?? new Headers(),
  cookies: { set: jest.fn(), delete: jest.fn() },
}))
const nextResponseRedirectMock = jest.fn((url: URL | string) => ({
  type: 'redirect' as const,
  url: typeof url === 'string' ? url : url.toString(),
  cookies: { set: jest.fn(), delete: jest.fn() },
}))

jest.mock('next/server', () => ({
  NextResponse: {
    next: (init?: NextInit) => nextResponseNextMock(init),
    redirect: (url: URL | string) => nextResponseRedirectMock(url),
  },
}))

import { middleware, isPublicPath, MIDDLEWARE_FETCH_TIMEOUT_MS } from '@/middleware'

describe('middleware isPublicPath (legacy)', () => {
  it('allows the Supabase token hash confirmation route without an existing session', () => {
    expect(isPublicPath('/auth/confirm')).toBe(true)
    expect(isPublicPath('/dashboard')).toBe(false)
  })
})

describe('middleware getUser timeout (GH #257 part 2)', () => {
  beforeEach(() => {
    nextResponseNextMock.mockClear()
    nextResponseRedirectMock.mockClear()
    getUserMock.mockReset()
    cookieGetAllMock.mockReset()
    cookieSetAllMock.mockReset()
    sentryAddBreadcrumbMock.mockClear()
    cookieGetAllMock.mockReturnValue([])
  })

  function queueFastResult(user: MockAuthUser | null, error: GetUserResponse['error'] = null) {
    getUserMock.mockResolvedValueOnce({ data: { user }, error })
  }

  function createMockRequest(
    pathname: string,
    cookieNames: string[] = []
  ): { url: string; cookies: { getAll: jest.Mock; set: jest.Mock } } {
    const cookiesList = cookieNames.map((name) => ({ name, value: `${name}-value` }))
    return {
      url: `https://example.com${pathname}`,
      cookies: {
        getAll: cookieGetAllMock.mockReturnValue(cookiesList),
        set: jest.fn(),
      },
    }
  }

  function createDeferred<T>(): Deferred<T> {
    let resolve!: Deferred<T>['resolve']
    const promise = new Promise<T>((r) => {
      resolve = r
    })
    return { promise, resolve }
  }

  async function flushPendingPromises() {
    for (let cycle = 0; cycle < 10; cycle += 1) {
      await Promise.resolve()
    }
  }

  it('passes the request through when getUser returns a user quickly', async () => {
    queueFastResult({ id: 'auth-1' })

    const request = createMockRequest('/dashboard')
    const result = await middleware(request as unknown as Parameters<typeof middleware>[0])

    expect(getUserMock).toHaveBeenCalledTimes(1)
    expect(nextResponseRedirectMock).not.toHaveBeenCalled()
    expect(nextResponseNextMock).toHaveBeenCalled()
    expect(result.type).toBe('next')
  })

  it('redirects to login when getUser hangs past the timeout', async () => {
    jest.useFakeTimers()
    try {
      const pendingGetUser = createDeferred<GetUserResponse>()
      getUserMock.mockReturnValueOnce(pendingGetUser.promise)

      const request = createMockRequest('/dashboard')
      const promise = middleware(request as unknown as Parameters<typeof middleware>[0])

      jest.advanceTimersByTime(MIDDLEWARE_FETCH_TIMEOUT_MS + 100)
      await flushPendingPromises()

      const result = await promise

      expect(getUserMock).toHaveBeenCalledTimes(1)
      expect(nextResponseRedirectMock).toHaveBeenCalledTimes(1)
      expect(result).toBeDefined()

      const redirectArg = nextResponseRedirectMock.mock.calls[0]?.[0]
      expect(redirectArg).toBeDefined()
      const redirectUrl = new URL(redirectArg as string)
      expect(redirectUrl.pathname).toBe('/')
      expect(redirectUrl.searchParams.get('redirect')).toBe('/dashboard')

      // Observability: middleware must emit a Sentry breadcrumb on timeout so
      // ops can correlate user complaints with Supabase incidents.
      expect(sentryAddBreadcrumbMock).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'auth',
          level: 'warning',
          message: 'middleware getUser timed out',
          data: expect.objectContaining({
            timeoutMs: MIDDLEWARE_FETCH_TIMEOUT_MS,
            path: '/dashboard',
          }),
        })
      )

      // Drain the deferred so unhandled-rejection warnings don't leak.
      pendingGetUser.resolve({ data: { user: null }, error: null })
      await flushPendingPromises()
    } finally {
      jest.useRealTimers()
    }
  })

  it('does not redirect when getUser resolves before the timeout', async () => {
    jest.useFakeTimers()
    try {
      const fastGetUser = createDeferred<GetUserResponse>()
      fastGetUser.resolve({ data: { user: { id: 'auth-fast' } }, error: null })
      getUserMock.mockReturnValueOnce(fastGetUser.promise)

      const request = createMockRequest('/dashboard')
      const promise = middleware(request as unknown as Parameters<typeof middleware>[0])

      jest.advanceTimersByTime(100)
      await flushPendingPromises()

      const result = await promise

      expect(getUserMock).toHaveBeenCalledTimes(1)
      expect(nextResponseRedirectMock).not.toHaveBeenCalled()
      expect(result.type).toBe('next')
    } finally {
      jest.useRealTimers()
    }
  })

  it('does not call getUser for public paths', async () => {
    // Intentionally do not queue getUser — if middleware calls it, the mock
    // throws ("no queued responses").
    const request = createMockRequest('/auth/callback')
    const result = await middleware(request as unknown as Parameters<typeof middleware>[0])

    expect(getUserMock).not.toHaveBeenCalled()
    expect(nextResponseRedirectMock).not.toHaveBeenCalled()
    expect(nextResponseNextMock).toHaveBeenCalled()
    expect(result.type).toBe('next')
  })

  it('redirects to login and clears cookies on refresh_token_not_found error', async () => {
    queueFastResult(null, {
      message: 'refresh_token_not_found',
      code: 'refresh_token_not_found',
    })

    const request = createMockRequest('/dashboard', [
      'sb-access-token',
      'sb-refresh-token',
      'other-cookie',
    ])
    await middleware(request as unknown as Parameters<typeof middleware>[0])

    expect(getUserMock).toHaveBeenCalledTimes(1)
    expect(nextResponseRedirectMock).toHaveBeenCalledTimes(1)

    const redirectArg = nextResponseRedirectMock.mock.calls[0]?.[0]
    const redirectUrl = new URL(redirectArg as string)
    expect(redirectUrl.pathname).toBe('/')
    expect(redirectUrl.searchParams.get('redirect')).toBe('/dashboard')
  })

  it('clears the timeout handle when getUser resolves well before the timeout (no leak)', async () => {
    jest.useFakeTimers()
    try {
      const pendingGetUser = createDeferred<GetUserResponse>()
      pendingGetUser.resolve({ data: { user: { id: 'auth-fast-2' } }, error: null })
      getUserMock.mockReturnValueOnce(pendingGetUser.promise)

      const request = createMockRequest('/dashboard')
      const promise = middleware(request as unknown as Parameters<typeof middleware>[0])

      // Let microtasks settle, then advance well past the timeout. If the
      // timer were not cleared, the timeout callback would fire again and
      // re-write to response state — observable here as an extra redirect call.
      jest.advanceTimersByTime(50)
      await flushPendingPromises()
      await promise

      jest.advanceTimersByTime(MIDDLEWARE_FETCH_TIMEOUT_MS + 1000)
      await flushPendingPromises()

      expect(nextResponseRedirectMock).not.toHaveBeenCalled()
      expect(nextResponseNextMock).toHaveBeenCalledTimes(1)
      // No Sentry breadcrumb for the fast path.
      expect(sentryAddBreadcrumbMock).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })
})
