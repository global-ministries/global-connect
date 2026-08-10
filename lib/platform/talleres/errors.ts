/**
 * PR1 — DT-002 — Talleres error codes and helpers.
 * Sibling to lib/platform/pastoral/errors.ts pattern.
 */

export type TalleresErrorCode =
  | 'INVALID_STATE_TRANSITION'
  | 'MISSING_MOTIVO'
  | 'TERMINAL_STATE'
  | 'INVALID_MOTIVO_FOR_TRANSITION'
  | 'CONCURRENCY_CONFLICT'
  | 'SELF_TRANSITION'
  | 'TALLER_NOT_FOUND'
  | 'TALLER_ACCESS_DENIED'
  | 'INVALID_CARDINALITY'
  | 'INVALID_ENROLLMENT_STATE'
  | 'SESSION_SEQUENCE_VIOLATION'
  | 'DUPLICATE_ENROLLMENT'
  | 'INVALID_MODALITY_CHANGE'

export interface TalleresError {
  readonly code: TalleresErrorCode
  readonly message: string
  readonly context?: Readonly<Record<string, unknown>>
}

export function talleresError(
  code: TalleresErrorCode,
  message: string,
  context?: Readonly<Record<string, unknown>>,
): TalleresError {
  return { code, message, ...(context ? { context } : {}) }
}

const errorIs = <Code extends TalleresErrorCode>(code: Code) =>
  (error: TalleresError): error is TalleresError & { code: Code } => error.code === code

export const isInvalidStateTransition = errorIs('INVALID_STATE_TRANSITION')
export const isMissingMotivo = errorIs('MISSING_MOTIVO')
export const isTerminalState = errorIs('TERMINAL_STATE')
export const isInvalidMotivoForTransition = errorIs('INVALID_MOTIVO_FOR_TRANSITION')
export const isConcurrencyConflict = errorIs('CONCURRENCY_CONFLICT')
export const isSelfTransition = errorIs('SELF_TRANSITION')
export const isTallerNotFound = errorIs('TALLER_NOT_FOUND')
export const isTallerAccessDenied = errorIs('TALLER_ACCESS_DENIED')
export const isInvalidCardinality = errorIs('INVALID_CARDINALITY')
export const isInvalidEnrollmentState = errorIs('INVALID_ENROLLMENT_STATE')
export const isSessionSequenceViolation = errorIs('SESSION_SEQUENCE_VIOLATION')
export const isDuplicateEnrollment = errorIs('DUPLICATE_ENROLLMENT')
export const isInvalidModalityChange = errorIs('INVALID_MODALITY_CHANGE')

/**
 * Route access error codes.
 */
export type RouteAccessErrorCode =
  | 'ROUTE_ACCESS_DENIED'
  | 'ROUTE_NOT_FOUND'
  | 'FLAG_DISABLED'

export interface RouteAccessError {
  readonly code: RouteAccessErrorCode
  readonly message: string
  readonly context?: Readonly<Record<string, unknown>>
}

export function routeAccessError(
  code: RouteAccessErrorCode,
  message: string,
  context?: Readonly<Record<string, unknown>>,
): RouteAccessError {
  return { code, message, ...(context ? { context } : {}) }
}

const routeErrorIs = <Code extends RouteAccessErrorCode>(code: Code) =>
  (error: RouteAccessError): error is RouteAccessError & { code: Code } => error.code === code

export const isRouteAccessDenied = routeErrorIs('ROUTE_ACCESS_DENIED')
export const isRouteNotFound = routeErrorIs('ROUTE_NOT_FOUND')
export const isFlagDisabled = routeErrorIs('FLAG_DISABLED')

/** Terminal states for workshop lifecycle (cerrado and cancelado — D15). */
export const TERMINAL_TALLER_ESTADOS: ReadonlySet<string> = new Set(['cerrado', 'cancelado'])

/** Terminal states for participant unit (completado, no_completado, abandono — D16). */
export const TERMINAL_PARTICIPANT_ESTADOS: ReadonlySet<string> = new Set([
  'completado',
  'no_completado',
  'abandono',
])

/** Terminal states for report lifecycle (cerrado — D15). */
export const TERMINAL_REPORT_ESTADOS: ReadonlySet<string> = new Set(['cerrado'])
