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

export interface DreamTeamFlags {
  readonly enabled: boolean
  readonly rolloutStage: 'off' | 'admin-only' | 'internal' | 'public'
  readonly minVersion: string | null
}

/**
 * Reads the Dream Team feature flags at call time.
 *
 * Values are read from `NEXT_PUBLIC_*` env vars when called, not inlined at
 * build time, so server and client callers see the runtime value.
 */
export function getDreamTeamFlags(env: NodeJS.ProcessEnv = process.env): DreamTeamFlags {
  const enabled = env.NEXT_PUBLIC_DREAM_TEAM_ENABLED === 'true'
  const stage = (env.NEXT_PUBLIC_DREAM_TEAM_STAGE ?? 'off') as DreamTeamFlags['rolloutStage']
  const minVersion = env.NEXT_PUBLIC_DREAM_TEAM_MIN_VERSION ?? null
  return {
    enabled,
    rolloutStage: ['off', 'admin-only', 'internal', 'public'].includes(stage) ? stage : 'off',
    minVersion,
  }
}
