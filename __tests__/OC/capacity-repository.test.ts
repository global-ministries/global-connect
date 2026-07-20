/**
 * S12 TDD RED — capacity repository tests.
 * Tests cover:
 * - setOverride rejects above-base (returns failure snapshot)
 * - setOverride accepts valid override
 * - getCurrent returns updated snapshot
 * - setOverride(null) removes override
 * - alert hook captures lower-than-baseline alerts
 */
import {
  createCapacityRepositoryFake,
} from '@/lib/platform/operating-core/capacity/capacity-repository-fake'
import type {
  CapacityRepository,
  SetOverrideInput,
} from '@/lib/platform/operating-core/capacity/capacity-repository'
import type {
  CapacityBase,
  CapacityOverride,
} from '@/lib/platform/operating-core/capacity/capacity-types'

const BASE_SCOPE = 'event' as const
const EVENT_INSTANCE_ID = 'instance-1'
const NOW = '2026-07-20T12:00:00.000Z'

function makeBase(value: number): CapacityBase {
  return { value, scope: BASE_SCOPE, effectiveAt: NOW }
}

function makeOverride(value: number, reason = 'venue layout'): CapacityOverride {
  return { value, reason, setByPersonaId: 'persona-1', setAt: NOW }
}

function setOverrideInput(
  eventInstanceId: string,
  base: CapacityBase,
  override: CapacityOverride | null,
): SetOverrideInput {
  return { eventInstanceId, base, override }
}

describe('CapacityRepository (fake)', () => {
  let repo: CapacityRepository

  beforeEach(() => {
    repo = createCapacityRepositoryFake()
  })

  describe('getCurrent(eventInstanceId)', () => {
    it('returns snapshot with base only when no override set', async () => {
      const base = makeBase(30)
      await repo.setOverride(setOverrideInput(EVENT_INSTANCE_ID, base, null))

      const snap = await repo.getCurrent(EVENT_INSTANCE_ID)
      expect(snap.base.value).toBe(30)
      expect(snap.override).toBeNull()
      expect(snap.effective).toBe(30)
    })

    it('returns effective = override.value when override set', async () => {
      const base = makeBase(30)
      const override = makeOverride(20)
      await repo.setOverride(setOverrideInput(EVENT_INSTANCE_ID, base, override))

      const snap = await repo.getCurrent(EVENT_INSTANCE_ID)
      expect(snap.effective).toBe(20)
      expect(snap.override).not.toBeNull()
    })

    it('throws when eventInstanceId not found', async () => {
      await expect(repo.getCurrent('nonexistent')).rejects.toThrow(
        'No capacity snapshot found',
      )
    })
  })

  describe('setOverride(input)', () => {
    it('rejects above-base override — returns failure snapshot with effective=base', async () => {
      const base = makeBase(20)
      const override = makeOverride(25) // > base
      const input = setOverrideInput(EVENT_INSTANCE_ID, base, override)

      const snap = await repo.setOverride(input)

      // Domain rejects BEFORE persistence — effective stays at base
      expect(snap.effective).toBe(20)
      expect(snap.override).toBeNull()
    })

    it('accepts valid override — subsequent getCurrent returns updated effective', async () => {
      const base = makeBase(30)
      const override = makeOverride(25)
      const input = setOverrideInput(EVENT_INSTANCE_ID, base, override)

      const snap = await repo.setOverride(input)
      expect(snap.effective).toBe(25)
      expect(snap.override).not.toBeNull()

      // Verify persistence
      const current = await repo.getCurrent(EVENT_INSTANCE_ID)
      expect(current.effective).toBe(25)
    })

    it('accepts override equal to base', async () => {
      const base = makeBase(20)
      const override = makeOverride(20)
      const input = setOverrideInput(EVENT_INSTANCE_ID, base, override)

      const snap = await repo.setOverride(input)
      expect(snap.effective).toBe(20)
    })

    it('accepts zero override', async () => {
      const base = makeBase(20)
      const override = makeOverride(0)
      const input = setOverrideInput(EVENT_INSTANCE_ID, base, override)

      const snap = await repo.setOverride(input)
      expect(snap.effective).toBe(0)
    })

    it('setting null override removes it — effective falls back to base', async () => {
      const base = makeBase(30)

      // First set a valid override
      await repo.setOverride(setOverrideInput(EVENT_INSTANCE_ID, base, makeOverride(20)))

      // Then remove it
      const snap = await repo.setOverride(setOverrideInput(EVENT_INSTANCE_ID, base, null))

      expect(snap.override).toBeNull()
      expect(snap.effective).toBe(30)

      // Verify persistence
      const current = await repo.getCurrent(EVENT_INSTANCE_ID)
      expect(current.override).toBeNull()
      expect(current.effective).toBe(30)
    })
  })

  describe('getAlertHook()', () => {
    it('subscribe receives alerts as they are emitted', async () => {
      const base = makeBase(20)
      const received: import('@/lib/platform/operating-core/capacity/capacity-types').CapacityAlert[] = []

      // First set a baseline override
      await repo.setOverride(setOverrideInput(EVENT_INSTANCE_ID, base, makeOverride(18)))

      const hook = repo.getAlertHook()
      if (hook.subscribe) {
        const unsubscribe = hook.subscribe((alert) => received.push(alert))
        // Now lower it — this should emit the alert
        await repo.setOverride(setOverrideInput(EVENT_INSTANCE_ID, base, makeOverride(10)))
        unsubscribe()
      }

      expect(received).toHaveLength(1)
      expect(received[0].type).toBe('override_lower_than_baseline')
    })

    it('captures override_removed when override is set to null', async () => {
      const base = makeBase(20)

      // Set initial override
      await repo.setOverride(setOverrideInput(EVENT_INSTANCE_ID, base, makeOverride(15)))

      // Remove override
      await repo.setOverride(setOverrideInput(EVENT_INSTANCE_ID, base, null))

      const hook = repo.getAlertHook()
      const removedAlert = hook.alerts.find((a) => a.type === 'override_removed')
      expect(removedAlert).toBeDefined()
      expect(removedAlert!.previousValue).toBe(15)
      expect(removedAlert!.newValue).toBe(20)
    })

    it('does not emit alert when override is raised', async () => {
      const base = makeBase(20)

      await repo.setOverride(setOverrideInput(EVENT_INSTANCE_ID, base, makeOverride(10)))
      await repo.setOverride(setOverrideInput(EVENT_INSTANCE_ID, base, makeOverride(18)))

      const hook = repo.getAlertHook()
      const lowerAlerts = hook.alerts.filter((a) => a.type === 'override_lower_than_baseline')
      expect(lowerAlerts).toHaveLength(0)
    })
  })

  describe('multiple eventInstanceIds are isolated', () => {
    it('stores separate snapshots per eventInstanceId', async () => {
      const baseA = makeBase(30)
      const baseB = makeBase(50)

      await repo.setOverride(setOverrideInput('event-a', baseA, makeOverride(20)))
      await repo.setOverride(setOverrideInput('event-b', baseB, makeOverride(40)))

      const snapA = await repo.getCurrent('event-a')
      const snapB = await repo.getCurrent('event-b')

      expect(snapA.effective).toBe(20)
      expect(snapB.effective).toBe(40)
    })
  })
})
