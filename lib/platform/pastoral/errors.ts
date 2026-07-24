/**
 * W01 — DT-001 — Pastoral error codes and helpers.
 * Discriminated union follows the DreamTeamErrorCode pattern (F2).
 */

export type PastoralErrorCode =
  | 'INVALID_STATE_TRANSITION'
  | 'MISSING_MOTIVO'
  | 'TERMINAL_STATE'
  | 'INVALID_MOTIVO_FOR_TRANSITION'
  | 'CONCURRENCY_CONFLICT'
  | 'SELF_TRANSITION'
  | 'PASTORAL_NOT_FOUND'
  | 'PASTORAL_ACCESS_DENIED'

export interface PastoralError {
  readonly code: PastoralErrorCode
  readonly message: string
  readonly context?: Readonly<Record<string, unknown>>
}

export function pastoralError(
  code: PastoralErrorCode,
  message: string,
  context?: Readonly<Record<string, unknown>>,
): PastoralError {
  return { code, message, ...(context ? { context } : {}) }
}

const errorIs = <Code extends PastoralErrorCode>(code: Code) =>
  (error: PastoralError): error is PastoralError & { code: Code } => error.code === code

export const isInvalidStateTransition = errorIs('INVALID_STATE_TRANSITION')
export const isMissingMotivo = errorIs('MISSING_MOTIVO')
export const isTerminalState = errorIs('TERMINAL_STATE')
export const isInvalidMotivoForTransition = errorIs('INVALID_MOTIVO_FOR_TRANSITION')
export const isConcurrencyConflict = errorIs('CONCURRENCY_CONFLICT')
export const isSelfTransition = errorIs('SELF_TRANSITION')
export const isPastoralNotFound = errorIs('PASTORAL_NOT_FOUND')
export const isPastoralAccessDenied = errorIs('PASTORAL_ACCESS_DENIED')

/** Terminal states for 1:1 lifecycle (completed and cancelled — D12). */
export const TERMINAL_ONE_ON_ONE_STATES: ReadonlySet<string> = new Set(['completed', 'cancelled'])

/** Terminal state for triada lifecycle (disbanded — D13). */
export const TERMINAL_TRIADA_STATES: ReadonlySet<string> = new Set(['disbanded'])
