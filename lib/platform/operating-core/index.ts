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
  hasOperatingCoreCapacityManageCapability,
  hasOperatingCoreFormsManageCapability,
  hasOperatingCoreFormsSubmitCapability,
  hasOperatingCoreResourcesManageCapability,
} from './route-access'
export { requireOperatingCoreSession } from './route-access'
export { hasOperatingCoreDashboardsReadCapability } from './route-access'

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

// GDV bridge (S08)
export {
  bridgeGdvAttendanceToOperatingCore,
  GDV_BRIDGE_CAPTURE_SOURCE,
} from '../adapters/operating-core-grupos-vida'

// Registrations (S09)
export type {
  Registration,
  RegistrationsRepository,
} from './registrations/registration-repository'

export type {
  RegistrationOutcome,
  RegistrationCreateOutcome,
  CreateRegistrationInput,
  DenyManualRegistrationInput,
} from './registrations/registration-state'

export {
  evaluateRegistrationOutcome,
  canDenyManualRegistration,
  validateWaitlistPromotion,
} from './registrations/registration-state'

// Registrations SQL row types (S10)
export type {
  OperatingCoreRegistrationRow,
  OperatingCoreRegistrationDomainMapped,
  OperatingCoreRegistrationEstadoSql,
  OperatingCoreRegistrationConfirmationModeSql,
} from './registrations/registration-sql-row'
export { mapSqlRowToDomain } from './registrations/registration-sql-row'

// Registrations Supabase adapter (S10)
export type {
  RegistrationsRepositorySupabaseOptions,
} from './registrations/registration-repository-supabase'
export { createSupabaseRegistrationsRepository } from './registrations/registration-repository-supabase'

// Public tokens (S11)
export { hashPublicToken } from './public-tokens/token-hash'

export type {
  OperatingCorePublicTokenRow,
  OperatingCoreClaimOutcome,
} from './public-tokens/public-token-sql-row'

export type {
  PublicTokensRepository,
  CreatePublicTokenInput,
} from './public-tokens/public-token-repository'

export type {
  PublicTokensRepositorySupabaseOptions,
} from './public-tokens/public-token-repository-supabase'
export { createSupabasePublicTokensRepository } from './public-tokens/public-token-repository-supabase'

export type {
  GdvAttendanceRecord,
  GdvAttendanceReader,
  OperatingCoreGdvBridgeActor,
  OperatingCoreGdvBridgeInput,
  OperatingCoreGdvBridgePerRecord,
  OperatingCoreGdvBridgeResult,
} from '../adapters/operating-core-grupos-vida'

// Capacity (S12)
export type {
  CapacityScope,
  CapacityBase,
  CapacityOverride,
  CapacitySnapshot,
  CapacityValidationError,
  CapacityValidationFailure,
  CapacityValidationSuccess,
  CapacityValidationResult,
  CapacityAlert,
} from './capacity/capacity-types'

export type {
  CapacityRepository,
  SetOverrideInput,
  CapacityAlertHook,
} from './capacity/capacity-repository'

export { createCapacityRepositoryFake } from './capacity/capacity-repository-fake'

// Capacity SQL row types (S13)
export type {
  OperatingCoreCapacitySourceSql,
  OperatingCoreCapacityOverrideRow,
} from './capacity/capacity-sql-row'

// Capacity Supabase adapter (S13)
export { createSupabaseCapacityRepository, CapacityOverrideValidationError } from './capacity/capacity-repository-supabase'
export type {
  CapacitySupabaseAdapterOptions,
} from './capacity/capacity-repository-supabase'

// Forms (S14)
export {
  OPERATING_CORE_FORM_FIELD_TYPES,
  OPERATING_CORE_FORM_LIFECYCLES,
} from './forms/form-types'

export type {
  OperatingCoreFormFieldValidation,
  FormAnswerValue,
  OperatingCoreFormValidationError,
  FormSubmissionValidationSuccess,
  FormSubmissionValidationFailure,
  FormSubmissionValidationResult,
} from './forms/form-types'

export {
  canAcceptSubmission,
  validateAnswerType,
  validateOptionMembership,
  validateSubmission,
} from './forms/form-state'

export type {
  CreateFormInput,
  UpdateFormInput,
  SubmitFormInput,
  FormsRepository,
} from './forms/form-repository'

export { createFormsRepositoryFake } from './forms/form-repository-fake'

// Forms SQL row types (S15)
export type {
  OperatingCoreFormLifecycleSql,
  OperatingCoreFormRow,
  OperatingCoreFormSubmissionRow,
} from './forms/form-sql-row'

export { mapSqlFormRowToDomain, mapSqlSubmissionRowToDomain } from './forms/form-sql-row'

// Forms Supabase adapter (S15)
export type {
  FormsRepositorySupabaseOptions,
} from './forms/form-repository-supabase'
export { createSupabaseFormsRepository } from './forms/form-repository-supabase'

// Forms factory (S15)
export { createOperatingCoreFormsRepository } from './forms/factory'

// Resources (S16)
export {
  OPERATING_CORE_RESOURCE_KINDS,
} from './resources/resource-types'

export type {
  OperatingCoreResourceKind,
  CreateResourceInput,
  ResourceTransferRequest,
  ResourceArchiveRequest,
  ResourceValidationError,
} from './resources/resource-types'

export type {
  ResourcesRepository,
  ListResourcesFilter,
} from './resources/resource-repository'

export { createInMemoryResourcesRepository } from './resources/resource-repository-fake'

export {
  validateKind,
  canOperate,
  isVisibleTo,
  buildSuccessorFromTransfer,
  validateCreateInput,
} from './resources/resource-state'

// Resources factory (S16)
export { createOperatingCoreResourcesRepository } from './resources/factory'

// Outbox drain (S17)
export type {
  OperatingCoreNotificationOutboxEntry,
  DrainResult,
} from './notification-outbox/outbox-types'

export { canRetry, isTerminalFailure, nextAttemptDelay, validatePayload } from './notification-outbox/outbox-state'

export type { OutboxRepository } from './notification-outbox/outbox-repository'

export { createOperatingCoreOutboxRepository } from './notification-outbox/factory'

export { drainOutbox } from './notification-outbox/drain'

// Notifications — S18 templates
export {
  OPERATING_CORE_TEMPLATE_KEYS,
  OPERATING_CORE_TEMPLATE_VERSION,
} from './notifications/template-keys'
export type {
  OperatingCoreTemplateKey,
  OperatingCoreTemplateVersionedKey,
  OperatingCoreTemplatePropsMap,
  OperatingCoreTemplateProps,
} from './notifications/template-keys'

export { renderOperatingCoreTemplate } from './notifications/render-template'

export {
  triggerOnRegistrationConfirmed,
  triggerOnWaitlistPlaced,
  triggerOnWaitlistPromoted,
  triggerOnCancellationToLeader,
  triggerOnEventReminder,
  triggerOnNoShow,
} from './notifications/triggers'
export type {
  OperatingCoreTriggerOutcome,
  TriggerContext,
} from './notifications/triggers'

// Notifications — S19 read/sent state, retry, signed links
export {
  nextRetryAt,
  shouldRetry,
  isTerminalFailureStatus,
  isTerminalStatus,
  isRead,
  isSent,
} from './notifications/notification-state'

export {
  generateSignedLink,
  verifySignedLink,
  DEFAULT_SIGNED_LINK_TTL_DAYS,
  MAX_SIGNED_LINK_TTL_DAYS,
} from './notifications/signed-link'
export type {
  SignedLinkInput,
  SignedLinkToken,
  SignedLinkVerifyResult,
} from './notifications/notification-state-types'

export {
  logClaim,
  logRelease,
  logRetry,
  logTerminal,
  logSend,
  logRead,
  logExpire,
} from './notifications/structured-logger'
export type {
  NotificationLogEntry,
  NotificationLogEvent,
  NotificationLogLevel,
} from './notifications/structured-logger'

export { createNotificationStateRepository } from './notifications/factory'
export type { NotificationStateRepository, SystemNotificationSummary } from './notifications/factory'

export type {
  OperatingCoreSystemNotificationRow,
} from './notifications/system-notification-sql-row'

// Capture-UX (S20)
export {
  CAPTURE_UX_STATES,
  CAPTURE_UX_SHAPES,
  CAPTURE_UX_TRANSITIONS,
  canTransitionUX,
  isTerminal,
} from './capture-ux/capture-ux-state'
export type {
  CaptureUXState,
  CaptureUXShape,
  CaptureUXInput,
  CaptureUXOutput,
  CaptureUXAction,
  CaptureUXActionType,
} from './capture-ux/capture-ux-types'

// Dashboards (S21)
export { loadDashboardData } from './dashboards/loader'
export type { LoadDashboardResult } from './dashboards/loader'
export {
  DASHBOARD_VIEWS,
} from './dashboards/dashboard-types'
export type {
  DashboardView,
  DirectorWidgets,
  LiderWidgets,
  OperadorWidgets,
  DashboardWidgets,
  DashboardData,
} from './dashboards/dashboard-types'
