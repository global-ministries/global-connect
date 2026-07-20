/**
 * S09 TDD RED — registration-repository
 * Verifies RegistrationsRepository interface contract via in-memory fake.
 */
import { OperatingCoreConcurrencyConflictError } from '@/lib/platform/operating-core/errors'
import type { RegistrationsRepository } from '@/lib/platform/operating-core/registrations/registration-repository'
import { createInMemoryRegistrationsRepository } from '@/lib/platform/operating-core/registrations/registration-repository-fake'
import type { CreateRegistrationInput } from '@/lib/platform/operating-core/registrations/registration-state'
import { isPersistedRegistrationOutcome } from '@/lib/platform/operating-core/registrations/registration-state'

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function makeRegInput(overrides: Partial<CreateRegistrationInput> = {}): CreateRegistrationInput {
  return {
    personaId: 'persona-1',
    eventId: 'event-1',
    confirmationMode: 'automatic',
    effectiveCapacity: 20,
    waitlistable: true,
    currentConfirmedCount: 0,
    currentWaitlistLength: 0,
    expectedVersion: undefined,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('RegistrationsRepository', () => {
  let repo: RegistrationsRepository

  beforeEach(() => {
    repo = createInMemoryRegistrationsRepository()
  })

  // ---------------------------------------------------------------------------
  // create — basic
  // ---------------------------------------------------------------------------

  describe('create', () => {
    it('creates registration with auto-generated id and version 1 (automatic, capacity available)', async () => {
      const input = makeRegInput({ confirmationMode: 'automatic', currentConfirmedCount: 0 })
      const result = await repo.create(input)
      expect(result.kind).toBe('confirmed')
      if (result.kind !== 'confirmed') return
      expect(result.registrationId).toBeDefined()
      expect(typeof result.registrationId).toBe('string')
      expect(result.state).toBe('confirmada')
    })

    it('creates waitlisted registration when at capacity and waitlistable', async () => {
      const input = makeRegInput({
        confirmationMode: 'automatic',
        currentConfirmedCount: 20,
        currentWaitlistLength: 0,
        effectiveCapacity: 20,
      })
      const result = await repo.create(input)
      expect(result.kind).toBe('waitlisted')
      if (result.kind !== 'waitlisted') return
      expect(result.waitlistPosition).toBe(1)
      expect(result.state).toBe('pendiente')
    })

    it('returns capacity_conflict when at capacity and NOT waitlistable', async () => {
      const input = makeRegInput({
        confirmationMode: 'automatic',
        currentConfirmedCount: 20,
        effectiveCapacity: 20,
        waitlistable: false,
      })
      const result = await repo.create(input)
      expect(result.kind).toBe('capacity_conflict')
      if (result.kind !== 'capacity_conflict') return
      expect(result.effectiveCapacity).toBe(20)
      expect(result.waitlistable).toBe(false)
    })

    it('creates manual registration as pendiente state', async () => {
      const input = makeRegInput({
        confirmationMode: 'manual',
        currentConfirmedCount: 0,
        effectiveCapacity: 20,
        waitlistable: false,
      })
      const result = await repo.create(input)
      expect(result.kind).toBe('confirmed')
      if (result.kind !== 'confirmed') return
      expect(result.state).toBe('pendiente')
    })
  })

  // ---------------------------------------------------------------------------
  // idempotency: duplicate (persona_id, event_id) → irreconcilable_idempotency
  // ---------------------------------------------------------------------------

  describe('idempotency — duplicate (persona_id, event_id)', () => {
    it('first create succeeds', async () => {
      const input = makeRegInput({ personaId: 'persona-x', eventId: 'event-x' })
      const result = await repo.create(input)
      expect(result.kind).not.toBe('irreconcilable_idempotency')
    })

    it('second create with same (persona_id, event_id) returns irreconcilable_idempotency', async () => {
      const input = makeRegInput({ personaId: 'persona-x', eventId: 'event-x' })
      await repo.create(input)
      const second = await repo.create(input)
      expect(second.kind).toBe('irreconcilable_idempotency')
      if (second.kind !== 'irreconcilable_idempotency') return
      expect(second.personaId).toBe('persona-x')
      expect(second.eventId).toBe('event-x')
    })

    it('different persona_id same event_id does NOT return idempotency error', async () => {
      await repo.create(makeRegInput({ personaId: 'persona-a', eventId: 'event-x' }))
      const second = await repo.create(makeRegInput({ personaId: 'persona-b', eventId: 'event-x' }))
      expect(second.kind).not.toBe('irreconcilable_idempotency')
    })

    it('different event_id same persona_id does NOT return idempotency error', async () => {
      await repo.create(makeRegInput({ personaId: 'persona-x', eventId: 'event-a' }))
      const second = await repo.create(makeRegInput({ personaId: 'persona-x', eventId: 'event-b' }))
      expect(second.kind).not.toBe('irreconcilable_idempotency')
    })
  })

  // ---------------------------------------------------------------------------
  // findById
  // ---------------------------------------------------------------------------

  describe('findById', () => {
    it('returns null for non-existent id', async () => {
      const result = await repo.findById('non-existent')
      expect(result).toBeNull()
    })

    it('returns registration after creation', async () => {
      const input = makeRegInput()
      const outcome = await repo.create(input)
      if (outcome.kind === 'capacity_conflict') {
        throw new Error('unexpected capacity_conflict')
      }
      if (!isPersistedRegistrationOutcome(outcome)) {
        throw new Error('unexpected')
      }
      const id = outcome.registrationId
      const found = await repo.findById(id)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(id)
    })
  })

  // ---------------------------------------------------------------------------
  // findActiveByPersonaAndEvent
  // ---------------------------------------------------------------------------

  describe('findActiveByPersonaAndEvent', () => {
    it('returns null when no active registration exists', async () => {
      const result = await repo.findActiveByPersonaAndEvent('persona-1', 'event-1')
      expect(result).toBeNull()
    })

    it('returns active registration for (persona_id, event_id)', async () => {
      const input = makeRegInput({ personaId: 'persona-x', eventId: 'event-y' })
      await repo.create(input)
      const found = await repo.findActiveByPersonaAndEvent('persona-x', 'event-y')
      expect(found).not.toBeNull()
      expect(found!.personaId).toBe('persona-x')
      expect(found!.eventId).toBe('event-y')
    })

    it('returns null for terminal state registration', async () => {
      const input = makeRegInput({ personaId: 'persona-x', eventId: 'event-y' })
      const outcome = await repo.create(input)
      if (outcome.kind === 'capacity_conflict' || outcome.kind === 'irreconcilable_idempotency') {
        throw new Error('unexpected')
      }
      if (!isPersistedRegistrationOutcome(outcome)) {
        throw new Error('unexpected')
      }
      const id = outcome.registrationId
      // Transition to terminal state
      await repo.transition(id, 1, 'asistida', 'manual', 'operator-1')
      const found = await repo.findActiveByPersonaAndEvent('persona-x', 'event-y')
      expect(found).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // listByEvent
  // ---------------------------------------------------------------------------

  describe('listByEvent', () => {
    it('returns empty list when no registrations', async () => {
      const result = await repo.listByEvent('event-1')
      expect(result).toHaveLength(0)
    })

    it('returns all registrations for an event', async () => {
      await repo.create(makeRegInput({ personaId: 'p1', eventId: 'e1' }))
      await repo.create(makeRegInput({ personaId: 'p2', eventId: 'e1' }))
      await repo.create(makeRegInput({ personaId: 'p3', eventId: 'e2' }))
      const result = await repo.listByEvent('e1')
      expect(result).toHaveLength(2)
    })

    it('filters by state', async () => {
      const outcome1 = await repo.create(makeRegInput({ personaId: 'p1', eventId: 'e1' }))
      if (outcome1.kind === 'capacity_conflict' || outcome1.kind === 'irreconcilable_idempotency') {
        throw new Error('unexpected')
      }
      if (!isPersistedRegistrationOutcome(outcome1)) {
        throw new Error('unexpected')
      }
      await repo.create(makeRegInput({ personaId: 'p2', eventId: 'e1', currentConfirmedCount: 20 }))
      await repo.transition(outcome1.registrationId, 1, 'cancelada', 'test', 'operator-1')
      const result = await repo.listByEvent('e1', { state: 'cancelada' })
      expect(result).toHaveLength(1)
      expect(result[0].state).toBe('cancelada')
    })
  })

  // ---------------------------------------------------------------------------
  // listWaitlist
  // ---------------------------------------------------------------------------

  describe('listWaitlist', () => {
    it('returns empty list when no waitlist entries', async () => {
      const result = await repo.listWaitlist('event-1')
      expect(result).toHaveLength(0)
    })

    it('returns only pendiente registrations sorted by waitlistPosition', async () => {
      // p1 at capacity → waitlisted at position 1
      await repo.create(makeRegInput({ personaId: 'p1', eventId: 'e1', currentConfirmedCount: 20, effectiveCapacity: 20 }))
      // p2 also waitlisted at position 2
      await repo.create(makeRegInput({ personaId: 'p2', eventId: 'e1', currentConfirmedCount: 20, effectiveCapacity: 20, currentWaitlistLength: 1 }))
      // p3 confirmed (different event)
      await repo.create(makeRegInput({ personaId: 'p3', eventId: 'e2' }))

      const waitlist = await repo.listWaitlist('e1')
      expect(waitlist).toHaveLength(2)
      expect(waitlist[0].waitlistPosition).toBe(1)
      expect(waitlist[1].waitlistPosition).toBe(2)
    })
  })

  // ---------------------------------------------------------------------------
  // transition with optimistic concurrency
  // ---------------------------------------------------------------------------

  describe('transition', () => {
    it('transitions from pendiente to confirmada', async () => {
      const outcome = await repo.create(makeRegInput({ confirmationMode: 'manual' }))
      if (outcome.kind === 'capacity_conflict' || outcome.kind === 'irreconcilable_idempotency') {
        throw new Error('unexpected')
      }
      if (!isPersistedRegistrationOutcome(outcome)) {
        throw new Error('unexpected')
      }
      const id = outcome.registrationId
      const result = await repo.transition(id, 1, 'confirmada', 'manual', 'operator-1')
      expect(result.outcome.kind).toBe('confirmed')
      expect(result.registration.state).toBe('confirmada')
      expect(result.registration.version).toBe(2)
    })

    it('throws ConcurrencyConflictError on version mismatch', async () => {
      const outcome = await repo.create(makeRegInput())
      if (outcome.kind === 'capacity_conflict' || outcome.kind === 'irreconcilable_idempotency') {
        throw new Error('unexpected')
      }
      if (!isPersistedRegistrationOutcome(outcome)) {
        throw new Error('unexpected')
      }
      const id = outcome.registrationId
      await expect(
        repo.transition(id, 99, 'cancelada', 'test', 'operator-1'),
      ).rejects.toThrow(OperatingCoreConcurrencyConflictError)
    })

    it('returns invalid_transition for terminal → non-terminal', async () => {
      const outcome = await repo.create(makeRegInput())
      if (outcome.kind === 'capacity_conflict' || outcome.kind === 'irreconcilable_idempotency') {
        throw new Error('unexpected')
      }
      if (!isPersistedRegistrationOutcome(outcome)) {
        throw new Error('unexpected')
      }
      const id = outcome.registrationId
      // Transition to terminal first
      const terminalResult = await repo.transition(id, 1, 'asistida', 'manual', 'operator-1')
      expect(terminalResult.registration.state).toBe('asistida')
      // Now try invalid transition from terminal
      const invalidResult = await repo.transition(id, 2, 'confirmada', 'manual', 'operator-1')
      expect(invalidResult.outcome.kind).toBe('invalid_transition')
      if (invalidResult.outcome.kind !== 'invalid_transition') return
      expect(invalidResult.outcome.from).toBe('asistida')
      expect(invalidResult.outcome.to).toBe('confirmada')
    })
  })

  // ---------------------------------------------------------------------------
  // cancel — releases 1 slot and promotes next waitlist entry if at position 1
  // ---------------------------------------------------------------------------

  describe('cancel', () => {
    it('cancels a confirmed registration and increments version', async () => {
      const outcome = await repo.create(makeRegInput({ confirmationMode: 'automatic' }))
      if (outcome.kind !== 'confirmed') throw new Error('expected confirmed')
      const id = outcome.registrationId
      const result = await repo.cancel(id, 1, 'testing', 'operator-1')
      expect(result.cancelled.state).toBe('cancelada')
      expect(result.cancelled.version).toBe(2)
    })

    it('cancelling a waitlisted registration at position >1 does NOT promote anyone', async () => {
      // p1 at capacity → waitlisted position 1
      const p1 = await repo.create(makeRegInput({ personaId: 'p1', eventId: 'e1', currentConfirmedCount: 20, effectiveCapacity: 20 }))
      if (p1.kind === 'capacity_conflict' || p1.kind === 'irreconcilable_idempotency') throw new Error('unexpected')
      if (!isPersistedRegistrationOutcome(p1)) throw new Error('unexpected')
      // p2 waitlisted position 2
      const p2 = await repo.create(makeRegInput({ personaId: 'p2', eventId: 'e1', currentConfirmedCount: 20, effectiveCapacity: 20, currentWaitlistLength: 1 }))
      if (p2.kind === 'capacity_conflict' || p2.kind === 'irreconcilable_idempotency') throw new Error('unexpected')
      if (!isPersistedRegistrationOutcome(p2)) throw new Error('unexpected')

      // Cancel p1 (position 1) — this SHOULD promote p2
      const cancelResult = await repo.cancel(p1.registrationId, 1, 'test', 'operator-1')
      expect(cancelResult.cancelled.state).toBe('cancelada')
      // p1 was at position 1, so cancellation SHOULD trigger promotion
      // Wait, p1 was at position 1 (waitlisted), and p2 was at position 2
      // If p1 cancels, it releases no confirmed slot, so p2 is NOT promoted
      // Actually re-reading the issue: cancel of confirmed releases 1 slot and promotes position 1
      // Cancel of waitlisted only removes itself, doesn't promote
      expect(cancelResult.promoted).toBeNull()
    })

    it('cancel of confirmed registration promotes waitlisted position 1', async () => {
      // p-confirmed at confirmed
      const pConfirmed = await repo.create(makeRegInput({ personaId: 'pC', eventId: 'e1', confirmationMode: 'automatic' }))
      if (pConfirmed.kind === 'capacity_conflict' || pConfirmed.kind === 'irreconcilable_idempotency') throw new Error('unexpected')
      if (!isPersistedRegistrationOutcome(pConfirmed)) throw new Error('unexpected')
      // pWait1 at waitlist position 1
      const pWait1 = await repo.create(makeRegInput({ personaId: 'pW1', eventId: 'e1', currentConfirmedCount: 20, effectiveCapacity: 20 }))
      if (pWait1.kind === 'capacity_conflict' || pWait1.kind === 'irreconcilable_idempotency') throw new Error('unexpected')
      if (!isPersistedRegistrationOutcome(pWait1)) throw new Error('unexpected')
      // pWait2 at waitlist position 2
      await repo.create(makeRegInput({ personaId: 'pW2', eventId: 'e1', currentConfirmedCount: 20, effectiveCapacity: 20, currentWaitlistLength: 1 }))

      // Cancel confirmed → should promote pWait1
      const result = await repo.cancel(pConfirmed.registrationId, 1, 'test', 'operator-1')
      expect(result.cancelled.state).toBe('cancelada')
      expect(result.promoted).not.toBeNull()
      if (result.promoted) {
        expect(result.promoted.personaId).toBe('pW1')
        expect(result.promoted.state).toBe('confirmada')
        expect(result.promoted.version).toBe(2)
      }
    })

    it('cancel returns null promoted when waitlist is empty', async () => {
      const outcome = await repo.create(makeRegInput())
      if (outcome.kind !== 'confirmed') throw new Error('expected confirmed')
      const result = await repo.cancel(outcome.registrationId, 1, 'testing', 'operator-1')
      expect(result.cancelled.state).toBe('cancelada')
      expect(result.promoted).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // deny — manual denial from pendiente → rechazada
  // ---------------------------------------------------------------------------

  describe('deny', () => {
    it('denies a manual pending registration and records operator', async () => {
      const outcome = await repo.create(makeRegInput({ confirmationMode: 'manual' }))
      if (outcome.kind !== 'confirmed') throw new Error('expected confirmed')
      const id = outcome.registrationId
      const result = await repo.deny({
        registrationId: id,
        operatorPersonaId: 'operator-1',
        reason: 'Does not meet requirements',
        expectedVersion: 1,
      })
      expect(result.state).toBe('rechazada')
      expect(result.version).toBe(2)
    })

    it('throws ConcurrencyConflictError on version mismatch for deny', async () => {
      const outcome = await repo.create(makeRegInput({ confirmationMode: 'manual' }))
      if (outcome.kind !== 'confirmed') throw new Error('expected confirmed')
      await expect(
        repo.deny({
          registrationId: outcome.registrationId,
          operatorPersonaId: 'operator-1',
          reason: 'test',
          expectedVersion: 99,
        }),
      ).rejects.toThrow(OperatingCoreConcurrencyConflictError)
    })
  })

  // ---------------------------------------------------------------------------
  // promoteFromWaitlist — bulk promotion
  // ---------------------------------------------------------------------------

  describe('promoteFromWaitlist', () => {
    it('promotes top N waitlisted entries to confirmada', async () => {
      // Fill capacity
      await repo.create(makeRegInput({ personaId: 'pC', eventId: 'e1', confirmationMode: 'automatic' }))
      // Waitlist 3 entries (pW1, pW2, pW3) — we only need pW3's outcome for later check
      await repo.create(makeRegInput({ personaId: 'pW1', eventId: 'e1', currentConfirmedCount: 20, effectiveCapacity: 20 }))
      await repo.create(makeRegInput({ personaId: 'pW2', eventId: 'e1', currentConfirmedCount: 20, effectiveCapacity: 20, currentWaitlistLength: 1 }))
      const pW3Outcome = await repo.create(makeRegInput({ personaId: 'pW3', eventId: 'e1', currentConfirmedCount: 20, effectiveCapacity: 20, currentWaitlistLength: 2 }))

      const promoted = await repo.promoteFromWaitlist('e1', 2)
      expect(promoted).toHaveLength(2)
      expect(promoted[0].personaId).toBe('pW1')
      expect(promoted[0].state).toBe('confirmada')
      expect(promoted[1].personaId).toBe('pW2')
      expect(promoted[1].state).toBe('confirmada')
      // pW3 should still be waitlisted
      if (!isPersistedRegistrationOutcome(pW3Outcome)) {
        throw new Error('unexpected')
      }
      const pW3State = await repo.findById(pW3Outcome.registrationId)
      expect(pW3State!.state).toBe('pendiente')
      expect(pW3State!.waitlistPosition).toBe(1) // after promotion, pW3 is now position 1
    })

    it('promotes fewer when waitlist is shorter than slotsAvailable', async () => {
      await repo.create(makeRegInput({ personaId: 'pC', eventId: 'e1' }))
      await repo.create(makeRegInput({ personaId: 'pW1', eventId: 'e1', currentConfirmedCount: 20, effectiveCapacity: 20 }))

      const promoted = await repo.promoteFromWaitlist('e1', 5)
      expect(promoted).toHaveLength(1)
    })

    it('returns empty array when waitlist is empty', async () => {
      const result = await repo.promoteFromWaitlist('event-empty', 3)
      expect(result).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------------------
  // double-promotion guard — idempotency of cancellation promotion
  // ---------------------------------------------------------------------------

  describe('double-promotion guard', () => {
    it('cancel does not double-promote: cancelling already-promoted slot does nothing extra', async () => {
      // p-confirmed at confirmed
      const pConfirmed = await repo.create(makeRegInput({ personaId: 'pC', eventId: 'e1' }))
      if (pConfirmed.kind !== 'confirmed') throw new Error('expected confirmed')
      // pWait1 waitlisted
      const pWait1 = await repo.create(makeRegInput({ personaId: 'pW1', eventId: 'e1', currentConfirmedCount: 20, effectiveCapacity: 20 }))
      if (pWait1.kind === 'capacity_conflict' || pWait1.kind === 'irreconcilable_idempotency') throw new Error('unexpected')
      if (!isPersistedRegistrationOutcome(pWait1)) throw new Error('unexpected')

      // Cancel confirmed → promotes pWait1
      const cancelResult = await repo.cancel(pConfirmed.registrationId, 1, 'test', 'operator-1')
      expect(cancelResult.promoted).not.toBeNull()
      expect(cancelResult.promoted!.personaId).toBe('pW1')
      expect(cancelResult.promoted!.state).toBe('confirmada')

      // Now cancel pWait1 (which is now confirmada) — this should NOT promote anyone else
      const secondCancel = await repo.cancel(pWait1.registrationId, 2, 'test', 'operator-1')
      expect(secondCancel.cancelled.state).toBe('cancelada')
      expect(secondCancel.promoted).toBeNull() // no one else on waitlist
    })
  })
})
