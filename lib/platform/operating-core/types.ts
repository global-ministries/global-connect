/**
 * Operating Core pure type definitions.
 * Contracts for events, services, registrations, capacity, forms, resources,
 * notifications, recurrent events, GDV bridge, and visitor resolution.
 * Pattern reference: dream-team/types.ts (read-only).
 */

// ---------------------------------------------------------------------------
// Participation kinds re-export (single source of truth in kinds.ts)
// ---------------------------------------------------------------------------
export { OPERATING_CORE_PARTICIPATION_KINDS } from './kinds'
export type { OperatingCoreParticipationKind } from './kinds'

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Valid Operating Core event kinds — camp is NOT implemented. */
export type OperatingCoreEventKind =
  | 'service'
  | 'group_meeting'
  | 'workshop'
  | 'activity'
  | 'custom'

export type OperatingCoreEventEstado = 'active' | 'cancelled'

/** A planned event occurrence. kind=service references the Service. */
export interface OperatingCoreEvent {
  readonly id: string
  readonly serviceId: string | null
  readonly kind: OperatingCoreEventKind
  readonly estado: OperatingCoreEventEstado
  readonly title: string
  readonly startTime: string
  readonly visibilityScope: string
  readonly recurrenceRule: OperatingCoreRecurrenceRule | null
  readonly parentEventId: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

/** A materialized concrete occurrence with its own lifecycle. */
export interface OperatingCoreEventInstance {
  readonly id: string
  readonly eventId: string
  /** ISO date string YYYY-MM-DD */
  readonly instanceDate: string
  readonly estado: OperatingCoreEventEstado
  /** Effective capacity (override or base) at time of query */
  readonly capacityOperativa: number
  readonly createdAt: string
  readonly updatedAt: string
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export type OperatingCoreServiceEstado = 'active' | 'disabled' | 'removed'

/** A configurable recurring weekly schedule for one campus. */
export interface OperatingCoreService {
  readonly id: string
  readonly campusId: string
  readonly kind: 'service' | 'group_meeting' | 'workshop' | 'activity' | 'custom'
  readonly label: string
  /** 0=Sunday, 1=Monday, … 6=Saturday */
  readonly weekday: number
  /** HH:mm format */
  readonly startTime: string
  readonly estado: OperatingCoreServiceEstado
  readonly createdAt: string
  readonly updatedAt: string
}

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

/** The canonical 6-state registration lifecycle. */
export type OperatingCoreRegistrationState =
  | 'pendiente'
  | 'confirmada'
  | 'asistida'
  | 'no_asistio'
  | 'cancelada'
  | 'rechazada'

export type OperatingCoreRegistrationConfirmationMode = 'automatic' | 'manual'

export type OperatingCoreRegistrationOutcome = 'confirmed' | 'waitlisted' | 'rejected'

export interface OperatingCoreRegistration {
  readonly id: string
  readonly eventInstanceId: string
  readonly personId: string
  readonly registrationState: OperatingCoreRegistrationState
  readonly confirmationMode: OperatingCoreRegistrationConfirmationMode
  /** null when not on waitlist */
  readonly waitlistPosition: number | null
  readonly outcome: OperatingCoreRegistrationOutcome
  readonly createdAt: string
  readonly updatedAt: string
}

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

export interface OperatingCoreCapacityBase {
  readonly eventInstanceId: string
  readonly capacityBase: number
  readonly setBy: string
  readonly createdAt: string
}

export interface OperatingCoreCapacityOverride {
  readonly eventInstanceId: string
  readonly capacityOperativa: number
  readonly reason: string
  readonly setBy: string
  readonly setAt: string
}

export type OperatingCoreCapacitySource = 'base' | 'override'

export interface OperatingCoreEffectiveCapacity {
  readonly eventInstanceId: string
  readonly effectiveCapacity: number
  readonly source: OperatingCoreCapacitySource
  readonly setBy: string | null
  readonly updatedAt: string
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export type OperatingCoreFormFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'textarea'

export type OperatingCoreFormLifecycle = 'draft' | 'published' | 'archived'

export interface OperatingCoreFormField {
  readonly label: string
  readonly type: OperatingCoreFormFieldType
  readonly required: boolean
  readonly options?: ReadonlyArray<string>
}

export interface OperatingCoreFormDefinition {
  readonly id: string
  readonly experienciaScope: string
  readonly title: string
  readonly description: string
  readonly lifecycle: OperatingCoreFormLifecycle
  readonly fields: ReadonlyArray<OperatingCoreFormField>
  readonly createdAt: string
  readonly updatedAt: string
}

export interface OperatingCoreFormSubmission {
  readonly id: string
  readonly formId: string
  readonly personId: string
  readonly data: Readonly<Record<string, unknown>>
  readonly submittedAt: string
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export type OperatingCoreResourceType = 'link' | 'file' | 'video'
export type OperatingCoreResourceVisibility = 'public' | 'team' | 'private'
export type OperatingCoreResourceLifecycle = 'active' | 'archived'

export interface OperatingCoreResource {
  readonly id: string
  readonly tipo: OperatingCoreResourceType
  readonly title: string
  readonly description: string
  /** URL for link/video; storage reference for file */
  readonly url: string
  readonly visibility: OperatingCoreResourceVisibility
  readonly lifecycle: OperatingCoreResourceLifecycle
  readonly ownerScope: string
  readonly createdBy: string
  readonly successorId: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type OperatingCoreNotificationTrigger =
  | 'registration_confirmed'
  | 'waitlist_placement'
  | 'waitlist_promotion'
  | 'cancellation'
  | 'no_show'
  | 'reminder'

export type OperatingCoreNotificationChannel = 'in_app' | 'email'

export type OperatingCoreNotificationState = 'pending' | 'sent' | 'read' | 'failed'

export interface OperatingCoreNotificationOutbox {
  readonly id: string
  readonly templateKey: string
  readonly recipientPersonId: string
  readonly channel: OperatingCoreNotificationChannel
  readonly state: OperatingCoreNotificationState
  readonly payload: Readonly<Record<string, unknown>>
  readonly nextRetryAt: string | null
  readonly failedAt: string | null
  readonly createdAt: string
}

// ---------------------------------------------------------------------------
// Recurrent events
// ---------------------------------------------------------------------------

export type OperatingCoreRecurrenceFreq = 'weekly'

export interface OperatingCoreRecurrenceRule {
  readonly freq: OperatingCoreRecurrenceFreq
  readonly interval: number
  readonly count: number | null
  readonly until: string | null
  /** Array of weekdays (0=Sunday … 6=Saturday); null means all days */
  readonly byDay: ReadonlyArray<number> | null
  /** HH:mm start time for each instance */
  readonly startTime: string | null
}

// ---------------------------------------------------------------------------
// GDV bridge
// ---------------------------------------------------------------------------

export type OperatingCoreGDVAttendanceEstado = 'asistio' | 'no_asistio'

export interface OperatingCoreGDVAttendanceEvent {
  readonly id: string
  readonly gruposVidaReunionId: string
  readonly personId: string
  readonly fecha: string
  readonly estado: OperatingCoreGDVAttendanceEstado
  readonly emittedAt: string
}

// ---------------------------------------------------------------------------
// Visitor resolution
// ---------------------------------------------------------------------------

export type OperatingCoreVisitorResolutionMethod =
  | 'cedula_exact'
  | 'persona_candidate'

export type OperatingCoreVisitorResolutionResult =
  | 'resolved'
  | 'ambiguous'
  | 'no_match'

export interface OperatingCoreVisitorCandidate {
  readonly personId: string
  readonly matchedSignals: ReadonlyArray<'cedula' | 'nombre' | 'telefono'>
  readonly reviewRequired: boolean
}

export interface OperatingCoreVisitorResolution {
  readonly result: OperatingCoreVisitorResolutionResult
  readonly method: OperatingCoreVisitorResolutionMethod | null
  readonly resolvedPersonId: string | null
  readonly candidates: ReadonlyArray<OperatingCoreVisitorCandidate>
  readonly captureSource: string
}

// ---------------------------------------------------------------------------
// Participation ledger
// ---------------------------------------------------------------------------

export interface OperatingCoreParticipationEvent {
  readonly id: string
  readonly eventInstanceId: string
  readonly personId: string
  readonly kind: import('./kinds').OperatingCoreParticipationKind
  readonly metadata: Readonly<Record<string, unknown>>
  readonly capturedBy: string
  readonly captureSource: string
  readonly emittedAt: string
}
