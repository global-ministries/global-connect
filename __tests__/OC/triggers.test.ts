/**
 * S18 — Operating Core notification triggers: behavior tests
 * RED first: tests describe what each trigger MUST do
 */

import {
  triggerOnRegistrationConfirmed,
  triggerOnWaitlistPlaced,
  triggerOnWaitlistPromoted,
  triggerOnCancellationToLeader,
  triggerOnEventReminder,
  triggerOnNoShow,
  type TriggerContext,
} from '../../lib/platform/operating-core/notifications/triggers'


const baseEvent = {
  id: 'evt_123',
  title: 'Grupo de Vida',
  starts_at: '2026-07-25T19:00:00Z',
  location: 'Campus Central',
}

const basePersona = {
  id: 'per_456',
  displayName: 'María García',
}

// --- triggerOnRegistrationConfirmed ---
describe('triggerOnRegistrationConfirmed', () => {
  test('fires when persona is provided', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: basePersona,
      now: '2026-07-20T10:00:00Z',
    }

    const result = triggerOnRegistrationConfirmed(ctx)

    expect(result.triggered).toBe(true)
    if (result.triggered && result.templateKey === 'registration_confirmed') {
      expect(result.props.personaName).toBe('María García')
      expect(result.props.eventName).toBe('Grupo de Vida')
    }
  })

  test('does not fire when persona is missing', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: undefined,
      now: '2026-07-20T10:00:00Z',
    }

    const result = triggerOnRegistrationConfirmed(ctx)

    expect(result.triggered).toBe(false)
    if (!result.triggered) {
      expect(result.reason).toBeDefined()
    }
  })

  test('fires exactly once per outcome (idempotent check)', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: basePersona,
      now: '2026-07-20T10:00:00Z',
    }

    const first = triggerOnRegistrationConfirmed(ctx)
    const second = triggerOnRegistrationConfirmed(ctx)

    expect(first.triggered).toBe(true)
    expect(second.triggered).toBe(true)
  })
})

// --- triggerOnWaitlistPlaced ---
describe('triggerOnWaitlistPlaced', () => {
  test('fires when waitlistPosition is provided and > 0', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: { ...basePersona, waitlistPosition: 3 },
      now: '2026-07-20T10:00:00Z',
    }

    const result = triggerOnWaitlistPlaced(ctx)

    expect(result.triggered).toBe(true)
    if (result.triggered && result.templateKey === 'waitlist_placed') {
      expect(result.props.waitlistPosition).toBe(3)
      expect(result.props.personaName).toBe('María García')
    }
  })

  test('does not fire when waitlistPosition is missing', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: basePersona,
      now: '2026-07-20T10:00:00Z',
    }

    const result = triggerOnWaitlistPlaced(ctx)

    expect(result.triggered).toBe(false)
    if (!result.triggered) {
      expect(result.reason).toContain('waitlistPosition')
    }
  })

  test('does not fire when waitlistPosition is 0', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: { ...basePersona, waitlistPosition: 0 },
      now: '2026-07-20T10:00:00Z',
    }

    const result = triggerOnWaitlistPlaced(ctx)

    expect(result.triggered).toBe(false)
  })
})

// --- triggerOnWaitlistPromoted ---
describe('triggerOnWaitlistPromoted', () => {
  test('fires when wasPromoted is true', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: basePersona,
      wasPromoted: true,
      now: '2026-07-20T10:00:00Z',
    }

    const result = triggerOnWaitlistPromoted(ctx)

    expect(result.triggered).toBe(true)
    if (result.triggered && result.templateKey === 'waitlist_promoted') {
      expect(result.props.personaName).toBe('María García')
    }
  })

  test('does not fire when wasPromoted is false', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: basePersona,
      wasPromoted: false,
      now: '2026-07-20T10:00:00Z',
    }

    const result = triggerOnWaitlistPromoted(ctx)

    expect(result.triggered).toBe(false)
    if (!result.triggered) {
      expect(result.reason).toContain('promoted')
    }
  })

  test('does not fire when wasPromoted is undefined', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: basePersona,
      now: '2026-07-20T10:00:00Z',
    }

    const result = triggerOnWaitlistPromoted(ctx)

    expect(result.triggered).toBe(false)
  })
})

// --- triggerOnCancellationToLeader ---
describe('triggerOnCancellationToLeader', () => {
  test('fires when leader is provided', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      leader: { id: 'ldr_789', displayName: 'Roberto Mendoza' },
      cancelledPersonaName: 'Laura Sánchez',
      cancellationReason: 'Motivos personales',
      now: '2026-07-20T10:00:00Z',
    }

    const result = triggerOnCancellationToLeader(ctx)

    expect(result.triggered).toBe(true)
    if (result.triggered && result.templateKey === 'cancellation_leader') {
      expect(result.props.leaderName).toBe('Roberto Mendoza')
      expect(result.props.cancelledPersonaName).toBe('Laura Sánchez')
      expect(result.props.reason).toBe('Motivos personales')
    }
  })

  test('does not fire when leader is missing', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      cancelledPersonaName: 'Laura Sánchez',
      cancellationReason: 'Motivos personales',
      now: '2026-07-20T10:00:00Z',
    }

    const result = triggerOnCancellationToLeader(ctx)

    expect(result.triggered).toBe(false)
    if (!result.triggered) {
      expect(result.reason).toContain('leader')
    }
  })
})

// --- triggerOnEventReminder ---
describe('triggerOnEventReminder', () => {
  test('fires when hoursUntil is between 0 and 24 (default T-24h)', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: basePersona,
      hoursUntil: 24,
      now: '2026-07-24T19:00:00Z',
    }

    const result = triggerOnEventReminder(ctx)

    expect(result.triggered).toBe(true)
    if (result.triggered && result.templateKey === 'event_reminder') {
      expect(result.props.hoursUntil).toBe(24)
    }
  })

  test('fires when hoursUntil is less than 24 but greater than 0', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: basePersona,
      hoursUntil: 12,
      now: '2026-07-25T07:00:00Z',
    }

    const result = triggerOnEventReminder(ctx)

    expect(result.triggered).toBe(true)
  })

  test('does not fire when hoursUntil is 0', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: basePersona,
      hoursUntil: 0,
      now: '2026-07-25T19:00:00Z',
    }

    const result = triggerOnEventReminder(ctx)

    expect(result.triggered).toBe(false)
  })

  test('does not fire when hoursUntil is greater than 24', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: basePersona,
      hoursUntil: 48,
      now: '2026-07-23T19:00:00Z',
    }

    const result = triggerOnEventReminder(ctx)

    expect(result.triggered).toBe(false)
  })

  test('does not fire when hoursUntil is missing', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: basePersona,
      now: '2026-07-24T19:00:00Z',
    }

    const result = triggerOnEventReminder(ctx)

    expect(result.triggered).toBe(false)
  })
})

// --- triggerOnNoShow ---
describe('triggerOnNoShow', () => {
  test('fires when wasNoShow is true', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: basePersona,
      wasNoShow: true,
      now: '2026-07-26T10:00:00Z',
    }

    const result = triggerOnNoShow(ctx)

    expect(result.triggered).toBe(true)
    if (result.triggered && result.templateKey === 'no_show') {
      expect(result.props.personaName).toBe('María García')
    }
  })

  test('does not fire when wasNoShow is false', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: basePersona,
      wasNoShow: false,
      now: '2026-07-26T10:00:00Z',
    }

    const result = triggerOnNoShow(ctx)

    expect(result.triggered).toBe(false)
    if (!result.triggered) {
      expect(result.reason).toContain('no-show')
    }
  })

  test('does not fire when wasNoShow is undefined', () => {
    const ctx: TriggerContext = {
      event: baseEvent,
      persona: basePersona,
      now: '2026-07-26T10:00:00Z',
    }

    const result = triggerOnNoShow(ctx)

    expect(result.triggered).toBe(false)
  })
})
