/**
 * S09 — registration-state pure domain functions
 * Evaluates registration outcomes based on capacity, confirmation mode, and waitlist state.
 * REUSES S02 state machine: REGISTRATION_STATES, REGISTRATION_TRANSITIONS, canTransition.
 */
import { type RegistrationState } from '../state'

// ---------------------------------------------------------------------------
// Outcome types
// ---------------------------------------------------------------------------

/** Outcome returned by evaluateRegistrationOutcome (create evaluation) — excludes idempotency */
export type RegistrationCreateOutcome =
  | { kind: 'confirmed'; registrationId: string; state: 'confirmada' }
  | { kind: 'confirmed'; registrationId: string; state: 'pendiente' }
  | { kind: 'waitlisted'; registrationId: string; state: 'pendiente'; waitlistPosition: number }
  | { kind: 'capacity_conflict'; effectiveCapacity: number; waitlistable: boolean }

/** Full registration outcome union — used by repository layer */
export type RegistrationOutcome =
  | RegistrationCreateOutcome
  | { kind: 'rejected'; registrationId: string; state: 'rechazada'; reason: 'manual_denial'; deniedBy?: string }
  | { kind: 'invalid_transition'; from: RegistrationState; to: RegistrationState }
  | { kind: 'irreconcilable_idempotency'; personaId: string; eventId: string }

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateRegistrationInput {
  personaId: string
  eventId: string
  confirmationMode: 'automatic' | 'manual'
  effectiveCapacity: number
  waitlistable: boolean
  /** How many are already 'confirmada' for this event */
  currentConfirmedCount: number
  /** How many are already 'pendiente' on the waitlist */
  currentWaitlistLength: number
  expectedVersion?: number
}

export type DenyManualRegistrationInput = {
  registrationId: string
  operatorPersonaId: string
  reason: string
  expectedVersion: number
}

// ---------------------------------------------------------------------------
// evaluateRegistrationOutcome — pure function
// Determines the registration outcome without side effects.
// ---------------------------------------------------------------------------

export function evaluateRegistrationOutcome(input: CreateRegistrationInput): RegistrationCreateOutcome {
  const { confirmationMode, effectiveCapacity, waitlistable, currentConfirmedCount, currentWaitlistLength } =
    input

  // Manual confirmation: always persist as 'pendiente' awaiting operator review
  if (confirmationMode === 'manual') {
    return {
      kind: 'confirmed',
      registrationId: generateId(),
      state: 'pendiente',
    }
  }

  // Automatic confirmation: check capacity
  const hasCapacity = currentConfirmedCount < effectiveCapacity

  if (hasCapacity) {
    return {
      kind: 'confirmed',
      registrationId: generateId(),
      state: 'confirmada',
    }
  }

  // No capacity — waitlistable?
  if (waitlistable) {
    return {
      kind: 'waitlisted',
      registrationId: generateId(),
      state: 'pendiente',
      waitlistPosition: currentWaitlistLength + 1,
    }
  }

  // No capacity and not waitlistable → capacity conflict (409)
  return {
    kind: 'capacity_conflict',
    effectiveCapacity,
    waitlistable,
  }
}

// ---------------------------------------------------------------------------
// canDenyManualRegistration — pure function
// Returns true iff the registration can be manually denied.
// Only pendiente + manual confirmation mode allows manual denial.
// ---------------------------------------------------------------------------

export function canDenyManualRegistration(registration: {
  state: RegistrationState
  confirmationMode: 'automatic' | 'manual'
}): boolean {
  return registration.state === 'pendiente' && registration.confirmationMode === 'manual'
}

// ---------------------------------------------------------------------------
// validateWaitlistPromotion — pure function
// Computes how many waitlist entries can be promoted given a capacity change.
// ---------------------------------------------------------------------------

export function validateWaitlistPromotion(params: {
  currentConfirmed: number
  effectiveCapacity: number
  waitlistLength: number
}): {
  promotableCount: number
  nextWaitlistPosition: number
} {
  const { currentConfirmed, effectiveCapacity, waitlistLength } = params

  const slotsAvailable = effectiveCapacity - currentConfirmed
  if (slotsAvailable <= 0) {
    return { promotableCount: 0, nextWaitlistPosition: 1 }
  }

  const promotableCount = Math.min(slotsAvailable, waitlistLength)

  return {
    promotableCount,
    nextWaitlistPosition: 1,
  }
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Type guard: did this outcome persist a new registration?
 * Only 'confirmed' | 'waitlisted' | 'rejected' outcomes carry a registrationId.
 */
export function isPersistedRegistrationOutcome(
  outcome: RegistrationOutcome,
): outcome is Extract<RegistrationOutcome, { registrationId: string }> {
  return outcome.kind === 'confirmed' || outcome.kind === 'waitlisted' || outcome.kind === 'rejected'
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}
