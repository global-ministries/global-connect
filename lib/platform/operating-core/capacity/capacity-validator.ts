/**
 * S12 — Capacity pure validator.
 * Pure functions: validateOverride, computeEffectiveCapacity, diffForAlert.
 * No I/O, no side effects.
 */
import type {
  CapacityBase,
  CapacityOverride,
  CapacitySnapshot,
  CapacityValidationResult,
  CapacityAlert,
} from './capacity-types'

const MIN_REASON_LENGTH = 5

/**
 * Validate a capacity override against the baseline.
 * NEVER persists an override > base. Returns failure if invalid.
 */
export function validateOverride(
  base: CapacityBase,
  override: CapacityOverride | null,
): CapacityValidationResult {
  // Base must be positive
  if (base.value <= 0) {
    return {
      ok: false,
      error: 'base_must_be_positive',
      message: `capacity_base must be positive, got ${base.value}`,
    }
  }

  // If no override, nothing more to validate
  if (override === null) {
    return {
      ok: true,
      snapshot: {
        base,
        override: null,
        effective: base.value,
      },
    }
  }

  // Override value must be non-negative (0 is allowed — fully closed)
  if (override.value < 0) {
    return {
      ok: false,
      error: 'override_must_be_non_negative',
      message: `override value must be >= 0, got ${override.value}`,
    }
  }

  // Override must not exceed base
  if (override.value > base.value) {
    return {
      ok: false,
      error: 'override_exceeds_base',
      message: `override ${override.value} exceeds base ${base.value}`,
    }
  }

  // Reason must be at least MIN_REASON_LENGTH characters
  if (override.reason.length < MIN_REASON_LENGTH) {
    return {
      ok: false,
      error: 'reason_too_short',
      message: `override reason must be at least ${MIN_REASON_LENGTH} characters, got "${override.reason}"`,
    }
  }

  return {
    ok: true,
    snapshot: {
      base,
      override,
      effective: override.value,
    },
  }
}

/**
 * Compute effective capacity from a snapshot.
 * Pure: override.value ?? base.value.
 */
export function computeEffectiveCapacity(snapshot: CapacitySnapshot): number {
  return snapshot.override?.value ?? snapshot.base.value
}

/**
 * Compare two snapshots; return null if no alert needed, else the alert.
 *
 * Alert triggers:
 * - override went DOWN (override_lower_than_baseline): effective reduced AND new effective < base
 * - override REMOVED (override_removed): prev had override, next does not
 * - override ABOVE base attempted: rejected at validateOverride, never reaches here
 *
 * The alert is pure data; the caller (route/repository) decides when/how to emit.
 */
export function diffForAlert(
  prev: CapacitySnapshot,
  next: CapacitySnapshot,
  setByPersonaId: string,
  detectedAt: string,
): CapacityAlert | null {
  const prevEffective = prev.override?.value ?? prev.base.value
  const nextEffective = next.override?.value ?? next.base.value

  // Override was removed: prev had override, next doesn't
  if (prev.override !== null && next.override === null) {
    return {
      type: 'override_removed',
      scope: prev.base.scope,
      baseValue: prev.base.value,
      previousValue: prev.override.value,
      newValue: nextEffective,
      reason: '',
      setByPersonaId,
      detectedAt,
    }
  }

  // Effective went DOWN and is below base — alert for lowering
  if (
    nextEffective < prevEffective &&
    nextEffective < prev.base.value &&
    next.override !== null
  ) {
    return {
      type: 'override_lower_than_baseline',
      scope: prev.base.scope,
      baseValue: prev.base.value,
      previousValue: prevEffective,
      newValue: nextEffective,
      reason: next.override.reason,
      setByPersonaId,
      detectedAt,
    }
  }

  return null
}
