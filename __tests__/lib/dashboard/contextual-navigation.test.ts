import { resolveDashboardContextualAccess } from '@/lib/dashboard/contextual-navigation'
import type { PlatformNavigationFlags } from '@/lib/platform/navigation'
import type { PlatformSession } from '@/lib/platform/session/types'

const basePlatformSession: PlatformSession = {
  personaId: 'persona-1',
  subjectAuthId: 'auth-1',
  globalRoles: [],
  contexts: [],
  capabilities: [],
}

describe('dashboard contextual access', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('maps eligible GDV platform navigation to dashboard contextual shortcuts', async () => {
    const session = withCapabilities([
      { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
    ], [
      { experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' },
    ])

    const shortcuts = await resolveDashboardContextualAccess(session, { enabled: true })

    expect(shortcuts).toEqual([
      {
        id: 'dashboard-context-grupos_vida_stage-etapa-adultos',
        label: 'Grupos de Vida — Adultos',
        href: '/grupos-vida',
        description: 'Accede al espacio disponible para este contexto.',
      },
    ])
  })

  it('suppresses unavailable and unsafe global platform routes from dashboard shortcuts', async () => {
    const session = withCapabilities([
      { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
      { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' },
      { key: 'ninos.room.read', experience: 'ninos', scopeType: 'salon', scopeId: 'waumbaland', source: 'family' },
      { key: 'estudiantes.room.read', experience: 'estudiantes', scopeType: 'salon', scopeId: 'insideout', source: 'family' },
      { key: 'talleres_crecimiento.participation.read', experience: 'talleres_crecimiento', scopeType: 'taller', scopeId: 'de-hombre-a-hombre', source: 'ledger' },
      { key: 'dps.admin.manage', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'unsafe' },
      { key: 'nextgen.admin.manage', experience: 'nextgen', scopeType: 'experience', source: 'unsafe' },
      { key: 'talleres_crecimiento.admin.manage', experience: 'talleres_crecimiento', scopeType: 'taller', scopeId: 'global', source: 'unsafe' },
      { key: 'uno_a_uno.global.read', experience: 'the_living_room', scopeType: 'experience', source: 'unsafe' },
    ], [
      { experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' },
    ])

    const shortcuts = await resolveDashboardContextualAccess(session, { enabled: true })

    expect(shortcuts.map((shortcut) => shortcut.href)).toEqual(['/grupos-vida'])
    expect(shortcuts.map((shortcut) => shortcut.label)).toEqual(['Grupos de Vida — Adultos'])
  })

  it.each([
    ['feature flag is off', basePlatformSession, { enabled: false }],
    ['kill switch is active', basePlatformSession, { enabled: true, killSwitch: true }],
    ['platform session is missing', null, { enabled: true }],
    ['platform session is invalid', { ...basePlatformSession, personaId: ' ' }, { enabled: true }],
    ['no visible platform route is available', withCapabilities([
      { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' },
    ]), { enabled: true }],
  ] satisfies Array<[string, PlatformSession | null, PlatformNavigationFlags]>)('returns no dashboard shortcuts when the %s', async (_label, session, flags) => {
    const shortcuts = await resolveDashboardContextualAccess(session, flags)

    expect(shortcuts).toEqual([])
  })

  it('preserves the legacy dashboard when the platform resolver fails', async () => {
    const resolveNavigation = jest.fn().mockRejectedValue(new Error('resolver unavailable'))

    const shortcuts = await resolveDashboardContextualAccess(basePlatformSession, { enabled: true }, { resolveNavigation })

    expect(shortcuts).toEqual([])
    expect(resolveNavigation).toHaveBeenCalledTimes(1)
  })
})

function withCapabilities(capabilities: PlatformSession['capabilities'], contexts: PlatformSession['contexts'] = []): PlatformSession {
  return { ...basePlatformSession, contexts, capabilities }
}
