/**
 * S12 — Capacity domain types.
 * Pure TS — no DB, no routes.
 *
 * Extends S02 `OperatingCoreCapacityBase`/`OperatingCoreCapacityOverride`/
 * `OperatingCoreEffectiveCapacity` with override metadata + scope.
 */

export type CapacityScope = 'event' | 'service' | 'instance'

/** Pure domain base — eventInstanceId is the repository lookup key, not part of the domain type itself. */
export interface CapacityBase {
  value: number
  scope: CapacityScope
  effectiveAt: string
}

export interface CapacityOverride {
  value: number
  reason: string
  setByPersonaId: string
  setAt: string
}

export interface CapacitySnapshot {
  base: CapacityBase
  override: CapacityOverride | null
  effective: number
}

export type CapacityValidationError =
  | 'override_exceeds_base'
  | 'base_must_be_positive'
  | 'override_must_be_non_negative'
  | 'reason_too_short'

export interface CapacityValidationFailure {
  ok: false
  error: CapacityValidationError
  message: string
}

export interface CapacityValidationSuccess {
  ok: true
  snapshot: CapacitySnapshot
}

export type CapacityValidationResult = CapacityValidationSuccess | CapacityValidationFailure

export interface CapacityAlert {
  type: 'override_lower_than_baseline' | 'override_removed' | 'override_above_base'
  scope: CapacityScope
  baseValue: number
  previousValue: number
  newValue: number
  reason: string
  setByPersonaId: string
  detectedAt: string
}
