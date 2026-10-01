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
  normalizeLegacyRoles: jest.requireActual('@/lib/auth/platformSessionReadOnly').normalizeLegacyRoles,
}))

const getUser = jest.fn()
const rpc = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))

import { requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'

describe('requireDreamTeamSession capability loading', () => {
  beforeEach(() => {
    resolveReadOnlyPlatformSession.mockReset()
    getUser.mockReset()
    rpc.mockReset()
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

/**
 * Mi equipo opens for a Grupos de Vida director by SYSTEM ROLE, and the server
 * session carries no roles unless they are asked for (the client session gets
 * them from useCurrentUser). Only the page that needs them asks: every other
 * caller (19 pages and APIs, all gated on capabilities) must not pay an extra
 * round trip nor see its session change.
 */
describe('requireDreamTeamSession role loading', () => {
  beforeEach(() => {
    resolveReadOnlyPlatformSession.mockReset()
    getUser.mockReset()
    rpc.mockReset()
    getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null })
    resolveReadOnlyPlatformSession.mockResolvedValue({
      personaId: 'persona-1',
      subjectAuthId: 'auth-1',
      globalRoles: [],
      contexts: [],
      capabilities: [],
    })
  })

  it('does not look roles up by default (no extra round trip for the other callers)', async () => {
    await requireDreamTeamSession()

    expect(rpc).not.toHaveBeenCalled()
    expect(resolveReadOnlyPlatformSession.mock.calls[0][0].globalRoles).toBeUndefined()
  })

  it('looks the roles of the auth user up and hands them to the session when asked', async () => {
    rpc.mockResolvedValue({ data: [{ nombre_interno: 'director-etapa' }, 'lider'], error: null })

    await requireDreamTeamSession({ includeRoles: true })

    expect(rpc).toHaveBeenCalledWith('obtener_roles_usuario', { p_auth_id: 'auth-1' })
    expect(resolveReadOnlyPlatformSession.mock.calls[0][0].globalRoles).toEqual(['director-etapa', 'lider'])
  })

  it('still builds the session, with no roles, when the role lookup fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })

    await requireDreamTeamSession({ includeRoles: true })

    expect(resolveReadOnlyPlatformSession.mock.calls[0][0].globalRoles).toEqual([])
  })

  it('keeps loading capabilities when roles are asked for', async () => {
    rpc.mockResolvedValue({ data: [], error: null })

    await requireDreamTeamSession({ includeRoles: true })

    const input = resolveReadOnlyPlatformSession.mock.calls[0][0]
    expect(input.capabilitySupabase !== undefined || input.capabilityLookup !== undefined).toBe(true)
  })
})
