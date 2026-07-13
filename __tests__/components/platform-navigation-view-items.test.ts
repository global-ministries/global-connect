import { renderHook, waitFor } from '@testing-library/react'
import { UserCheck } from 'lucide-react'

import {
  resolvePlatformNavigationViewItems,
  usePlatformNavigationViewItems,
} from '@/components/ui/platform-navigation-view-items'
import type { PlatformSession } from '@/lib/platform/session/types'

const originalPlatformNavigationEnabled = process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED

const basePlatformSession: PlatformSession = {
  personaId: 'persona-1',
  subjectAuthId: 'auth-1',
  globalRoles: [],
  contexts: [],
  capabilities: [],
}

describe('platform navigation view items', () => {
  afterEach(() => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = originalPlatformNavigationEnabled
  })

  it('maps available platform navigation to reusable view items', async () => {
    const platformSession = withCapabilities([
      { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
    ], [
      { experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' },
    ])

    const items = await resolvePlatformNavigationViewItems(platformSession, { enabled: true })

    expect(items).toEqual([
      {
        id: 'platform-grupos_vida_stage-etapa-adultos',
        label: 'Grupos de Vida — Adultos',
        icon: UserCheck,
        href: '/grupos-vida',
      },
    ])
  })

  it('does not re-call resolvePlatformNavigationViewItems when the platformSession reference changes but data is the same', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    const platformSession = withCapabilities([
      { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
    ], [
      { experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' },
    ])
    const { result, rerender } = renderHook(
      ({ session }) => usePlatformNavigationViewItems(session),
      { initialProps: { session: platformSession } }
    )

    await waitFor(() => expect(result.current).toHaveLength(1))
    const resolvedItems = result.current

    rerender({ session: { ...platformSession } })

    await waitFor(() => expect(result.current).toBe(resolvedItems))
  })

  it.each([
    ['feature flag is off', { enabled: false }, basePlatformSession],
    ['kill switch is active', { enabled: true, killSwitch: true }, basePlatformSession],
    ['platform session is missing', { enabled: true }, null],
  ] satisfies Array<[string, { enabled: boolean; killSwitch?: boolean }, PlatformSession | null]>)('returns no view items when the %s', async (_label, flags, platformSession) => {
    const items = await resolvePlatformNavigationViewItems(platformSession, flags)

    expect(items).toEqual([])
  })
})

function withCapabilities(capabilities: PlatformSession['capabilities'], contexts: PlatformSession['contexts'] = []): PlatformSession {
  return { ...basePlatformSession, contexts, capabilities }
}
