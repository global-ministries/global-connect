import {
  canReadPlatformParticipationEvent,
  type PlatformParticipationEvent,
} from '@/lib/platform/participation'
import { ParticipationInMemoryAdapter } from '@/lib/platform/adapters/participation-adapter'

/**
 * Integration coverage for the spec `platform-participation-history` scenarios.
 *
 * These tests drive the read-only `PlatformParticipationReadRepository` contract
 * through the `ParticipationInMemoryAdapter` fake and prove the guard
 * (`canReadPlatformParticipationEvent`) applies authorization end-to-end without
 * the adapter ever acting as an authorization gate (separation of concerns).
 */

function makeTallerEvent(
  overrides: Partial<PlatformParticipationEvent> = {},
): PlatformParticipationEvent {
  const base: PlatformParticipationEvent = {
    eventType: 'taller_participation',
    source: 'app.talleres_crecimiento',
    occurredAt: new Date('2026-06-01T00:00:00.000Z'),
    scope: { experience: 'talleres_crecimiento', scopeType: 'taller', scopeId: 'de-hombre-a-hombre' },
    actorPersonaId: 'persona-juan',
  }
  return { ...base, ...overrides }
}

function makeGroupEvent(
  overrides: Partial<PlatformParticipationEvent> = {},
): PlatformParticipationEvent {
  const base: PlatformParticipationEvent = {
    eventType: 'group_join',
    source: 'app.grupos_vida',
    occurredAt: new Date('2026-06-02T00:00:00.000Z'),
    scope: { experience: 'grupos_vida', scopeType: 'grupo', scopeId: 'grupo-1' },
    actorPersonaId: 'persona-maria',
  }
  return { ...base, ...overrides }
}

function makeServiceEvent(
  overrides: Partial<PlatformParticipationEvent> = {},
): PlatformParticipationEvent {
  const base: PlatformParticipationEvent = {
    eventType: 'service',
    source: 'app.dps',
    occurredAt: new Date('2026-06-03T00:00:00.000Z'),
    scope: { experience: 'dps', scopeType: 'service', scopeId: 'service-42' },
    actorPersonaId: 'persona-other',
  }
  return { ...base, ...overrides }
}

describe('participation-integration (spec platform-participation-history)', () => {
  describe('Scenario: Evento transversal', () => {
    it('returns Taller participation events by actor personaId', async () => {
      const adapter = new ParticipationInMemoryAdapter([
        makeTallerEvent({ actorPersonaId: 'persona-juan' }),
        makeGroupEvent({ actorPersonaId: 'persona-maria' }),
      ])

      const events = await adapter.findEventsByActorPersonaId('persona-juan')

      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('taller_participation')
      expect(events[0].actorPersonaId).toBe('persona-juan')
    })

    it('returns Taller participation events by scope', async () => {
      const adapter = new ParticipationInMemoryAdapter([
        makeTallerEvent({ actorPersonaId: 'persona-juan' }),
        makeGroupEvent({ actorPersonaId: 'persona-maria' }),
      ])

      const events = await adapter.findEventsByScope({
        experience: 'talleres_crecimiento',
        scopeType: 'taller',
        scopeId: 'de-hombre-a-hombre',
      })

      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('taller_participation')
    })
  })

  describe('Scenario: Lectura longitudinal autorizada', () => {
    it('allows Taller event self-read with explicit actor match', () => {
      const event = makeTallerEvent({ actorPersonaId: 'persona-juan' })

      const result = canReadPlatformParticipationEvent({
        actor: { personaId: 'persona-juan' },
        event,
        capabilities: [],
      })

      expect(result).toEqual({ allowed: true, reason: 'self' })
    })

    it('allows scoped read of another persona Taller event with a matching capability', () => {
      const event = makeTallerEvent({ actorPersonaId: 'persona-juan' })

      const result = canReadPlatformParticipationEvent({
        actor: { personaId: 'persona-lider' },
        event,
        capabilities: [
          {
            key: 'talleres_crecimiento.participation.read',
            experience: 'talleres_crecimiento',
            scopeType: 'taller',
            scopeId: 'de-hombre-a-hombre',
            source: 'app.talleres_crecimiento',
          },
        ],
      })

      expect(result).toEqual({ allowed: true, reason: 'scoped_capability' })
    })
  })

  describe('Scenario: Lectura fuera de boundary', () => {
    it('denies cross-persona read without revealing event existence', () => {
      const event = makeTallerEvent({ actorPersonaId: 'persona-juan' })

      const result = canReadPlatformParticipationEvent({
        actor: { personaId: 'persona-other' },
        event,
        capabilities: [],
      })

      expect(result).toEqual({ allowed: false, reason: 'insufficient_scope' })
      expect(Object.keys(result)).toEqual(['allowed', 'reason'])
    })
  })

  describe('Scenario: No revelación de existencia de datos sensibles', () => {
    it('denies sensitive event read with no leakage of event payload', () => {
      const sensitiveEvent: PlatformParticipationEvent = {
        eventType: 'family_consent',
        source: 'app.family',
        occurredAt: new Date('2026-06-01T00:00:00.000Z'),
        scope: { experience: 'family', scopeType: 'minor', scopeId: 'minor-1' },
        actorPersonaId: 'persona-juan',
      }

      const result = canReadPlatformParticipationEvent({
        actor: { personaId: 'persona-other' },
        event: sensitiveEvent,
        capabilities: [],
      })

      expect(result.allowed).toBe(false)
      expect(result).not.toHaveProperty('event')
      expect(result).not.toHaveProperty('eventType')
      expect(Object.keys(result)).toEqual(['allowed', 'reason'])
    })
  })

  describe('Scenario: Adapter + guard end-to-end', () => {
    it('returns only authorized events when filtering by adapter + guard', async () => {
      const adapter = new ParticipationInMemoryAdapter([
        makeTallerEvent({ actorPersonaId: 'persona-juan' }),
        makeTallerEvent({ actorPersonaId: 'persona-juan' }),
        makeServiceEvent({ actorPersonaId: 'persona-other' }),
      ])

      const juanEvents = await adapter.findEventsByActorPersonaId('persona-juan')
      const readableEvents = juanEvents.filter(
        (event) =>
          canReadPlatformParticipationEvent({
            actor: { personaId: 'persona-juan' },
            event,
            capabilities: [],
          }).allowed,
      )

      expect(readableEvents).toHaveLength(2)
      expect(readableEvents.every((event) => event.eventType === 'taller_participation')).toBe(true)
    })
  })
})
