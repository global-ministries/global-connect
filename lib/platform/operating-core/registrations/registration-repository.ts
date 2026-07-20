/**
 * S09 — RegistrationsRepository interface
 * Contract for registration lifecycle persistence with idempotency and waitlist support.
 */
import type { RegistrationState } from '../state'
import type {
  CreateRegistrationInput,
  DenyManualRegistrationInput,
  RegistrationOutcome,
} from './registration-state'

// ---------------------------------------------------------------------------
// Registration entity
// ---------------------------------------------------------------------------

export interface Registration {
  id: string
  personaId: string
  eventId: string
  state: RegistrationState
  /** 1-based; null if not on waitlist */
  waitlistPosition: number | null
  confirmationMode: 'automatic' | 'manual'
  capturedAt: string
  version: number
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface RegistrationsRepository {
  /**
   * Create a new registration with idempotency check.
   * - If (persona_id, event_id) already has a non-terminal registration → returns irreconcilable_idempotency
   * - If automatic + capacity available → returns confirmed + state 'confirmada'
   * - If automatic + full + waitlistable → returns waitlisted + state 'pendiente'
   * - If automatic + full + NOT waitlistable → returns capacity_conflict
   * - If manual → returns confirmed + state 'pendiente'
   */
  create(input: CreateRegistrationInput): Promise<RegistrationOutcome>

  findById(id: string): Promise<Registration | null>

  /**
   * Find the active (non-terminal) registration for (persona_id, event_id).
   * Returns null if none exists or if the existing registration is in a terminal state.
   */
  findActiveByPersonaAndEvent(personaId: string, eventId: string): Promise<Registration | null>

  listByEvent(
    eventId: string,
    filter?: { state?: RegistrationState; includeWaitlist?: boolean },
  ): Promise<readonly Registration[]>

  /** Returns all pendiente registrations for the event sorted by waitlistPosition. */
  listWaitlist(eventId: string): Promise<readonly Registration[]>

  /**
   * Transition a registration to a new state with optimistic concurrency.
   * @throws OperatingCoreConcurrencyConflictError if expectedVersion does not match
   * @returns outcome (may be invalid_transition if the transition is not allowed by the state machine)
   */
  transition(
    id: string,
    expectedVersion: number,
    to: RegistrationState,
    motivo?: string,
    actorPersonaId?: string,
  ): Promise<{ outcome: RegistrationOutcome; registration: Registration }>

  /**
   * Cancel a registration.
   * - Transitions the registration to 'cancelada'.
   * - If the cancelled registration was 'confirmada', promotes the next eligible waitlist entry (position 1) to 'confirmada'.
   * - Returns the cancelled registration and the promoted one (or null if no promotion).
   */
  cancel(
    id: string,
    expectedVersion: number,
    motivo: string,
    actorPersonaId: string,
  ): Promise<{ cancelled: Registration; promoted: Registration | null }>

  /**
   * Manually deny a 'pendiente' registration on a 'manual' event.
   * Transitions to 'rechazada' and records the operator.
   * @throws OperatingCoreConcurrencyConflictError if expectedVersion does not match
   */
  deny(input: DenyManualRegistrationInput): Promise<Registration>

  /**
   * Bulk promote N waitlist entries for an event.
   * Picks the first N registrations from the waitlist (sorted by position) and transitions them to 'confirmada'.
   * @returns the promoted registrations (length <= slotsAvailable)
   */
  promoteFromWaitlist(eventId: string, slotsAvailable: number): Promise<readonly Registration[]>
}
