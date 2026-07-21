/**
 * Operating Core — per-subphase feature flags.
 *
 * Sibling to lib/platform/flags.ts (Fase 1 — READ-ONLY).
 * This module is NOT to be confused with lib/platform/flags.ts.
 *
 * Per-subphase flags control which Operating Core capabilities are enabled.
 * All flags default to "off" — no production rollout in this slice.
 */

export type OperatingCoreRolloutStage = 'off' | 'admin-only' | 'internal' | 'public'

export interface OperatingCoreFlags {
  readonly enabled: boolean
  readonly rolloutStage: OperatingCoreRolloutStage
  readonly killSwitch: boolean
  readonly minAppVersion: string | null
  readonly subphaseFlags: {
    readonly events: boolean
    readonly services: boolean
    readonly capacity: boolean
    readonly forms: boolean
    readonly resources: boolean
    readonly publicTokens: boolean
    readonly notifications: boolean
    readonly captureUx: boolean
    readonly dashboards: boolean
    readonly recurrent: boolean
  }
}

/**
 * Reads the Operating Core feature flags at call time.
 *
 * Values are read from NEXT_PUBLIC_* env vars when called, not inlined at
 * build time, so server and client callers see the runtime value.
 */
export function getOperatingCoreFlags(
  env: NodeJS.ProcessEnv = process.env,
): OperatingCoreFlags {
  const enabled = env.NEXT_PUBLIC_OPERATING_CORE_ENABLED === 'on'
  const stage = (env.NEXT_PUBLIC_OPERATING_CORE_STAGE ?? 'off') as OperatingCoreRolloutStage
  const killSwitch = env.NEXT_PUBLIC_OPERATING_CORE_KILL_SWITCH === 'on'
  const minAppVersion = env.NEXT_PUBLIC_OPERATING_CORE_MIN_APP_VERSION ?? null

  const validStages: OperatingCoreRolloutStage[] = [
    'off',
    'admin-only',
    'internal',
    'public',
  ]
  const rolloutStage = validStages.includes(stage) ? stage : 'off'

  return {
    enabled,
    rolloutStage,
    killSwitch,
    minAppVersion,
    subphaseFlags: {
      events: env.NEXT_PUBLIC_OPERATING_CORE_EVENTS === 'on',
      services: env.NEXT_PUBLIC_OPERATING_CORE_SERVICES === 'on',
      capacity: env.NEXT_PUBLIC_OPERATING_CORE_CAPACITY === 'on',
      forms: env.NEXT_PUBLIC_OPERATING_CORE_FORMS === 'on',
      resources: env.NEXT_PUBLIC_OPERATING_CORE_RESOURCES === 'on',
      publicTokens: env.NEXT_PUBLIC_OPERATING_CORE_PUBLIC_TOKENS === 'on',
      notifications: env.NEXT_PUBLIC_OPERATING_CORE_NOTIFICATIONS === 'on',
      captureUx: env.NEXT_PUBLIC_OPERATING_CORE_CAPTURE_UX === 'on',
      dashboards: env.NEXT_PUBLIC_OPERATING_CORE_DASHBOARDS === 'on',
      recurrent: env.NEXT_PUBLIC_OPERATING_CORE_RECURRENT === 'on',
    },
  }
}
