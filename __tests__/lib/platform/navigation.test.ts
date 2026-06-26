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
    const result = await resolvePlatformNavigation({
      flags: { enabled: true, killSwitch: true },
      platformSession: baseSession,
    })

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
      { id: 'dps_team_service', label: 'DPS Música', href: '/dashboard/dps', experience: 'dps', scope: { type: 'equipo', id: 'musica' } },
      { id: 'grupos_vida_stage', label: 'Grupos de Vida — Adultos', href: '/dashboard/grupos-vida', experience: 'grupos_vida', scope: { type: 'etapa', id: 'segmento-adultos' } },
    ])
    expect(JSON.stringify(result)).not.toContain('auth-1')
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
    expect(deniedReasons(result)).toMatchObject({
      dps_team_service: 'grant_scope_missing',
      dps_admin: 'unknown_capability',
      nextgen_admin: 'unknown_capability',
      talleres_admin: 'unknown_capability',
      uno_a_uno_global: 'unknown_capability',
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
