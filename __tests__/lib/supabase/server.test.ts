/**
 * lib/supabase/server.ts — createSupabaseServerClientOrNull.
 *
 * app/(auth)/layout.tsx renders for every authenticated page. Before the
 * SSR current-user snapshot was added, createSupabaseServerClient() lived
 * inside resolveBranding's own try/catch, so a construction failure (a
 * missing cookies() context, misconfigured env) degraded to default
 * branding and the page still rendered. That call became bare at the top
 * of the layout, so a failure there would now crash the whole (auth) route
 * group instead of degrading.
 *
 * createSupabaseServerClientOrNull restores that guarantee as a small,
 * independently testable seam — the layout itself is not unit-tested in
 * this repo — used by app/(auth)/layout.tsx so the layout keeps rendering
 * (default branding, no `initial` snapshot — CurrentUserProvider falls
 * back to its normal client-side load) even if client construction throws.
 */

const cookiesMock = jest.fn()
jest.mock('next/headers', () => ({ cookies: () => cookiesMock() }))

const createServerClientMock = jest.fn()
jest.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}))

import { createSupabaseServerClientOrNull } from '@/lib/supabase/server'

describe('createSupabaseServerClientOrNull', () => {
  beforeEach(() => {
    cookiesMock.mockReset()
    createServerClientMock.mockReset()
  })

  it('returns the real client when construction succeeds', async () => {
    cookiesMock.mockResolvedValue({ getAll: jest.fn(() => []), set: jest.fn() })
    const fakeClient = { auth: {}, from: jest.fn() }
    createServerClientMock.mockReturnValue(fakeClient)

    const client = await createSupabaseServerClientOrNull()

    expect(client).toBe(fakeClient)
  })

  it('returns null instead of throwing when cookies() rejects', async () => {
    cookiesMock.mockRejectedValue(new Error('no request context'))

    await expect(createSupabaseServerClientOrNull()).resolves.toBeNull()
  })

  it('returns null instead of throwing when createServerClient itself throws', async () => {
    cookiesMock.mockResolvedValue({ getAll: jest.fn(() => []), set: jest.fn() })
    createServerClientMock.mockImplementation(() => {
      throw new Error('bad config — missing NEXT_PUBLIC_SUPABASE_URL')
    })

    await expect(createSupabaseServerClientOrNull()).resolves.toBeNull()
  })
})
