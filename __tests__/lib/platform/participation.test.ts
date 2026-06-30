import {
  PLATFORM_PARTICIPATION_EVENT_TYPES,
  PLATFORM_PARTICIPATION_SENSITIVITY_LEVELS,
  PLATFORM_PARTICIPATION_SENSITIVITY,
  PLATFORM_PARTICIPATION_RETENTION,
  canReadPlatformParticipationEvent,
  type PlatformParticipationEvent,
  type PlatformParticipationEventType,
  type PlatformParticipationEventSensitivity,
  type PlatformParticipationReadActor,
  type PlatformParticipationCapability,
} from '@/lib/platform/participation'

/**
 * Build a baseline PlatformParticipationEvent for tests.
 * Defaults to a non-sensitive (internal) attendance event authored by
 * a different persona; individual tests override the fields they care about.
 */
function makeEvent(overrides: Partial<PlatformParticipationEvent> = {}): PlatformParticipationEvent {
  const base: PlatformParticipationEvent = {
    eventType: 'attendance',
    source: 'app.grupos_vida',
    occurredAt: new Date('2026-06-30T12:00:00.000Z'),
    scope: { experience: 'grupos_vida', scopeType: 'grupo' },
    actorPersonaId: 'persona-actor',
  }
  return { ...base, ...overrides }
}

function makeActor(personaId: string | null | undefined): PlatformParticipationReadActor | null {
  if (personaId === null || personaId === undefined) return null
  return { personaId }
}

describe('lib/platform/participation', () => {
  describe('PLATFORM_PARTICIPATION_EVENT_TYPES', () => {
    it('exposes the 7 event types in the canonical order from the brief', () => {
      expect(PLATFORM_PARTICIPATION_EVENT_TYPES).toEqual([
        'attendance',
        'service',
        'taller_participation',
        'group_join',
        'group_leave',
        'family_consent',
        'contact_authorization',
      ])
    })

    it('infers a literal-union type from the constant', () => {
      const value: PlatformParticipationEventType = 'attendance'
      expect(value).toBe('attendance')
      const all: PlatformParticipationEventType[] = [...PLATFORM_PARTICIPATION_EVENT_TYPES]
      expect(all).toHaveLength(7)
    })
  })

  describe('PLATFORM_PARTICIPATION_SENSITIVITY_LEVELS', () => {
    it('exposes the 3 sensitivity levels in public/internal/sensitive order', () => {
      expect(PLATFORM_PARTICIPATION_SENSITIVITY_LEVELS).toEqual(['public', 'internal', 'sensitive'])
    })

    it('infers a literal-union type from the constant', () => {
      const value: PlatformParticipationEventSensitivity = 'sensitive'
      expect(value).toBe('sensitive')
    })
  })

  describe('PLATFORM_PARTICIPATION_SENSITIVITY map', () => {
    it('classifies family_consent and contact_authorization as sensitive', () => {
      expect(PLATFORM_PARTICIPATION_SENSITIVITY.family_consent).toBe('sensitive')
      expect(PLATFORM_PARTICIPATION_SENSITIVITY.contact_authorization).toBe('sensitive')
    })

    it('classifies attendance, service, taller_participation, group_join and group_leave as internal', () => {
      expect(PLATFORM_PARTICIPATION_SENSITIVITY.attendance).toBe('internal')
      expect(PLATFORM_PARTICIPATION_SENSITIVITY.service).toBe('internal')
      expect(PLATFORM_PARTICIPATION_SENSITIVITY.taller_participation).toBe('internal')
      expect(PLATFORM_PARTICIPATION_SENSITIVITY.group_join).toBe('internal')
      expect(PLATFORM_PARTICIPATION_SENSITIVITY.group_leave).toBe('internal')
    })

    it('covers every PlatformParticipationEventType key exactly once', () => {
      for (const eventType of PLATFORM_PARTICIPATION_EVENT_TYPES) {
        expect(PLATFORM_PARTICIPATION_SENSITIVITY[eventType]).toBeDefined()
        expect(typeof PLATFORM_PARTICIPATION_SENSITIVITY[eventType]).toBe('string')
      }
      expect(Object.keys(PLATFORM_PARTICIPATION_SENSITIVITY)).toHaveLength(PLATFORM_PARTICIPATION_EVENT_TYPES.length)
    })
  })

  describe('PLATFORM_PARTICIPATION_RETENTION map', () => {
    it('covers every PlatformParticipationEventType key exactly once', () => {
      for (const eventType of PLATFORM_PARTICIPATION_EVENT_TYPES) {
        expect(PLATFORM_PARTICIPATION_RETENTION[eventType]).toBeDefined()
      }
      expect(Object.keys(PLATFORM_PARTICIPATION_RETENTION)).toHaveLength(PLATFORM_PARTICIPATION_EVENT_TYPES.length)
    })

    it('exposes positive minDays for every event type', () => {
      for (const eventType of PLATFORM_PARTICIPATION_EVENT_TYPES) {
        const retention = PLATFORM_PARTICIPATION_RETENTION[eventType]
        expect(typeof retention.minDays).toBe('number')
        expect(retention.minDays).toBeGreaterThan(0)
      }
    })

    it('keeps maxDays >= minDays for every event type', () => {
      for (const eventType of PLATFORM_PARTICIPATION_EVENT_TYPES) {
        const retention = PLATFORM_PARTICIPATION_RETENTION[eventType]
        expect(retention.maxDays).toBeGreaterThanOrEqual(retention.minDays)
      }
    })

    it('marks sensitive types with requiresExplicitConsentToRetain=true', () => {
      expect(PLATFORM_PARTICIPATION_RETENTION.family_consent.requiresExplicitConsentToRetain).toBe(true)
      expect(PLATFORM_PARTICIPATION_RETENTION.contact_authorization.requiresExplicitConsentToRetain).toBe(true)
    })

    it('marks internal types with requiresExplicitConsentToRetain=false', () => {
      const internalTypes: PlatformParticipationEventType[] = [
        'attendance',
        'service',
        'taller_participation',
        'group_join',
        'group_leave',
      ]
      for (const eventType of internalTypes) {
        expect(PLATFORM_PARTICIPATION_RETENTION[eventType].requiresExplicitConsentToRetain).toBe(false)
      }
    })
  })

  describe('canReadPlatformParticipationEvent', () => {
    describe('input validation', () => {
      it('denies with no_event when event is null', () => {
        const result = canReadPlatformParticipationEvent({
          actor: makeActor('persona-actor'),
          event: null,
          capabilities: [],
        })
        expect(result).toEqual({ allowed: false, reason: 'no_event' })
      })

      it('denies with no_event when event is undefined', () => {
        const result = canReadPlatformParticipationEvent({
          actor: makeActor('persona-actor'),
          event: undefined,
          capabilities: [],
        })
        expect(result).toEqual({ allowed: false, reason: 'no_event' })
      })

      it('denies with no_actor when actor is null', () => {
        const result = canReadPlatformParticipationEvent({
          actor: null,
          event: makeEvent(),
          capabilities: [],
        })
        expect(result).toEqual({ allowed: false, reason: 'no_actor' })
      })

      it('denies with no_actor when actor is undefined', () => {
        const result = canReadPlatformParticipationEvent({
          actor: undefined,
          event: makeEvent(),
          capabilities: [],
        })
        expect(result).toEqual({ allowed: false, reason: 'no_actor' })
      })

      it('denies with no_actor when actor personaId is blank', () => {
        const result = canReadPlatformParticipationEvent({
          actor: { personaId: '   ' },
          event: makeEvent(),
          capabilities: [],
        })
        expect(result).toEqual({ allowed: false, reason: 'no_actor' })
      })
    })

    describe('self-access', () => {
      it('allows with self when actor.personaId equals event.actorPersonaId', () => {
        const event = makeEvent({ actorPersonaId: 'persona-self' })
        const result = canReadPlatformParticipationEvent({
          actor: { personaId: 'persona-self' },
          event,
          capabilities: [],
        })
        expect(result).toEqual({ allowed: true, reason: 'self' })
      })

      it('prefers self over the scoped_capability path', () => {
        const event = makeEvent({ actorPersonaId: 'persona-self' })
        const capability: PlatformParticipationCapability = {
          key: 'grupos_vida.participation.read',
          experience: 'grupos_vida',
          scopeType: 'grupo',
          scopeId: 'grupo-1',
          source: 'app.grupos_vida',
        }
        const result = canReadPlatformParticipationEvent({
          actor: { personaId: 'persona-self' },
          event,
          capabilities: [capability],
        })
        expect(result).toEqual({ allowed: true, reason: 'self' })
      })
    })

    describe('non-sensitive events', () => {
      const event = makeEvent({
        eventType: 'attendance',
        source: 'app.grupos_vida',
        scope: { experience: 'grupos_vida', scopeType: 'grupo', scopeId: 'grupo-1' },
        actorPersonaId: 'persona-owner',
      })

      it('allows with scoped_capability when capability matches experience+scopeType+scopeId', () => {
        const capability: PlatformParticipationCapability = {
          key: 'grupos_vida.participation.read',
          experience: 'grupos_vida',
          scopeType: 'grupo',
          scopeId: 'grupo-1',
          source: 'app.grupos_vida',
        }
        const result = canReadPlatformParticipationEvent({
          actor: { personaId: 'persona-other' },
          event,
          capabilities: [capability],
        })
        expect(result).toEqual({ allowed: true, reason: 'scoped_capability' })
      })

      it('denies with insufficient_scope when no capability matches the event scope', () => {
        const capability: PlatformParticipationCapability = {
          key: 'grupos_vida.participation.read',
          experience: 'dps',
          scopeType: 'grupo',
          scopeId: 'grupo-1',
          source: 'app.dps',
        }
        const result = canReadPlatformParticipationEvent({
          actor: { personaId: 'persona-other' },
          event,
          capabilities: [capability],
        })
        expect(result).toEqual({ allowed: false, reason: 'insufficient_scope' })
      })

      it('denies with insufficient_scope when capabilities list is empty', () => {
        const result = canReadPlatformParticipationEvent({
          actor: { personaId: 'persona-other' },
          event,
          capabilities: [],
        })
        expect(result).toEqual({ allowed: false, reason: 'insufficient_scope' })
      })
    })

    describe('sensitive events', () => {
      const sensitiveEvent = makeEvent({
        eventType: 'family_consent',
        source: 'app.family',
        scope: { experience: 'family', scopeType: 'minor', scopeId: 'minor-1' },
        actorPersonaId: 'persona-owner',
      })

      it('allows with scoped_capability when capability matches experience+scopeType+scopeId', () => {
        const capability: PlatformParticipationCapability = {
          key: 'family.consent.read',
          experience: 'family',
          scopeType: 'minor',
          scopeId: 'minor-1',
          source: 'app.family',
        }
        const result = canReadPlatformParticipationEvent({
          actor: { personaId: 'persona-other' },
          event: sensitiveEvent,
          capabilities: [capability],
        })
        expect(result).toEqual({ allowed: true, reason: 'scoped_capability' })
      })

      it('denies with sensitive_no_capability when no capability matches the event scope', () => {
        const capability: PlatformParticipationCapability = {
          key: 'family.contact_authorization.read',
          experience: 'family',
          scopeType: 'minor',
          scopeId: 'minor-2',
          source: 'app.family',
        }
        const result = canReadPlatformParticipationEvent({
          actor: { personaId: 'persona-other' },
          event: sensitiveEvent,
          capabilities: [capability],
        })
        expect(result).toEqual({ allowed: false, reason: 'sensitive_no_capability' })
      })

      it('denies with sensitive_no_capability when capabilities list is empty', () => {
        const result = canReadPlatformParticipationEvent({
          actor: { personaId: 'persona-other' },
          event: sensitiveEvent,
          capabilities: [],
        })
        expect(result).toEqual({ allowed: false, reason: 'sensitive_no_capability' })
      })
    })

    describe('capability matching edge cases', () => {
      const baseEvent = makeEvent({
        eventType: 'service',
        source: 'app.dps',
        scope: { experience: 'dps', scopeType: 'service' },
      })

      it('matches when capability has experience+scopeType+scopeId equal to the event', () => {
        const event = makeEvent({
          scope: { experience: 'dps', scopeType: 'service', scopeId: 'service-42' },
        })
        const capability: PlatformParticipationCapability = {
          key: 'dps.service.read',
          experience: 'dps',
          scopeType: 'service',
          scopeId: 'service-42',
          source: 'app.dps',
        }
        const result = canReadPlatformParticipationEvent({
          actor: { personaId: 'persona-other' },
          event,
          capabilities: [capability],
        })
        expect(result.allowed).toBe(true)
      })

      it('matches when capability scopeId is undefined and event scopeId is undefined', () => {
        const event = makeEvent({ scope: { experience: 'dps', scopeType: 'service' } })
        const capability: PlatformParticipationCapability = {
          key: 'dps.service.read',
          experience: 'dps',
          scopeType: 'service',
          source: 'app.dps',
        }
        const result = canReadPlatformParticipationEvent({
          actor: { personaId: 'persona-other' },
          event,
          capabilities: [capability],
        })
        expect(result.allowed).toBe(true)
      })

      it('does not match when capability scopeId differs from event scopeId', () => {
        const event = makeEvent({
          scope: { experience: 'dps', scopeType: 'service', scopeId: 'service-1' },
        })
        const capability: PlatformParticipationCapability = {
          key: 'dps.service.read',
          experience: 'dps',
          scopeType: 'service',
          scopeId: 'service-2',
          source: 'app.dps',
        }
        const result = canReadPlatformParticipationEvent({
          actor: { personaId: 'persona-other' },
          event,
          capabilities: [capability],
        })
        expect(result).toEqual({ allowed: false, reason: 'insufficient_scope' })
        expect(baseEvent.eventType).toBe('service')
      })

      it('does not match when capability experience differs from event experience', () => {
        const event = makeEvent({
          scope: { experience: 'dps', scopeType: 'service', scopeId: 'service-1' },
        })
        const capability: PlatformParticipationCapability = {
          key: 'next_gen.service.read',
          experience: 'next_gen',
          scopeType: 'service',
          scopeId: 'service-1',
          source: 'app.next_gen',
        }
        const result = canReadPlatformParticipationEvent({
          actor: { personaId: 'persona-other' },
          event,
          capabilities: [capability],
        })
        expect(result.allowed).toBe(false)
      })

      it('does not match when capability scopeType differs from event scopeType', () => {
        const event = makeEvent({
          scope: { experience: 'dps', scopeType: 'service', scopeId: 'x' },
        })
        const capability: PlatformParticipationCapability = {
          key: 'dps.event.read',
          experience: 'dps',
          scopeType: 'event',
          scopeId: 'x',
          source: 'app.dps',
        }
        const result = canReadPlatformParticipationEvent({
          actor: { personaId: 'persona-other' },
          event,
          capabilities: [capability],
        })
        expect(result.allowed).toBe(false)
      })
    })

    describe('denial never reveals sensitive contents', () => {
      it('returns the discriminated denial without echoing event content', () => {
        const secretEvent = makeEvent({
          eventType: 'contact_authorization',
          source: 'app.family',
          scope: { experience: 'family', scopeType: 'contact', scopeId: 'contact-secret' },
          actorPersonaId: 'persona-owner',
        })
        const result = canReadPlatformParticipationEvent({
          actor: { personaId: 'persona-other' },
          event: secretEvent,
          capabilities: [],
        })
        // Only the denial discriminator may leak; the event payload must not.
        const keys = Object.keys(result)
        expect(keys).toEqual(['allowed', 'reason'])
        expect(result.reason).not.toBe('no_event')
        expect(result.reason).not.toBe('no_actor')
      })
    })
  })
})
