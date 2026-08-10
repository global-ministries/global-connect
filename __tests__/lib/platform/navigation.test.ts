import {
  PLATFORM_NAVIGATION_FLOW,
  resolvePlatformNavigation,
} from '@/lib/platform/navigation'
import type { PlatformNavigationAdapter, PlatformNavigationResolution } from '@/lib/platform/navigation'
import type { PlatformSession } from '@/lib/platform/session/types'

const baseSession: PlatformSession = {
  personaId: 'persona-1',
  subjectAuthId: 'auth-1',
  globalRoles: ['admin'],
  contexts: [],
  capabilities: [],
}

describe('Platform navigation resolver', () => {
  it('uses legacy fallback and denies platform entries when the feature flag is off', async () => {
    const adapter = jest.fn<ReturnType<PlatformNavigationAdapter>, Parameters<PlatformNavigationAdapter>>()

    const result = await resolvePlatformNavigation({
      flags: { enabled: false },
      platformSession: baseSession,
      adapters: [adapter],
    })

    expect(adapter).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      mode: 'legacy_fallback',
      legacyFallback: true,
      visibleItems: [],
      audit: { decision: 'denied', reason: 'feature_flag_disabled', flow: PLATFORM_NAVIGATION_FLOW },
    })
    expect(result.deniedItems.map((item) => item.id)).toContain('dps_admin')
  })

  it('uses legacy fallback and denies platform entries when the kill switch is enabled', async () => {
    const adapter = jest.fn<ReturnType<PlatformNavigationAdapter>, Parameters<PlatformNavigationAdapter>>()
      .mockRejectedValue(new Error('adapter must be skipped while kill switch is active'))

    const result = await resolvePlatformNavigation({
      flags: { enabled: true, killSwitch: true },
      platformSession: baseSession,
      adapters: [adapter],
    })

    expect(adapter).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      mode: 'legacy_fallback',
      legacyFallback: true,
      visibleItems: [],
      audit: { decision: 'denied', reason: 'kill_switch_enabled' },
    })
  })

  it('resolves scoped navigation from client-safe platformSession and adapter contributions', async () => {
    const gdvAdapter: PlatformNavigationAdapter = jest.fn().mockResolvedValue({
      ok: true,
      contexts: [{ experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'segmento-adultos', label: 'Grupos de Vida — Adultos' }],
      capabilities: [{ key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'segmento-adultos', source: 'gdv:director_etapa' }],
    })
    const session: PlatformSession = {
      ...baseSession,
      capabilities: [{ key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' }],
    }

    const result = await resolvePlatformNavigation({
      flags: { enabled: true },
      platformSession: session,
      adapters: [gdvAdapter],
    })

    expect(gdvAdapter).toHaveBeenCalledWith(baseSessionShape(session))
    expect(result).toMatchObject({ mode: 'platform', legacyFallback: false, audit: { decision: 'allowed', flow: PLATFORM_NAVIGATION_FLOW } })
    expect(result.visibleItems).toEqual([
      { id: 'grupos_vida_stage', label: 'Grupos de Vida — Adultos', href: '/grupos-vida', experience: 'grupos_vida', scope: { type: 'etapa', id: 'segmento-adultos' } },
    ])
    expect(deniedReasons(result)).toMatchObject({ dps_team_service: 'route_unavailable' })
    expect(JSON.stringify(result)).not.toContain('auth-1')
  })

  it('suppresses scoped navigation items when their routes are not available locally', async () => {
    const session: PlatformSession = {
      ...baseSession,
      contexts: [
        { experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' },
      ],
      capabilities: [
        { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
        { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' },
        { key: 'ninos.room.read', experience: 'ninos', scopeType: 'salon', scopeId: 'waumbaland', source: 'family' },
        { key: 'estudiantes.room.read', experience: 'estudiantes', scopeType: 'salon', scopeId: 'insideout', source: 'family' },
        { key: 'talleres_crecimiento.participation.read', experience: 'talleres_crecimiento', scopeType: 'taller', scopeId: 'de-hombre-a-hombre', source: 'ledger' },
      ],
    }

    const result = await resolvePlatformNavigation({ flags: { enabled: true }, platformSession: session })

    expect(result.visibleItems.map((item) => item.href)).toEqual(['/grupos-vida'])
    expect(result.visibleItems.map((item) => item.label)).toEqual(['Grupos de Vida — Adultos'])
    expect(deniedReasons(result)).toMatchObject({
      dps_team_service: 'route_unavailable',
      ninos_room_context: 'route_unavailable',
      estudiantes_room_context: 'route_unavailable',
      talleres_participation: 'route_unavailable',
    })
  })

  it('denies known capability keys when the capability scope conflicts with its catalog definition', async () => {
    const session: PlatformSession = {
      ...baseSession,
      capabilities: [{ key: 'dps.team.serve', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'wrong-scope' }],
    }

    const result = await resolvePlatformNavigation({ flags: { enabled: true }, platformSession: session })

    expect(result.visibleItems).toEqual([])
    expect(deniedReasons(result)).toMatchObject({ dps_team_service: 'conflicting_scope' })
  })

  it.each([
    ['missing platformSession', null, undefined, 'platform_session_required'],
    ['adapter denied result', baseSession, jest.fn().mockResolvedValue({ ok: false, reason: 'adapter_read_failed' }), 'adapter_failed'],
    ['adapter rejection', baseSession, jest.fn().mockRejectedValue(new Error('adapter timeout')), 'adapter_failed'],
  ] satisfies Array<[string, PlatformSession | null, PlatformNavigationAdapter | undefined, string]>)('uses legacy fallback for %s', async (_label, platformSession, adapter, reason) => {
    const result = await resolvePlatformNavigation({
      flags: { enabled: true },
      platformSession,
      adapters: adapter ? [adapter] : [],
    })

    expect(result).toMatchObject({
      mode: 'legacy_fallback',
      legacyFallback: true,
      visibleItems: [],
      audit: { decision: 'denied', reason },
    })
    expect(result.deniedItems.every((item) => item.reason === reason)).toBe(true)
  })

  it('does not expose global access without explicit allowlisted scope', async () => {
    const session: PlatformSession = {
      ...baseSession,
      capabilities: [
        { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', source: 'dream-team' },
        { key: 'dps.admin.manage', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'unsafe' },
        { key: 'uno_a_uno.global.read', experience: 'the_living_room', scopeType: 'experience', source: 'unsafe' },
      ],
    }

    const result = await resolvePlatformNavigation({ flags: { enabled: true }, platformSession: session })

    expect(result.visibleItems).toEqual([])
    // NOTE: `talleres_admin` resolves to `missing_required_capability` (not
    // `unknown_capability`) as of PR3 — Fase 5 closed the pre-existing
    // `admin.manage` gap by registering `talleres_crecimiento.admin.manage`
    // in PLATFORM_CAPABILITIES (lib/platform/experiences.ts, DT-009/DT-010).
    // The user in this test simply has no grant for the (now-recognized) key.
    expect(deniedReasons(result)).toMatchObject({
      dps_team_service: 'grant_scope_missing',
      dps_admin: 'unknown_capability',
      nextgen_admin: 'unknown_capability',
      talleres_admin: 'missing_required_capability',
      uno_a_uno_global: 'unknown_capability',
    })
  })

  describe('pastoral navigation items', () => {
    it('shows pastor dashboard, crisis, lecturas and admin usuarios when pastoral.read.all and pastoral.admin.manage are present', async () => {
      const session: PlatformSession = {
        ...baseSession,
        capabilities: [
          { key: 'pastoral.read.all', experience: 'pastoral', scopeType: 'experience', source: 'pastoral' },
          { key: 'pastoral.admin.manage', experience: 'pastoral', scopeType: 'experience', source: 'pastoral' },
        ],
      }

      const result = await resolvePlatformNavigation({ flags: { enabled: true }, platformSession: session })

      const itemsById = Object.fromEntries(result.visibleItems.map((item) => [item.id, item]))
      expect(itemsById.pastor_dashboard).toMatchObject({ label: 'Sesiones 1:1', href: '/pastor', experience: 'pastoral' })
      expect(itemsById.pastor_usuarios).toMatchObject({ label: 'Gestión de Usuarios', href: '/pastor/usuarios', experience: 'pastoral' })
      expect(itemsById.pastor_crisis).toMatchObject({ label: 'Alertas de Crisis', href: '/pastor/crisis', experience: 'pastoral' })
      expect(itemsById.pastor_lecturas).toMatchObject({ label: 'Lecturas Pastorales', href: '/pastor/lecturas', experience: 'pastoral' })
      expect(itemsById.lider_dashboard).toBeUndefined()
      expect(itemsById.lider_uno_a_uno).toBeUndefined()
      expect(itemsById.lider_triada).toBeUndefined()
      expect(itemsById.asistido_roadmap).toBeUndefined()
    })

    it('does not show pastor admin usuarios when only pastoral.read.all is granted', async () => {
      const session: PlatformSession = {
        ...baseSession,
        capabilities: [
          { key: 'pastoral.read.all', experience: 'pastoral', scopeType: 'experience', source: 'pastoral' },
        ],
      }

      const result = await resolvePlatformNavigation({ flags: { enabled: true }, platformSession: session })

      const visibleIds = result.visibleItems.map((item) => item.id)
      expect(visibleIds).toContain('pastor_dashboard')
      expect(visibleIds).toContain('pastor_crisis')
      expect(visibleIds).toContain('pastor_lecturas')
      expect(visibleIds).not.toContain('pastor_usuarios')
    })

    it('shows leader dashboard when pastoral.one_on_one.create is granted', async () => {
      const session: PlatformSession = {
        ...baseSession,
        capabilities: [
          { key: 'pastoral.one_on_one.create', experience: 'pastoral', scopeType: 'one_on_one', scopeId: 'gdv-adultos', source: 'pastoral' },
        ],
      }

      const result = await resolvePlatformNavigation({ flags: { enabled: true }, platformSession: session })

      const visibleIds = result.visibleItems.map((item) => item.id)
      expect(visibleIds).toContain('lider_dashboard')
    })

    it('shows leader uno-a-uno and triada entries per scoped capability', async () => {
      const session: PlatformSession = {
        ...baseSession,
        capabilities: [
          { key: 'pastoral.one_on_one.read', experience: 'pastoral', scopeType: 'one_on_one', scopeId: 'gdv-adultos', source: 'pastoral' },
          { key: 'pastoral.triada.read', experience: 'pastoral', scopeType: 'triada', scopeId: 'triada-norte', source: 'pastoral' },
        ],
      }

      const result = await resolvePlatformNavigation({ flags: { enabled: true }, platformSession: session })

      const itemsById = Object.fromEntries(result.visibleItems.map((item) => [item.id, item]))
      expect(itemsById.lider_uno_a_uno).toMatchObject({ href: '/lider/uno-a-uno', experience: 'pastoral' })
      expect(itemsById.lider_triada).toMatchObject({ href: '/lider/triada', experience: 'pastoral' })
      expect(itemsById.asistido_roadmap).toMatchObject({ href: '/asistido', experience: 'pastoral' })
    })

    it('does not show any pastoral items when no pastoral capability is granted', async () => {
      const session: PlatformSession = {
        ...baseSession,
        capabilities: [
          { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' },
        ],
      }

      const result = await resolvePlatformNavigation({ flags: { enabled: true }, platformSession: session })

      const pastoralIds = result.visibleItems.filter((item) => item.experience === 'pastoral').map((item) => item.id)
      expect(pastoralIds).toEqual([])
    })
  })
})

function deniedReasons(result: PlatformNavigationResolution): Record<string, string> {
  return Object.fromEntries(result.deniedItems.map((item) => [item.id, item.reason]))
}

function baseSessionShape(session: PlatformSession) {
  return {
    personaId: session.personaId,
    subjectAuthId: session.subjectAuthId,
    globalRoles: session.globalRoles,
    contexts: session.contexts,
    capabilities: session.capabilities,
  }
}
