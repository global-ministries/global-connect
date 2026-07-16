/**
 * S09 TDD RED — registration-state pure functions
 * Verifies: evaluateRegistrationOutcome, canDenyManualRegistration, validateWaitlistPromotion
 */
import {
  REGISTRATION_STATES,
  REGISTRATION_TRANSITIONS,
  canTransition,
  type RegistrationState,
} from '@/lib/platform/operating-core/state'
import {
  evaluateRegistrationOutcome,
  canDenyManualRegistration,
  validateWaitlistPromotion,
  type CreateRegistrationInput,
} from '@/lib/platform/operating-core/registrations/registration-state'

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<CreateRegistrationInput> = {}): CreateRegistrationInput {
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
// evaluateRegistrationOutcome — automatic confirmation within capacity
// ---------------------------------------------------------------------------

describe('evaluateRegistrationOutcome', () => {
  describe('automatic + capacity available', () => {
    it('returns confirmed outcome with state confirmada', () => {
      const input = makeInput({
        confirmationMode: 'automatic',
        effectiveCapacity: 20,
        waitlistable: true,
        currentConfirmedCount: 10,
        currentWaitlistLength: 0,
      })
      const result = evaluateRegistrationOutcome(input)
      expect(result.kind).toBe('confirmed')
      if (result.kind !== 'confirmed') return
      expect(result.state).toBe('confirmada')
      expect(result.registrationId).toBeDefined()
    })
  })

  // ---------------------------------------------------------------------------
  // automatic + capacity full + waitlistable → waitlisted
  // ---------------------------------------------------------------------------

  describe('automatic + capacity full + waitlistable', () => {
    it('returns waitlisted outcome at position 1 when no prior waitlist', () => {
      const input = makeInput({
        confirmationMode: 'automatic',
        effectiveCapacity: 20,
        waitlistable: true,
        currentConfirmedCount: 20,
        currentWaitlistLength: 0,
      })
      const result = evaluateRegistrationOutcome(input)
      expect(result.kind).toBe('waitlisted')
      if (result.kind !== 'waitlisted') return
      expect(result.state).toBe('pendiente')
      expect(result.waitlistPosition).toBe(1)
    })

    it('returns waitlisted outcome at next position when waitlist already has entries', () => {
      const input = makeInput({
        confirmationMode: 'automatic',
        effectiveCapacity: 20,
        waitlistable: true,
        currentConfirmedCount: 20,
        currentWaitlistLength: 5,
      })
      const result = evaluateRegistrationOutcome(input)
      expect(result.kind).toBe('waitlisted')
      if (result.kind !== 'waitlisted') return
      expect(result.waitlistPosition).toBe(6)
    })
  })

  // ---------------------------------------------------------------------------
  // automatic + capacity full + NOT waitlistable → capacity_conflict
  // ---------------------------------------------------------------------------

  describe('automatic + capacity full + NOT waitlistable', () => {
    it('returns capacity_conflict outcome', () => {
      const input = makeInput({
        confirmationMode: 'automatic',
        effectiveCapacity: 20,
        waitlistable: false,
        currentConfirmedCount: 20,
        currentWaitlistLength: 0,
      })
      const result = evaluateRegistrationOutcome(input)
      expect(result.kind).toBe('capacity_conflict')
      if (result.kind !== 'capacity_conflict') return
      expect(result.effectiveCapacity).toBe(20)
      expect(result.waitlistable).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // manual confirmation mode → always pendiente (pending) outcome
  // ---------------------------------------------------------------------------

  describe('manual confirmation mode', () => {
    it('returns confirmed with state pendiente regardless of capacity', () => {
      const input = makeInput({
        confirmationMode: 'manual',
        effectiveCapacity: 20,
        waitlistable: false,
        currentConfirmedCount: 20,
        currentWaitlistLength: 0,
      })
      const result = evaluateRegistrationOutcome(input)
      // Manual mode: the registration is stored as 'confirmada' outcome but state stays 'pendiente'
      // Wait — the spec says manual keeps rows in 'pendiente' but the outcome type says 'confirmed'
      // Let me re-read: "manual MUST keep new rows in pendiente" — so outcome should reflect that
      // The actual domain outcome for manual: the row persists in 'pendiente' awaiting operator review
      expect(result.kind).toBe('confirmed')
      if (result.kind !== 'confirmed') return
      expect(result.state).toBe('pendiente')
    })
  })

  // ---------------------------------------------------------------------------
  // capacity_conflict is NOT returned for waitlistable overflow (only non-waitlistable)
  // ---------------------------------------------------------------------------

  describe('waitlistable overflow does NOT return capacity_conflict', () => {
    it('returns waitlisted even when at capacity and waitlistable is true', () => {
      const input = makeInput({
        confirmationMode: 'automatic',
        effectiveCapacity: 20,
        waitlistable: true,
        currentConfirmedCount: 20,
        currentWaitlistLength: 3,
      })
      const result = evaluateRegistrationOutcome(input)
      expect(result.kind).not.toBe('capacity_conflict')
      expect(result.kind).toBe('waitlisted')
    })
  })
})

// ---------------------------------------------------------------------------
// canDenyManualRegistration
// ---------------------------------------------------------------------------

describe('canDenyManualRegistration', () => {
  it('returns true when state is pendiente and confirmationMode is manual', () => {
    const result = canDenyManualRegistration({
      state: 'pendiente',
      confirmationMode: 'manual',
    })
    expect(result).toBe(true)
  })

  it('returns false when confirmationMode is automatic', () => {
    const result = canDenyManualRegistration({
      state: 'pendiente',
      confirmationMode: 'automatic',
    })
    expect(result).toBe(false)
  })

  it('returns false when state is not pendiente', () => {
    const result = canDenyManualRegistration({
      state: 'confirmada',
      confirmationMode: 'manual',
    })
    expect(result).toBe(false)
  })

  it('returns false for terminal states', () => {
    for (const state of REGISTRATION_STATES) {
      if (state === 'pendiente') continue
      const result = canDenyManualRegistration({
        state: state as RegistrationState,
        confirmationMode: 'manual',
      })
      expect(result).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// validateWaitlistPromotion
// ---------------------------------------------------------------------------

describe('validateWaitlistPromotion', () => {
  it('returns promotableCount=1 and nextWaitlistPosition=1 when 1 confirmed slot opens', () => {
    const result = validateWaitlistPromotion({
      currentConfirmed: 19,
      effectiveCapacity: 20,
      waitlistLength: 5,
    })
    expect(result.promotableCount).toBe(1)
    expect(result.nextWaitlistPosition).toBe(1)
  })

  it('returns promotableCount=3 and nextWaitlistPosition=1 when capacity grows by 3', () => {
    const result = validateWaitlistPromotion({
      currentConfirmed: 18,
      effectiveCapacity: 21,
      waitlistLength: 5,
    })
    expect(result.promotableCount).toBe(3)
    expect(result.nextWaitlistPosition).toBe(1)
  })

  it('returns promotableCount=0 when waitlist is empty', () => {
    const result = validateWaitlistPromotion({
      currentConfirmed: 19,
      effectiveCapacity: 20,
      waitlistLength: 0,
    })
    expect(result.promotableCount).toBe(0)
    expect(result.nextWaitlistPosition).toBe(1)
  })

  it('caps promotableCount to waitlistLength', () => {
    const result = validateWaitlistPromotion({
      currentConfirmed: 15,
      effectiveCapacity: 20,
      waitlistLength: 2,
    })
    // 5 slots available but only 2 on waitlist
    expect(result.promotableCount).toBe(2)
    expect(result.nextWaitlistPosition).toBe(1)
  })

  it('returns nextWaitlistPosition=1 when waitlistLength is 0', () => {
    const result = validateWaitlistPromotion({
      currentConfirmed: 20,
      effectiveCapacity: 20,
      waitlistLength: 0,
    })
    expect(result.nextWaitlistPosition).toBe(1)
    expect(result.promotableCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Terminal states are enforced by the state machine (S02 canTransition)
// We re-export that guarantee here so tests prove it holds for registration domain
// ---------------------------------------------------------------------------

describe('terminal states are immutable via canTransition (S02 guarantee)', () => {
  const terminalStates: RegistrationState[] = ['asistida', 'no_asistio', 'cancelada', 'rechazada']

  for (const from of terminalStates) {
    it(`${from} is terminal — no valid transitions out`, () => {
      for (const to of REGISTRATION_STATES) {
        if (from === to) continue
        expect(canTransition(from, to)).toBe(false)
      }
    })
  }

  it('pendiente is NOT terminal', () => {
    const targets = REGISTRATION_TRANSITIONS['pendiente']
    expect(targets.size).toBeGreaterThan(0)
  })

  it('confirmada is NOT terminal', () => {
    const targets = REGISTRATION_TRANSITIONS['confirmada']
    expect(targets.size).toBeGreaterThan(0)
  })
})
