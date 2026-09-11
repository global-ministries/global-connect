/**
 * requireDreamTeamSession must load capabilities — regression.
 *
 * resolveReadOnlyPlatformSession only looks capabilities up when it is handed a
 * way to do it:
 *
 *   const capabilityLookup =
 *     input.capabilityLookup ?? (input.capabilitySupabase ? { ... } : undefined)
 *
 * Pass neither and the session comes back with an EMPTY capabilities array —
 * not an error, just silently empty. requireDreamTeamSession passed neither, so
 * every Dream Team gate downstream (hasDreamTeamReadCapability,
 * hasDreamTeamWriteCapability) saw no capabilities and denied, no matter what
 * the database actually held. The three screens rendered notFound() for a user
 * whose grant was present and correctly scoped.
 *
 * This is why it was invisible: the failure mode of a missing lookup is an
 * empty list, which reads exactly like "this person has no permissions".
 */

const resolveReadOnlyPlatformSession = jest.fn()

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  resolveReadOnlyPlatformSession: (...args: unknown[]) =>
    resolveReadOnlyPlatformSession(...args),
  findPlatformSessionPersonaByAuthId: jest.fn(),
}))

const getUser = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}))

import { requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'

describe('requireDreamTeamSession capability loading', () => {
  beforeEach(() => {
    resolveReadOnlyPlatformSession.mockReset()
    getUser.mockReset()
    getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null })
    resolveReadOnlyPlatformSession.mockResolvedValue({
      personaId: 'persona-1',
      subjectAuthId: 'auth-1',
      globalRoles: [],
      contexts: [],
      capabilities: [],
    })
  })

  it('hands resolveReadOnlyPlatformSession a way to look capabilities up', async () => {
    await requireDreamTeamSession()

    expect(resolveReadOnlyPlatformSession).toHaveBeenCalledTimes(1)
    const input = resolveReadOnlyPlatformSession.mock.calls[0][0]

    // Either seam is acceptable; what must never happen is passing neither,
    // because that yields a session with an empty capabilities array.
    const canLookUpCapabilities =
      input.capabilitySupabase !== undefined || input.capabilityLookup !== undefined

    expect(canLookUpCapabilities).toBe(true)
  })

  it('returns null when there is no auth user', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })

    await expect(requireDreamTeamSession()).resolves.toBeNull()
    expect(resolveReadOnlyPlatformSession).not.toHaveBeenCalled()
  })
})
