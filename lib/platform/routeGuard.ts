import { getPlatformNavigationFlags, type PlatformNavigationFlags } from '@/lib/platform/flags'
import type { PlatformSession } from '@/lib/platform/session/types'

export type PlatformRouteGuardReason =
  | 'feature_flag_disabled'
  | 'kill_switch_enabled'
  | 'platform_session_required'
  | 'no_platform_grants'
  | 'missing_required_capability'

export type PlatformRouteGuardResult =
  | { allowed: true }
  | { allowed: false; reason: PlatformRouteGuardReason }

export type PlatformRouteGuardInput = {
  platformSession: PlatformSession | null
  requiredCapability: string
  flags?: PlatformNavigationFlags | null
}

/**
 * Permission marker for Fase 1 platform routes.
 *
 * This helper answers whether the platform session has the required capability,
 * but it is intentionally not an enforcer. The caller owns the actual role check
 * and decides what to do with a denial. Strict denial is out of scope for
 * Fase 1 task 3.3; add Sentry capture at the deny branches when Fase 2 enables
 * hard-deny.
 */
export function checkPlatformRouteAccess(input: PlatformRouteGuardInput): PlatformRouteGuardResult {
  const flags = normalizeFlags(input.flags)

  if (!flags.enabled) return { allowed: false, reason: 'feature_flag_disabled' }
  if (flags.killSwitch) return { allowed: false, reason: 'kill_switch_enabled' }
  if (!input.platformSession) return { allowed: false, reason: 'platform_session_required' }
  if (input.requiredCapability.trim() === '') return { allowed: true }

  if (input.platformSession.capabilities.length === 0) {
    return { allowed: false, reason: 'no_platform_grants' }
  }

  const hasCapability = input.platformSession.capabilities.some(
    (capability) => capability.key === input.requiredCapability
  )

  if (!hasCapability) {
    return { allowed: false, reason: 'missing_required_capability' }
  }

  return { allowed: true }
}

function normalizeFlags(flags: PlatformNavigationFlags | null | undefined): { enabled: boolean; killSwitch: boolean } {
  if (!flags || typeof flags !== 'object') {
    const runtimeFlags = getPlatformNavigationFlags()
    return { enabled: runtimeFlags.enabled, killSwitch: runtimeFlags.killSwitch }
  }

  return {
    enabled: flags.enabled === true,
    killSwitch: flags.killSwitch === true,
  }
}
