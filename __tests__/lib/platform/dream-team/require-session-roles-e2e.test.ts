/**
 * The system roles reach the Mi equipo gate through the REAL resolver.
 *
 * require-session-capabilities.test.ts mocks resolveReadOnlyPlatformSession and
 * the page tests replace requireDreamTeamSession, so neither proves that a role
 * fetched by requireDreamTeamSession survives resolveReadOnlyPlatformSession /
 * buildPlatformSession and lands in session.globalRoles. This file runs the
 * real chain and mocks only the Supabase client (what the database would say):
 *
 *   auth.getUser -> usuarios persona lookup -> capability grants lookup
 *   -> rpc('obtener_roles_usuario')
 *
 * A Grupos de Vida director (system role, NO grants) must open Mi equipo and
 * must still fail the capability read gate that guards Servidores, Estructura
 * and every Dream Team API.
 */

type RpcResult = { data: unknown; error: unknown }

const getUser = jest.fn()
const rpc = jest.fn<Promise<RpcResult>, [string, Record<string, unknown>]>()
const grants = jest.fn<Promise<{ data: unknown[]; error: unknown }>, []>()

function makeClient() {
  return {
    auth: { getUser },
    rpc,
    from: (table: string) => {
      if (table === 'usuarios') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'persona-1', auth_id: 'auth-1' }, error: null }),
            }),
          }),
        }
      }
      if (table === 'dream_team_capability_grants') {
        return {
          select: () => {
            const filter = { eq: () => filter, is: () => grants() }
            return filter
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => makeClient(),
}))

import {
  hasDreamTeamMiEquipoAccess,
  hasDreamTeamReadCapability,
  hasDreamTeamWriteCapability,
  requireDreamTeamSession,
} from '@/lib/platform/dream-team/route-access'

describe('requireDreamTeamSession -> real resolver -> Mi equipo gate', () => {
  beforeEach(() => {
    getUser.mockReset()
    rpc.mockReset()
    grants.mockReset()
    getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null })
    grants.mockResolvedValue({ data: [], error: null })
    rpc.mockResolvedValue({ data: [{ nombre_interno: 'director-etapa' }], error: null })
  })

  it('carries the director role into the session and opens Mi equipo, read-only', async () => {
    const session = await requireDreamTeamSession({ includeRoles: true })

    expect(rpc).toHaveBeenCalledWith('obtener_roles_usuario', { p_auth_id: 'auth-1' })
    expect(session).not.toBeNull()
    expect(session!.personaId).toBe('persona-1')
    expect(session!.globalRoles).toContain('director-etapa')
    expect(session!.capabilities).toEqual([])
    expect(hasDreamTeamMiEquipoAccess(session!)).toBe(true)
    // No capability: Servidores, Estructura and the APIs stay closed, and nothing is editable.
    expect(hasDreamTeamReadCapability(session!)).toBe(false)
    expect(hasDreamTeamWriteCapability(session!)).toBe(false)
  })

  it('accepts roles returned as plain strings', async () => {
    rpc.mockResolvedValue({ data: ['director-general'], error: null })

    const session = await requireDreamTeamSession({ includeRoles: true })

    expect(session!.globalRoles).toEqual(['director-general'])
    expect(hasDreamTeamMiEquipoAccess(session!)).toBe(true)
  })

  it('has no roles, and no Mi equipo access, when the roles are not asked for', async () => {
    const session = await requireDreamTeamSession()

    expect(rpc).not.toHaveBeenCalled()
    expect(session).not.toBeNull()
    expect(session!.globalRoles).toEqual([])
    expect(hasDreamTeamMiEquipoAccess(session!)).toBe(false)
    expect(hasDreamTeamReadCapability(session!)).toBe(false)
  })

  it('still resolves the session, with no roles and no access, when the role lookup errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const session = await requireDreamTeamSession({ includeRoles: true })

    expect(session).not.toBeNull()
    expect(session!.globalRoles).toEqual([])
    expect(hasDreamTeamMiEquipoAccess(session!)).toBe(false)
  })

  it('does not turn a plain leader into a director', async () => {
    rpc.mockResolvedValue({ data: ['lider'], error: null })

    const session = await requireDreamTeamSession({ includeRoles: true })

    expect(session!.globalRoles).toEqual(['lider'])
    expect(hasDreamTeamMiEquipoAccess(session!)).toBe(false)
  })

  it('keeps a capability holder on the capability gate, with or without roles', async () => {
    grants.mockResolvedValue({
      data: [
        {
          capability_key: 'dream_team.org.manage',
          experience: 'dream_team',
          scope_type: 'experience',
          scope_id: null,
          source: 'manual',
          granted_at: '2026-01-01T00:00:00.000Z',
          revoked_at: null,
        },
      ],
      error: null,
    })
    rpc.mockResolvedValue({ data: [], error: null })

    const withRoles = await requireDreamTeamSession({ includeRoles: true })
    const withoutRoles = await requireDreamTeamSession()

    for (const session of [withRoles!, withoutRoles!]) {
      expect(hasDreamTeamReadCapability(session)).toBe(true)
      expect(hasDreamTeamWriteCapability(session)).toBe(true)
      expect(hasDreamTeamMiEquipoAccess(session)).toBe(true)
    }
  })

  it('returns null when there is no auth user (no roles are looked up)', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })

    await expect(requireDreamTeamSession({ includeRoles: true })).resolves.toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })
})
