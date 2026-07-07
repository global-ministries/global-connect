import type { DreamTeamEstado, DreamTeamMotivo } from './types'

export type DreamTeamErrorCode =
  | 'INVALID_STATE_TRANSITION'
  | 'MISSING_MOTIVO'
  | 'TERMINAL_STATE'
  | 'INVALID_MOTIVO_FOR_TRANSITION'
  | 'CONCURRENCY_CONFLICT'
  | 'SELF_TRANSITION'

export interface DreamTeamError {
  readonly code: DreamTeamErrorCode
  readonly message: string
  readonly context?: Readonly<Record<string, unknown>>
}

export function dreamTeamError(
  code: DreamTeamErrorCode,
  message: string,
  context?: Readonly<Record<string, unknown>>,
): DreamTeamError {
  return { code, message, ...(context ? { context } : {}) }
}

const errorIs = <Code extends DreamTeamErrorCode>(code: Code) =>
  (error: DreamTeamError): error is DreamTeamError & { code: Code } => error.code === code

export const isInvalidStateTransition = errorIs('INVALID_STATE_TRANSITION')
export const isMissingMotivo = errorIs('MISSING_MOTIVO')
export const isTerminalState = errorIs('TERMINAL_STATE')
export const isInvalidMotivoForTransition = errorIs('INVALID_MOTIVO_FOR_TRANSITION')
export const isConcurrencyConflict = errorIs('CONCURRENCY_CONFLICT')
export const isSelfTransition = errorIs('SELF_TRANSITION')

export const TERMINAL_ESTADOS: ReadonlySet<DreamTeamEstado> = new Set<DreamTeamEstado>(['retirado'])
