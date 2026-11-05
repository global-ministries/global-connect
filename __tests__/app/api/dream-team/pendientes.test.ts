/**
 * @jest-environment node
 *
 * GET /api/dream-team/pendientes (odd/tasks/dream-team-pendientes-director.md, T4):
 * the urgentes count of the menu badge, read by the client after mount so the
 * (auth) layout never waits for dream_team_pendientes_resumen(). Same gate as
 * the page; `urgentes: null` when the summary cannot be read.
 */
const isDreamTeamEnabled = jest.fn(() => true)
const requireDreamTeamSession = jest.fn()
const hasDreamTeamPendientesAccess = jest.fn(() => true)
jest.mock('@/lib/platform/dream-team/route-access', () => ({
  isDreamTeamEnabled: () => isDreamTeamEnabled(),
  requireDreamTeamSession: () => requireDreamTeamSession(),
  hasDreamTeamPendientesAccess: () => hasDreamTeamPendientesAccess(),
}))
let puedeRegistrar = false
jest.mock('@/lib/platform/dream-team/ficha-persona', () => ({
  puedeRegistrarParaNavegacion: async () => puedeRegistrar,
}))
const rpc = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc }) }))

import { GET } from '@/app/api/dream-team/pendientes/route'

beforeEach(() => {
  jest.clearAllMocks()
  isDreamTeamEnabled.mockReturnValue(true)
  requireDreamTeamSession.mockResolvedValue({ personaId: 'yo', globalRoles: [], capabilities: [] })
  hasDreamTeamPendientesAccess.mockReturnValue(true)
  puedeRegistrar = false
  rpc.mockResolvedValue({ data: [{ urgentes: 9, personas_total: 3 }], error: null })
})

describe('GET /api/dream-team/pendientes', () => {
  it('answers the urgentes of the caller', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ urgentes: 9 })
    expect(rpc).toHaveBeenCalledWith('dream_team_pendientes_resumen', undefined)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('answers null when the summary cannot be read', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000' } })
    expect(await (await GET()).json()).toEqual({ urgentes: null })
  })

  it('is 404 with Dream Team off and 401 without a session', async () => {
    isDreamTeamEnabled.mockReturnValue(false)
    expect((await GET()).status).toBe(404)
    isDreamTeamEnabled.mockReturnValue(true)
    requireDreamTeamSession.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })

  it('is 403 without team authority, unless the caller registers people', async () => {
    hasDreamTeamPendientesAccess.mockReturnValue(false)
    expect((await GET()).status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
    puedeRegistrar = true
    expect((await GET()).status).toBe(200)
  })
})
