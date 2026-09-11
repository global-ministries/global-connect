/**
 * Dream Team — client-safe navigation module.
 *
 * getDreamTeamNavItems() is what the desktop sidebar calls to decide whether
 * to render the "Dream Team" menu entry at all, and isDreamTeamEnabledClient()
 * is the browser-safe counterpart to isDreamTeamEnabled() (see route-access.ts)
 * — it must read the literal `process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED`
 * expression so Next.js can inline it into the client bundle (see the
 * docstring on isDreamTeamEnabledClient in navigation.ts).
 */

import { getDreamTeamNavItems, isDreamTeamEnabledClient, DREAM_TEAM_NAV_ITEMS } from '@/lib/platform/dream-team/navigation'
import { isDreamTeamEnabled } from '@/lib/platform/dream-team/route-access'
import type { PlatformSession, PlatformSessionCapability } from '@/lib/platform/session/types'

function makeSession(capabilities: PlatformSessionCapability[]): PlatformSession {
  return {
    personaId: 'persona-1',
    subjectAuthId: 'auth-1',
    globalRoles: [],
    contexts: [],
    capabilities,
  }
}

const serveCap: PlatformSessionCapability = {
  key: 'dream_team.serve',
  experience: 'dream_team',
  scopeType: 'equipo',
  scopeId: 'equipo-dps-camara',
  source: 'dream-team',
}
const directCap: PlatformSessionCapability = {
  key: 'dream_team.direct',
  experience: 'dream_team',
  scopeType: 'equipo',
  scopeId: 'equipo-dps-camara',
  source: 'dream-team',
}
const orgManageCap: PlatformSessionCapability = {
  key: 'dream_team.org.manage',
  experience: 'dream_team',
  scopeType: 'experience',
  source: 'manual',
}

const EXPECTED_HREFS = [
  '/dream-team/mi-equipo',
  '/admin/dream-team/servidores',
  '/admin/dream-team/estructura',
]

describe('getDreamTeamNavItems', () => {
  it('returns [] when the flag is disabled, regardless of the session', () => {
    expect(getDreamTeamNavItems(makeSession([orgManageCap]), false)).toEqual([])
  })

  it('returns [] with no session even when enabled', () => {
    expect(getDreamTeamNavItems(null, true)).toEqual([])
    expect(getDreamTeamNavItems(undefined, true)).toEqual([])
  })

  it('returns [] for a session with no Dream Team capability at all', () => {
    expect(getDreamTeamNavItems(makeSession([]), true)).toEqual([])
  })

  it('returns [] for a session holding only dream_team.serve — serve alone opens no page', () => {
    expect(getDreamTeamNavItems(makeSession([serveCap]), true)).toEqual([])
  })

  it('returns the three items for a session holding dream_team.direct scoped to an equipo', () => {
    const items = getDreamTeamNavItems(makeSession([directCap]), true)
    expect(items.map((item) => item.href).sort()).toEqual([...EXPECTED_HREFS].sort())
  })

  it('returns the three items for a session holding the global dream_team.org.manage', () => {
    const items = getDreamTeamNavItems(makeSession([orgManageCap]), true)
    expect(items.map((item) => item.href).sort()).toEqual([...EXPECTED_HREFS].sort())
  })

  it('DREAM_TEAM_NAV_ITEMS carries exactly the three expected screens', () => {
    expect(DREAM_TEAM_NAV_ITEMS.map((item) => item.href)).toEqual(EXPECTED_HREFS)
  })
})

describe('isDreamTeamEnabledClient parity with isDreamTeamEnabled', () => {
  const originalValue = process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED
    } else {
      process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = originalValue
    }
  })

  it.each(['true', 'on', 'false', undefined])('matches isDreamTeamEnabled(process.env) for %p', (value) => {
    if (value === undefined) {
      delete process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED
    } else {
      process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = value
    }

    expect(isDreamTeamEnabledClient()).toBe(isDreamTeamEnabled(process.env))
  })
})
