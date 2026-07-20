/**
 * S12 TDD RED — capacity validator pure functions.
 * Tests cover:
 * - reject override > base
 * - accept override <= base
 * - accept null override (use base)
 * - reject base.value <= 0
 * - reject reason.length < 5
 * - computeEffectiveCapacity
 * - diffForAlert transitions
 */
import {
  validateOverride,
  computeEffectiveCapacity,
  diffForAlert,
} from '@/lib/platform/operating-core/capacity/capacity-validator'
import type {
  CapacityBase,
  CapacityOverride,
  CapacitySnapshot,
} from '@/lib/platform/operating-core/capacity/capacity-types'

const BASE_SCOPE = 'event' as const
const NOW = '2026-07-20T12:00:00.000Z'

function makeBase(value: number, scope = BASE_SCOPE): CapacityBase {
  return { value, scope, effectiveAt: NOW }
}

function makeOverride(value: number, reason = 'venue layout'): CapacityOverride {
  return { value, reason, setByPersonaId: 'persona-1', setAt: NOW }
}

function makeSnapshot(
  base: CapacityBase,
  override: CapacityOverride | null,
): CapacitySnapshot {
  return {
    base,
    override,
    effective: override?.value ?? base.value,
  }
}

describe('validateOverride(base, override)', () => {
  describe('override exceeds base', () => {
    it('rejects override value greater than base', () => {
      const base = makeBase(20)
      const override = makeOverride(25)
      const result = validateOverride(base, override)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('override_exceeds_base')
        expect(result.message).toContain('25')
        expect(result.message).toContain('20')
      }
    })

    it('rejects override value equal to base (allowed per spec — not a rejection case)', () => {
      // Note: spec says reject > base, so = base is allowed
      const base = makeBase(20)
      const override = makeOverride(20)
      const result = validateOverride(base, override)
      expect(result.ok).toBe(true)
    })

    it('rejects when override is one more than base', () => {
      const base = makeBase(10)
      const override = makeOverride(11)
      const result = validateOverride(base, override)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('override_exceeds_base')
      }
    })
  })

  describe('override within base', () => {
    it('accepts override value less than base', () => {
      const base = makeBase(30)
      const override = makeOverride(25)
      const result = validateOverride(base, override)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.snapshot.effective).toBe(25)
        expect(result.snapshot.override).not.toBeNull()
      }
    })

    it('accepts override value equal to base', () => {
      const base = makeBase(20)
      const override = makeOverride(20)
      const result = validateOverride(base, override)
      expect(result.ok).toBe(true)
    })

    it('accepts zero override (fully closes)', () => {
      const base = makeBase(20)
      const override = makeOverride(0)
      const result = validateOverride(base, override)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.snapshot.effective).toBe(0)
      }
    })
  })

  describe('null override (remove override)', () => {
    it('accepts null override — effective = base', () => {
      const base = makeBase(30)
      const result = validateOverride(base, null)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.snapshot.override).toBeNull()
        expect(result.snapshot.effective).toBe(30)
      }
    })
  })

  describe('base validation', () => {
    it('rejects base.value = 0', () => {
      const base = makeBase(0)
      const override = makeOverride(0)
      const result = validateOverride(base, override)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('base_must_be_positive')
      }
    })

    it('rejects base.value < 0', () => {
      const base = makeBase(-5)
      const override = makeOverride(0)
      const result = validateOverride(base, override)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('base_must_be_positive')
      }
    })

    it('accepts base.value = 1', () => {
      const base = makeBase(1)
      const result = validateOverride(base, null)
      expect(result.ok).toBe(true)
    })
  })

  describe('reason length validation', () => {
    it('rejects empty reason', () => {
      const base = makeBase(20)
      const override = makeOverride(15, '')
      const result = validateOverride(base, override)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('reason_too_short')
      }
    })

    it('rejects reason with 3 characters', () => {
      const base = makeBase(20)
      const override = makeOverride(15, 'abc')
      const result = validateOverride(base, override)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('reason_too_short')
      }
    })

    it('rejects reason with 4 characters', () => {
      const base = makeBase(20)
      const override = makeOverride(15, 'abcd')
      const result = validateOverride(base, override)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('reason_too_short')
      }
    })

    it('accepts reason with exactly 5 characters', () => {
      const base = makeBase(20)
      const override = makeOverride(15, 'venue')
      const result = validateOverride(base, override)
      expect(result.ok).toBe(true)
    })

    it('accepts reason with 100 characters', () => {
      const base = makeBase(20)
      const override = makeOverride(15, 'v'.repeat(100))
      const result = validateOverride(base, override)
      expect(result.ok).toBe(true)
    })
  })

  describe('null override skips reason validation', () => {
    it('accepts null override with no reason constraint', () => {
      const base = makeBase(20)
      const result = validateOverride(base, null)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.snapshot.override).toBeNull()
      }
    })
  })

  describe('effective value computation', () => {
    it('sets effective to override.value when override exists', () => {
      const base = makeBase(30)
      const override = makeOverride(20)
      const result = validateOverride(base, override)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.snapshot.effective).toBe(20)
      }
    })

    it('sets effective to base.value when override is null', () => {
      const base = makeBase(30)
      const result = validateOverride(base, null)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.snapshot.effective).toBe(30)
      }
    })
  })
})

describe('computeEffectiveCapacity(snapshot)', () => {
  it('returns override.value when override is present', () => {
    const base = makeBase(30)
    const override = makeOverride(20)
    const snapshot = makeSnapshot(base, override)
    expect(computeEffectiveCapacity(snapshot)).toBe(20)
  })

  it('returns base.value when override is null', () => {
    const base = makeBase(30)
    const snapshot = makeSnapshot(base, null)
    expect(computeEffectiveCapacity(snapshot)).toBe(30)
  })

  it('returns 0 when override value is 0', () => {
    const base = makeBase(30)
    const override = makeOverride(0)
    const snapshot = makeSnapshot(base, override)
    expect(computeEffectiveCapacity(snapshot)).toBe(0)
  })
})

describe('diffForAlert(prev, next, setByPersonaId, detectedAt)', () => {
  const actorId = 'persona-1'
  const detectedAt = NOW

  it('returns null when effective capacity unchanged', () => {
    const base = makeBase(20)
    const prev = makeSnapshot(base, makeOverride(15))
    const next = makeSnapshot(base, makeOverride(15))
    expect(diffForAlert(prev, next, actorId, detectedAt)).toBeNull()
  })

  it('returns null when override removed but effective unchanged (was using base)', () => {
    const base = makeBase(20)
    const prev = makeSnapshot(base, null)
    const next = makeSnapshot(base, null)
    expect(diffForAlert(prev, next, actorId, detectedAt)).toBeNull()
  })

  it('emits override_removed when override was present and is now null', () => {
    const base = makeBase(20)
    const prev = makeSnapshot(base, makeOverride(15))
    const next = makeSnapshot(base, null)
    const alert = diffForAlert(prev, next, actorId, detectedAt)
    expect(alert).not.toBeNull()
    expect(alert!.type).toBe('override_removed')
    expect(alert!.scope).toBe(BASE_SCOPE)
    expect(alert!.baseValue).toBe(20)
    expect(alert!.previousValue).toBe(15)
    expect(alert!.newValue).toBe(20)
    expect(alert!.setByPersonaId).toBe(actorId)
    expect(alert!.detectedAt).toBe(detectedAt)
  })

  it('emits override_lower_than_baseline when effective goes below base via override reduction', () => {
    const base = makeBase(20)
    const prev = makeSnapshot(base, makeOverride(18))
    const next = makeSnapshot(base, makeOverride(10))
    const alert = diffForAlert(prev, next, actorId, detectedAt)
    expect(alert).not.toBeNull()
    expect(alert!.type).toBe('override_lower_than_baseline')
    expect(alert!.baseValue).toBe(20)
    expect(alert!.previousValue).toBe(18)
    expect(alert!.newValue).toBe(10)
    expect(alert!.setByPersonaId).toBe(actorId)
  })

  it('returns null when effective goes up (raise alert not needed for lower-than-base)', () => {
    const base = makeBase(20)
    const prev = makeSnapshot(base, makeOverride(10))
    const next = makeSnapshot(base, makeOverride(18))
    expect(diffForAlert(prev, next, actorId, detectedAt)).toBeNull()
  })

  it('returns null when base itself changed (not an override transition)', () => {
    // diffForAlert is about override transitions, not base changes
    const base1 = makeBase(20)
    const base2 = makeBase(25)
    const prev = makeSnapshot(base1, makeOverride(15))
    const next = makeSnapshot(base2, makeOverride(15))
    // Both use override 15, effective unchanged — no alert
    expect(diffForAlert(prev, next, actorId, detectedAt)).toBeNull()
  })

  it('returns null when prev had no override and next has none', () => {
    const base = makeBase(20)
    const prev = makeSnapshot(base, null)
    const next = makeSnapshot(base, null)
    expect(diffForAlert(prev, next, actorId, detectedAt)).toBeNull()
  })
})
