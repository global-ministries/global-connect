export type PlatformNavigationFlags = { enabled: boolean; killSwitch?: boolean }

/**
 * Reads the platform navigation feature flags at call time.
 *
 * Values are read from `NEXT_PUBLIC_*` env vars when called, not inlined at
 * build time, so server and client callers see the runtime value.
 */
export function getPlatformNavigationFlags(): { enabled: boolean; killSwitch: boolean } {
  return {
    enabled: process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED === 'true',
    killSwitch: process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH === 'true',
  }
}
