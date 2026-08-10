/**
 * PR1 — DT-004 — Talleres feature flags.
 * Sibling to lib/platform/pastoral/flags.ts and lib/platform/operating-core/flags.ts.
 * Does NOT edit lib/platform/flags.ts or lib/platform/operating-core/flags.ts (byte-identity preserved).
 */

export type TalleresRolloutStage = 'off' | 'admin-only' | 'internal' | 'public'

export interface TalleresFlags {
  readonly enabled: boolean
  readonly stage: TalleresRolloutStage
  readonly killSwitch: boolean
  readonly minAppVersion: string | null
}

/**
 * Tolerant boolean flag parser. Accepts the union of the two conventions
 * historically used across the codebase (`'on'` and `'true'`) plus other
 * common truthy literals. Returns false on undefined, 'off', 'false', '0',
 * or any other value not explicitly listed as truthy.
 *
 * Rationale: F5's env templates use 'true' while other flags use 'on'.
 * This prevents the entire `app/(auth)/talleres/**` route tree from
 * redirecting to '/' in staging due to flag parser inconsistency.
 */
export function parseFlag(value: string | undefined | null): boolean {
  if (value == null) return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'on' || normalized === 'true' || normalized === '1' || normalized === 'yes'
}

/**
 * Reads the Talleres feature flags at call time.
 *
 * Values are read from NEXT_PUBLIC_* env vars when called, not inlined at
 * build time, so server and client callers see the runtime value.
 */
export function getTalleresFlags(env: NodeJS.ProcessEnv = process.env): TalleresFlags {
  const enabled = parseFlag(env.NEXT_PUBLIC_TALLERES_ENABLED)
  const stage = (env.NEXT_PUBLIC_TALLERES_STAGE ?? 'off') as TalleresRolloutStage
  const killSwitch = parseFlag(env.NEXT_PUBLIC_TALLERES_KILL_SWITCH)
  const minAppVersion = env.NEXT_PUBLIC_TALLERES_MIN_APP_VERSION ?? null

  const validStages: TalleresRolloutStage[] = ['off', 'admin-only', 'internal', 'public']
  const resolvedStage = validStages.includes(stage) ? stage : 'off'

  return {
    enabled,
    stage: resolvedStage,
    killSwitch,
    minAppVersion,
  }
}

/**
 * Returns true when talleres features are enabled (flag on, stage not off, no killSwitch).
 */
export function isTalleresEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flags = getTalleresFlags(env)
  return flags.enabled && flags.stage !== 'off' && !flags.killSwitch
}

/**
 * Returns the current talleres rollout stage.
 */
export function getTalleresStage(env: NodeJS.ProcessEnv = process.env): TalleresRolloutStage {
  const flags = getTalleresFlags(env)
  return flags.stage
}

/**
 * Returns true when talleres is at the public stage gate (no killSwitch, stage = public).
 * Convenience for route-level gating decisions.
 */
export function getTalleresStageGate(env: NodeJS.ProcessEnv = process.env): boolean {
  const flags = getTalleresFlags(env)
  return flags.enabled && flags.stage === 'public' && !flags.killSwitch
}
