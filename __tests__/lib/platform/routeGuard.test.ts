import { checkPlatformRouteAccess } from '@/lib/platform/routeGuard'
import { getPlatformNavigationFlags } from '@/lib/platform/flags'
import type { PlatformSession } from '@/lib/platform/session/types'

const basePlatformSession: PlatformSession = {
  personaId: 'persona-1',
  subjectAuthId: 'auth-1',
  globalRoles: ['admin'],
  contexts: [],
  capabilities: [],
}

const supportViewCapability: PlatformSession['capabilities'][number] = {
  key: 'support.view', experience: 'support', scopeType: 'experience', source: 'legacy',
}

const supportManageCapability: PlatformSession['capabilities'][number] = {
  key: 'support.manage', experience: 'support', scopeType: 'experience', source: 'legacy',
}

describe('getPlatformNavigationFlags', () => {
  const originalEnabled = process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
  const originalKillSwitch = process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH

  afterEach(() => {
    restoreEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED', originalEnabled)
    restoreEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH', originalKillSwitch)
  })

  it('reads the platform navigation feature flag and kill switch from runtime env', () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH = 'true'

    expect(getPlatformNavigationFlags()).toEqual({ enabled: true, killSwitch: true })
  })

  it('defaults both flags to false when env vars are absent or not exactly "true"', () => {
    delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
    delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH
    expect(getPlatformNavigationFlags()).toEqual({ enabled: false, killSwitch: false })

    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'TRUE'
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH = '1'
    expect(getPlatformNavigationFlags()).toEqual({ enabled: false, killSwitch: false })
  })
})

describe('checkPlatformRouteAccess', () => {
  it('allows access with reason when the feature flag is disabled to preserve pre-slice behavior', () => {
    const result = checkPlatformRouteAccess({
      flags: { enabled: false },
      platformSession: basePlatformSession,
      requiredCapability: 'support.manage',
    })

    expect(result).toEqual({ allowed: true, reason: 'feature_flag_disabled' })
  })

  it.each([
    ['kill switch is active', { enabled: true, killSwitch: true }, basePlatformSession, 'kill_switch_enabled'],
    ['no platformSession', { enabled: true }, null, 'platform_session_required'],
    ['empty capabilities', { enabled: true }, { ...basePlatformSession, capabilities: [] }, 'no_platform_grants'],
    ['missing capability', { enabled: true }, { ...basePlatformSession, capabilities: [supportViewCapability] }, 'missing_required_capability'],
  ] satisfies Array<[string, { enabled: boolean; killSwitch?: boolean }, PlatformSession | null, string]>)(
    'denies with reason when %s',
    (_label, flags, platformSession, reason) => {
      const result = checkPlatformRouteAccess({ flags, platformSession, requiredCapability: 'support.manage' })
      expect(result).toEqual({ allowed: false, reason })
    }
  )

  it('allows access when the required capability is present and exposes no reason', () => {
    const result = checkPlatformRouteAccess({
      flags: { enabled: true },
      platformSession: { ...basePlatformSession, capabilities: [supportViewCapability, supportManageCapability] },
      requiredCapability: 'support.manage',
    })

    expect(result).toStrictEqual({ allowed: true })
  })

  it.each(['', '   '])('allows access when the required capability is empty or whitespace', (requiredCapability) => {
    expect(checkPlatformRouteAccess({ flags: { enabled: true }, platformSession: basePlatformSession, requiredCapability })).toEqual({ allowed: true })
  })

})

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}
