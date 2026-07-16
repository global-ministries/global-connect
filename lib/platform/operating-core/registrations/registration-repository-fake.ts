/**
 * S09 — in-memory fake implementation of RegistrationsRepository.
 * For unit tests only — no Supabase adapter in this slice.
 * Mirrors S04 pattern: services-repository-fake.ts.
 */
import { canTransition, REGISTRATION_TRANSITIONS, type RegistrationState } from '../state'
import { OperatingCoreConcurrencyConflictError } from '../errors'
import type { Registration } from './registration-repository'
import type {
  CreateRegistrationInput,
  DenyManualRegistrationInput,
  RegistrationOutcome,
} from './registration-state'
import {
  evaluateRegistrationOutcome,
  canDenyManualRegistration,
} from './registration-state'
import type { RegistrationsRepository } from './registration-repository'

export interface InMemoryRegistrationsRepositoryOptions {
  readonly seed?: ReadonlyArray<Registration>
}

export function createInMemoryRegistrationsRepository(
  options: InMemoryRegistrationsRepositoryOptions = {},
): RegistrationsRepository {
  // Primary storage: id → Registration
  const registrations: Registration[] = options.seed ? [...options.seed] : []

  // Secondary index: `${personaId}+${eventId}` → id (for idempotency checks)
  type PersonEventKey = string
  const personEventIndex = new Map<PersonEventKey, string>()

  // Build index from seed data
  for (const reg of registrations) {
    personEventIndex.set(keyFor(reg.personaId, reg.eventId), reg.id)
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function keyFor(personaId: string, eventId: string): PersonEventKey {
    return `${personaId}+${eventId}`
  }

  function isTerminal(state: RegistrationState): boolean {
    // Terminal states have no valid outbound transitions in REGISTRATION_TRANSITIONS
    return REGISTRATION_TRANSITIONS[state].size === 0
  }

  function isActive(reg: Registration): boolean {
    return !isTerminal(reg.state)
  }

  function requireRegistration(id: string): Registration {
    const found = registrations.find((r) => r.id === id)
    if (!found) {
      throw new Error(`Registration ${id} not found`)
    }
    return found
  }

  function storeRegistration(reg: Registration): void {
    registrations.push(reg)
    if (isActive(reg)) {
      personEventIndex.set(keyFor(reg.personaId, reg.eventId), reg.id)
    }
  }

  function updateRegistration(id: string, updated: Registration): void {
    const index = registrations.findIndex((r) => r.id === id)
    if (index === -1) throw new Error(`Registration ${id} not found`)
    registrations[index] = updated

    // Update index if still active, otherwise remove
    if (isActive(updated)) {
      personEventIndex.set(keyFor(updated.personaId, updated.eventId), updated.id)
    } else {
      // Only remove from index if this registration is the current indexed one
      const currentKey = keyFor(updated.personaId, updated.eventId)
      if (personEventIndex.get(currentKey) === id) {
        personEventIndex.delete(currentKey)
      }
    }
  }

  function now(): string {
    return new Date().toISOString()
  }

  // ---------------------------------------------------------------------------
  // Repository methods
  // ---------------------------------------------------------------------------

  return {
    async create(input: CreateRegistrationInput): Promise<RegistrationOutcome> {
      const { personaId, eventId } = input

      // Idempotency check: reject if active registration exists for (personaId, eventId)
      // Use the index directly (not method call) because the object is still being constructed
      const existingId = personEventIndex.get(keyFor(personaId, eventId))
      if (existingId) {
        const existingReg = registrations.find((r) => r.id === existingId)
        if (existingReg && isActive(existingReg)) {
          return {
            kind: 'irreconcilable_idempotency',
            personaId,
            eventId,
          }
        }
      }

      // Evaluate the domain outcome
      const outcome = evaluateRegistrationOutcome(input)

      // capacity_conflict is not persisted
      if (outcome.kind === 'capacity_conflict') {
        return outcome
      }

      // Persist the registration
      const capturedAt = now()
      const newReg: Registration = {
        id: outcome.registrationId,
        personaId,
        eventId,
        state: outcome.state,
        waitlistPosition: outcome.kind === 'waitlisted' ? outcome.waitlistPosition : null,
        confirmationMode: input.confirmationMode,
        capturedAt,
        version: 1,
      }

      storeRegistration(newReg)
      return outcome
    },

    async findById(id: string): Promise<Registration | null> {
      return registrations.find((r) => r.id === id) ?? null
    },

    async findActiveByPersonaAndEvent(personaId: string, eventId: string): Promise<Registration | null> {
      const id = personEventIndex.get(keyFor(personaId, eventId))
      if (!id) return null
      const reg = registrations.find((r) => r.id === id)
      if (!reg) return null
      return isActive(reg) ? reg : null
    },

    async listByEvent(
      eventId: string,
      filter?: { state?: RegistrationState; includeWaitlist?: boolean },
    ): Promise<readonly Registration[]> {
      let result = registrations.filter((r) => r.eventId === eventId)
      if (filter?.state) {
        result = result.filter((r) => r.state === filter.state)
      }
      if (filter?.includeWaitlist === false) {
        result = result.filter((r) => r.waitlistPosition === null)
      }
      return result
    },

    async listWaitlist(eventId: string): Promise<readonly Registration[]> {
      return registrations
        .filter((r) => r.eventId === eventId && r.state === 'pendiente' && r.waitlistPosition !== null)
        .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0))
    },

    async transition(
      id: string,
      expectedVersion: number,
      to: RegistrationState,
      _motivo?: string,
      _actorPersonaId?: string,
    ): Promise<{ outcome: RegistrationOutcome; registration: Registration }> {
      const current = requireRegistration(id)

      // Optimistic concurrency check
      if (current.version !== expectedVersion) {
        throw new OperatingCoreConcurrencyConflictError(
          `expectedVersion ${expectedVersion} does not match current version ${current.version}`,
          { id, expectedVersion, currentVersion: current.version },
        )
      }

      // Validate transition using S02 state machine
      if (!canTransition(current.state, to)) {
        return {
          outcome: { kind: 'invalid_transition', from: current.state, to },
          registration: current,
        }
      }

      const updated: Registration = {
        ...current,
        state: to,
        version: current.version + 1,
      }

      updateRegistration(id, updated)
      return {
        outcome: { kind: 'confirmed', registrationId: id, state: to },
        registration: updated,
      }
    },

    async cancel(
      id: string,
      expectedVersion: number,
      _motivo: string,
      _actorPersonaId: string,
    ): Promise<{ cancelled: Registration; promoted: Registration | null }> {
      const current = requireRegistration(id)

      // Optimistic concurrency check
      if (current.version !== expectedVersion) {
        throw new OperatingCoreConcurrencyConflictError(
          `expectedVersion ${expectedVersion} does not match current version ${current.version}`,
          { id, expectedVersion, currentVersion: current.version },
        )
      }

      // Transition to cancelada
      const cancelled: Registration = {
        ...current,
        state: 'cancelada',
        version: current.version + 1,
      }
      updateRegistration(id, cancelled)

      let promoted: Registration | null = null

      // If the cancelled registration was 'confirmada', promote next waitlist entry
      if (current.state === 'confirmada') {
        const waitlist = await this.listWaitlist(current.eventId)
        if (waitlist.length > 0) {
          const nextUp = waitlist[0] // position 1 is always first after sorting
          const promotedReg: Registration = {
            ...nextUp,
            state: 'confirmada',
            waitlistPosition: null,
            version: nextUp.version + 1,
          }
          updateRegistration(nextUp.id, promotedReg)
          promoted = promotedReg

          // Re-number remaining waitlist positions
          const remaining = await this.listWaitlist(current.eventId)
          for (let i = 0; i < remaining.length; i++) {
            const reg = remaining[i]
            if (reg.waitlistPosition !== i + 1) {
              updateRegistration(reg.id, { ...reg, waitlistPosition: i + 1 })
            }
          }
        }
      }

      return { cancelled, promoted }
    },

    async deny(input: DenyManualRegistrationInput): Promise<Registration> {
      const { registrationId, expectedVersion } = input

      const current = requireRegistration(registrationId)

      // Optimistic concurrency check
      if (current.version !== expectedVersion) {
        throw new OperatingCoreConcurrencyConflictError(
          `expectedVersion ${expectedVersion} does not match current version ${current.version}`,
          { registrationId, expectedVersion, currentVersion: current.version },
        )
      }

      // Validate preconditions: only pendiente + manual can be denied
      if (!canDenyManualRegistration({ state: current.state, confirmationMode: current.confirmationMode })) {
        throw new Error(
          `Cannot deny registration ${registrationId}: state=${current.state}, confirmationMode=${current.confirmationMode}`,
        )
      }

      const updated: Registration = {
        ...current,
        state: 'rechazada',
        version: current.version + 1,
      }

      updateRegistration(registrationId, updated)
      return updated
    },

    async promoteFromWaitlist(eventId: string, slotsAvailable: number): Promise<readonly Registration[]> {
      if (slotsAvailable <= 0) return []

      const waitlist = await this.listWaitlist(eventId)
      if (waitlist.length === 0) return []

      const toPromote = waitlist.slice(0, slotsAvailable)
      const promoted: Registration[] = []

      for (const reg of toPromote) {
        const updated: Registration = {
          ...reg,
          state: 'confirmada',
          waitlistPosition: null,
          version: reg.version + 1,
        }
        updateRegistration(reg.id, updated)
        promoted.push(updated)
      }

      // Re-number remaining waitlist positions
      const remaining = await this.listWaitlist(eventId)
      for (let i = 0; i < remaining.length; i++) {
        const reg = remaining[i]
        if (reg.waitlistPosition !== i + 1) {
          updateRegistration(reg.id, { ...reg, waitlistPosition: i + 1 })
        }
      }

      return promoted
    },
  }
}
