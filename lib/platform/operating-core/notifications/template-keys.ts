/**
 * S18 — Operating Core notification template keys
 * CLOSED 6-element union: adding requires v2 bump
 */

// CLOSED 6-element template key union (no more, no fewer). Adding requires v2 bump.
export const OPERATING_CORE_TEMPLATE_KEYS = [
  'registration_confirmed',
  'waitlist_placed',
  'waitlist_promoted',
  'cancellation_leader',
  'event_reminder',
  'no_show',
] as const

export type OperatingCoreTemplateKey = (typeof OPERATING_CORE_TEMPLATE_KEYS)[number]

export const OPERATING_CORE_TEMPLATE_VERSION = 'v1' as const
export type OperatingCoreTemplateVersionedKey =
  `${OperatingCoreTemplateKey}.${typeof OPERATING_CORE_TEMPLATE_VERSION}`

// Per-template props map — closed shape; adding requires v2 bump
export interface OperatingCoreTemplatePropsMap {
  registration_confirmed: {
    personaName: string
    eventName: string
    eventDate: string
    eventLocation?: string
  }
  waitlist_placed: {
    personaName: string
    eventName: string
    eventDate: string
    waitlistPosition: number
  }
  waitlist_promoted: {
    personaName: string
    eventName: string
    eventDate: string
    eventLocation?: string
  }
  cancellation_leader: {
    leaderName: string
    eventName: string
    cancelledPersonaName: string
    reason: string
  }
  event_reminder: {
    personaName: string
    eventName: string
    eventDate: string
    hoursUntil: number
  }
  no_show: {
    personaName: string
    eventDate: string
    eventName: string
  }
}

export type OperatingCoreTemplateProps<
  K extends OperatingCoreTemplateKey,
> = OperatingCoreTemplatePropsMap[K]
