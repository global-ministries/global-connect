/**
 * /dps (the root of the "DPS" menu section, odd/tasks/dps-asistencia-pco.md,
 * T9, L29; T10): planners open the plan, whoever passes attendance opens the
 * attendance, everyone else the plan (which decides who may see it). The
 * facts are dps_puede_ver / dps_puede_planificar and the session's
 * coordinate / direct grants.
 */
jest.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

const getUser = jest.fn()
let respuestas: Record<string, { data: unknown; error: unknown }> = {}
const rpc = jest.fn(async (nombre: string) => respuestas[nombre] ?? { data: null, error: null })
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }) }))

const isDreamTeamEnabled = jest.fn(() => true)
jest.mock('@/lib/platform/dream-team/route-access', () => ({ isDreamTeamEnabled: () => isDreamTeamEnabled() }))

let capacidades: { key: string }[] = []
const resolveReadOnlyPlatformSession = jest.fn(async () => ({
  personaId: 'p1',
  subjectAuthId: 'u1',
  globalRoles: [],
  contexts: [],
  capabilities: capacidades.map((c) => ({ ...c, experience: 'dream_team', scopeType: 'equipo', scopeId: 'e1', source: 'grant' })),
}))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  resolveReadOnlyPlatformSession: (...args: unknown[]) => resolveReadOnlyPlatformSession(...(args as [])),
  findPlatformSessionPersonaByAuthId: jest.fn(),
}))

import DpsPage from '@/app/(auth)/dps/page'

const acceso = (ver: boolean, planificar: boolean) => {
  respuestas = { dps_puede_ver: { data: ver, error: null }, dps_puede_planificar: { data: planificar, error: null } }
}

beforeEach(() => {
  jest.clearAllMocks()
  capacidades = []
  isDreamTeamEnabled.mockReturnValue(true)
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('/dps', () => {
  it('opens the plan for a planner', async () => {
    acceso(true, true)
    await expect(DpsPage()).rejects.toThrow('NEXT_REDIRECT:/dps/plan')
    expect(resolveReadOnlyPlatformSession).not.toHaveBeenCalled()
  })

  it('opens the attendance for a DPS coordinator or director', async () => {
    acceso(true, false)
    capacidades = [{ key: 'dream_team.coordinate' }]
    await expect(DpsPage()).rejects.toThrow('NEXT_REDIRECT:/dps/asistencia')
    capacidades = [{ key: 'dream_team.direct' }]
    await expect(DpsPage()).rejects.toThrow('NEXT_REDIRECT:/dps/asistencia')
  })

  it('opens the plan for a plain DPS servidor and for whoever does not see DPS', async () => {
    acceso(true, false)
    await expect(DpsPage()).rejects.toThrow('NEXT_REDIRECT:/dps/plan')
    acceso(false, false)
    capacidades = [{ key: 'dream_team.coordinate' }]
    await expect(DpsPage()).rejects.toThrow('NEXT_REDIRECT:/dps/plan')
  })

  it('asks to sign in without a session', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    await expect(DpsPage()).rejects.toThrow('NEXT_REDIRECT:/login')
  })
})
