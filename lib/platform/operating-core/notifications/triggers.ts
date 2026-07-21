/**
 * S18 — Operating Core notification triggers
 * 6 trigger functions: one per template key
 */

import type {
  OperatingCoreTemplateProps,
} from './template-keys'

export type OperatingCoreTriggerOutcome =
  | {
      triggered: true
      templateKey: 'registration_confirmed'
      props: OperatingCoreTemplateProps<'registration_confirmed'>
    }
  | {
      triggered: true
      templateKey: 'waitlist_placed'
      props: OperatingCoreTemplateProps<'waitlist_placed'>
    }
  | {
      triggered: true
      templateKey: 'waitlist_promoted'
      props: OperatingCoreTemplateProps<'waitlist_promoted'>
    }
  | {
      triggered: true
      templateKey: 'cancellation_leader'
      props: OperatingCoreTemplateProps<'cancellation_leader'>
    }
  | {
      triggered: true
      templateKey: 'event_reminder'
      props: OperatingCoreTemplateProps<'event_reminder'>
    }
  | {
      triggered: true
      templateKey: 'no_show'
      props: OperatingCoreTemplateProps<'no_show'>
    }
  | { triggered: false; reason: string }

export interface TriggerContext {
  event: {
    id: string
    title: string
    starts_at: string
    location?: string
  }
  persona?: {
    id: string
    displayName: string
    waitlistPosition?: number
  }
  leader?: {
    id: string
    displayName: string
  }
  cancelledPersonaName?: string
  cancellationReason?: string
  wasPromoted?: boolean
  wasNoShow?: boolean
  hoursUntil?: number
  now: string // ISO timestamp
}

// --- triggerOnRegistrationConfirmed ---
export function triggerOnRegistrationConfirmed(
  ctx: TriggerContext
): OperatingCoreTriggerOutcome {
  if (!ctx.persona) {
    return { triggered: false, reason: 'persona required for registration confirmation' }
  }

  return {
    triggered: true,
    templateKey: 'registration_confirmed',
    props: {
      personaName: ctx.persona.displayName,
      eventName: ctx.event.title,
      eventDate: ctx.event.starts_at,
      eventLocation: ctx.event.location,
    } as OperatingCoreTemplateProps<'registration_confirmed'>,
  }
}

// --- triggerOnWaitlistPlaced ---
export function triggerOnWaitlistPlaced(
  ctx: TriggerContext
): OperatingCoreTriggerOutcome {
  if (!ctx.persona) {
    return { triggered: false, reason: 'persona required for waitlist placement' }
  }

  if (!ctx.persona.waitlistPosition || ctx.persona.waitlistPosition <= 0) {
    return {
      triggered: false,
      reason: 'waitlistPosition must be > 0',
    }
  }

  return {
    triggered: true,
    templateKey: 'waitlist_placed',
    props: {
      personaName: ctx.persona.displayName,
      eventName: ctx.event.title,
      eventDate: ctx.event.starts_at,
      waitlistPosition: ctx.persona.waitlistPosition,
    } as OperatingCoreTemplateProps<'waitlist_placed'>,
  }
}

// --- triggerOnWaitlistPromoted ---
export function triggerOnWaitlistPromoted(
  ctx: TriggerContext
): OperatingCoreTriggerOutcome {
  if (!ctx.wasPromoted) {
    return {
      triggered: false,
      reason: 'wasPromoted flag must be true for promoted trigger',
    }
  }

  if (!ctx.persona) {
    return { triggered: false, reason: 'persona required for waitlist promotion' }
  }

  return {
    triggered: true,
    templateKey: 'waitlist_promoted',
    props: {
      personaName: ctx.persona.displayName,
      eventName: ctx.event.title,
      eventDate: ctx.event.starts_at,
      eventLocation: ctx.event.location,
    } as OperatingCoreTemplateProps<'waitlist_promoted'>,
  }
}

// --- triggerOnCancellationToLeader ---
export function triggerOnCancellationToLeader(
  ctx: TriggerContext
): OperatingCoreTriggerOutcome {
  if (!ctx.leader) {
    return {
      triggered: false,
      reason: 'leader required for cancellation notification',
    }
  }

  if (!ctx.cancelledPersonaName || !ctx.cancellationReason) {
    return {
      triggered: false,
      reason: 'cancelledPersonaName and cancellationReason required',
    }
  }

  return {
    triggered: true,
    templateKey: 'cancellation_leader',
    props: {
      leaderName: ctx.leader.displayName,
      eventName: ctx.event.title,
      cancelledPersonaName: ctx.cancelledPersonaName,
      reason: ctx.cancellationReason,
    } as OperatingCoreTemplateProps<'cancellation_leader'>,
  }
}

// --- triggerOnEventReminder ---
export function triggerOnEventReminder(
  ctx: TriggerContext
): OperatingCoreTriggerOutcome {
  if (ctx.hoursUntil === undefined || ctx.hoursUntil === null) {
    return {
      triggered: false,
      reason: 'hoursUntil required for event reminder (default T-24h)',
    }
  }

  // Default T-24h: fire only between 0 < hoursUntil <= 24
  if (ctx.hoursUntil <= 0 || ctx.hoursUntil > 24) {
    return {
      triggered: false,
      reason: `hoursUntil must be between 0 and 24 for default reminder, got ${ctx.hoursUntil}`,
    }
  }

  if (!ctx.persona) {
    return { triggered: false, reason: 'persona required for event reminder' }
  }

  return {
    triggered: true,
    templateKey: 'event_reminder',
    props: {
      personaName: ctx.persona.displayName,
      eventName: ctx.event.title,
      eventDate: ctx.event.starts_at,
      hoursUntil: ctx.hoursUntil,
    } as OperatingCoreTemplateProps<'event_reminder'>,
  }
}

// --- triggerOnNoShow ---
export function triggerOnNoShow(ctx: TriggerContext): OperatingCoreTriggerOutcome {
  if (!ctx.wasNoShow) {
    return {
      triggered: false,
      reason: 'wasNoShow flag must be true for no-show notification',
    }
  }

  if (!ctx.persona) {
    return { triggered: false, reason: 'persona required for no-show notification' }
  }

  return {
    triggered: true,
    templateKey: 'no_show',
    props: {
      personaName: ctx.persona.displayName,
      eventName: ctx.event.title,
      eventDate: ctx.event.starts_at,
    } as OperatingCoreTemplateProps<'no_show'>,
  }
}
