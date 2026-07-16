/**
 * Operating Core — public contract surface.
 * All symbols re-exported here are the stable public API for subsequent slices.
 */

// Kinds
export {
  OPERATING_CORE_PARTICIPATION_KINDS,
} from './kinds'
export type {
  OperatingCoreParticipationKind,
} from './kinds'

// Errors
export {
  OPERATING_CORE_ERROR_CLASSES,
  OperatingCoreConcurrencyConflictError,
} from './errors'
export type {
  OperatingCoreError,
  OperatingCoreErrorCode,
} from './errors'
export { OperatingCoreConcurrencyConflictError as ConcurrencyConflictError } from './errors'

// State machines
export {
  REGISTRATION_STATES,
  REGISTRATION_TRANSITIONS,
  canTransition,
} from './state'
export type {
  RegistrationState,
} from './state'

export {
  CAPTURE_STATES,
  CAPTURE_TRANSITIONS,
  canTransitionCapture,
} from './capture-states'
export type {
  CaptureState,
} from './capture-states'

// Types
export type {
  // Events
  OperatingCoreEventKind,
  OperatingCoreEventEstado,
  OperatingCoreEvent,
  OperatingCoreEventInstance,
  // Services
  OperatingCoreServiceEstado,
  OperatingCoreService,
  // Registrations
  OperatingCoreRegistrationState,
  OperatingCoreRegistrationConfirmationMode,
  OperatingCoreRegistrationOutcome,
  OperatingCoreRegistration,
  // Capacity
  OperatingCoreCapacityBase,
  OperatingCoreCapacityOverride,
  OperatingCoreCapacitySource,
  OperatingCoreEffectiveCapacity,
  // Forms
  OperatingCoreFormFieldType,
  OperatingCoreFormLifecycle,
  OperatingCoreFormField,
  OperatingCoreFormDefinition,
  OperatingCoreFormSubmission,
  // Resources
  OperatingCoreResourceType,
  OperatingCoreResourceVisibility,
  OperatingCoreResourceLifecycle,
  OperatingCoreResource,
  // Notifications
  OperatingCoreNotificationTrigger,
  OperatingCoreNotificationChannel,
  OperatingCoreNotificationState,
  OperatingCoreNotificationOutbox,
  // Recurrent events
  OperatingCoreRecurrenceFreq,
  OperatingCoreRecurrenceRule,
  // GDV bridge
  OperatingCoreGDVAttendanceEstado,
  OperatingCoreGDVAttendanceEvent,
  // Visitor resolution
  OperatingCoreVisitorResolutionMethod,
  OperatingCoreVisitorResolutionResult,
  OperatingCoreVisitorCandidate,
  OperatingCoreVisitorResolution,
  // Participation ledger
  OperatingCoreParticipationEvent,
} from './types'

// Repositories
export type {
  VersionedOperatingCoreService,
  CreateServiceInput,
  UpdateServicePatch,
  ServicesRepository,
} from './repositories/services-repository'

export type {
  VersionedOperatingCoreEvent,
  CreateEventInput,
  UpdateEventPatch,
  EventsRepository,
} from './repositories/events-repository'

export type {
  VersionedOperatingCoreEventInstance,
  CreateEventInstanceInput,
  UpdateEventInstancePatch,
  EventInstancesRepository,
} from './repositories/event-instances-repository'

// Route access (S05)
export {
  isOperatingCoreEnabled,
  hasOperatingCoreEventsReadCapability,
  hasOperatingCoreEventsWriteCapability,
  hasOperatingCoreServicesReadCapability,
  hasOperatingCoreServicesWriteCapability,
} from './route-access'
export { requireOperatingCoreSession } from './route-access'

// Visitor resolution (S06)
export {
  resolveVisitor,
} from './visitor-resolution'
export type {
  VisitorCaptureMetadata,
  VisitorResolutionResult,
  ResolveVisitorInput,
  ResolveVisitorQuery,
} from './visitor-resolution'

// Participation read guard (S06)
export {
  canReadOperatingCoreParticipationEvent,
  hasOperatingCoreParticipationReadCapability,
} from './participation-read-guard'
export type {
  OperatingCoreParticipationReadActor,
  OperatingCoreParticipationReadEvent,
  OperatingCoreParticipationReadInput,
  OperatingCoreParticipationReadResult,
} from './participation-read-guard'

// Participation ledger (S07)
export type {
  AppendParticipationEventInput,
  ListParticipationEventsFilter,
  ParticipationLedgerEvent,
  ParticipationLedgerRepository,
} from './participation-ledger-repository'
