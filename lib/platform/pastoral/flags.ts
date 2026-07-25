/**
 * W01 — DT-003 — Pastoral feature flags.
 * Sibling to lib/platform/operating-core/flags.ts (D10).
 * Does NOT edit lib/platform/flags.ts (byte-identity preserved).
 */

export type PastoralRolloutStage = 'off' | 'admin-only' | 'internal' | 'public'

export interface PastoralFlags {
  readonly enabled: boolean
  readonly stage: PastoralRolloutStage
  readonly killSwitch: boolean
  readonly minAppVersion: string | null
}

/**
 * Tolerant boolean flag parser. Accepts the union of the two conventions
 * historically used across the codebase (`'on'` and `'true'`) plus other
 * common truthy literals. Returns false on undefined, 'off', 'false', '0',
 * or any other value not explicitly listed as truthy.
 *
 * Rationale: F4's handoff doc and several env templates use 'true' while
 * the original pastoral flag parser used 'on'. This caused the entire
 * `app/(pastoral)/**` route tree to redirect to '/' in staging.
 */
export function parseFlag(value: string | undefined | null): boolean {
  if (value == null) return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'on' || normalized === 'true' || normalized === '1' || normalized === 'yes'
}

/**
 * Reads the Pastoral feature flags at call time.
 *
 * Values are read from NEXT_PUBLIC_* env vars when called, not inlined at
 * build time, so server and client callers see the runtime value.
 */
export function getPastoralFlags(env: NodeJS.ProcessEnv = process.env): PastoralFlags {
  const enabled = parseFlag(env.NEXT_PUBLIC_PASTORAL_ENABLED)
  const stage = (env.NEXT_PUBLIC_PASTORAL_STAGE ?? 'off') as PastoralRolloutStage
  const killSwitch = parseFlag(env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH)
  const minAppVersion = env.NEXT_PUBLIC_PASTORAL_MIN_APP_VERSION ?? null

  const validStages: PastoralRolloutStage[] = ['off', 'admin-only', 'internal', 'public']
  const resolvedStage = validStages.includes(stage) ? stage : 'off'

  return {
    enabled,
    stage: resolvedStage,
    killSwitch,
    minAppVersion,
  }
}

/**
 * Returns true when pastoral features are enabled (flag on, stage not off, no killSwitch).
 */
export function isPastoralEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flags = getPastoralFlags(env)
  return flags.enabled && flags.stage !== 'off' && !flags.killSwitch
}

/**
 * Returns the current pastoral rollout stage.
 */
export function getPastoralStage(env: NodeJS.ProcessEnv = process.env): PastoralRolloutStage {
  const flags = getPastoralFlags(env)
  return flags.stage
}

/**
 * Returns true when pastoral is at the public stage gate (no killSwitch, stage = public).
 * Convenience for route-level gating decisions.
 */
export function getPastoralStageGate(env: NodeJS.ProcessEnv = process.env): boolean {
  const flags = getPastoralFlags(env)
  return flags.enabled && flags.stage === 'public' && !flags.killSwitch
}

/**
 * Returns true when pastoral metrics are accessible.
 * Metrics are visible when pastoral is enabled (stage != off, no killSwitch).
 * Unlike stageGate, metrics may be visible at internal stage as well.
 */
export function getPastoralMetricsGate(env: NodeJS.ProcessEnv = process.env): boolean {
  const flags = getPastoralFlags(env)
  return flags.enabled && flags.stage !== 'off' && !flags.killSwitch
}
