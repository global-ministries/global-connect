/**
 * Operating Core errors taxonomy.
 * Every class maps to a specific 4xx HTTP status — NEVER 500 for business outcomes.
 * Pattern reference: dream-team/errors.ts (read-only).
 */

export type OperatingCoreErrorCode =
  | 'invalid_input'
  | 'no_session'
  | 'capability_denied'
  | 'flag_off'
  | 'not_found'
  | 'token_replay'
  | 'identity_disclosure'
  | 'ambiguity_unresolved'
  | 'capacity_conflict'
  | 'invalid_transition'
  | 'irreconcilable_idempotency'
  | 'non_waitlistable'

export class OperatingCoreError {
  readonly code: OperatingCoreErrorCode
  readonly message: string
  readonly context?: Readonly<Record<string, unknown>>

  constructor(
    code: OperatingCoreErrorCode,
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ) {
    this.code = code
    this.message = message
    if (context) this.context = context
  }

  toHttpStatus(): number {
    switch (this.code) {
      case 'invalid_input':
        return 400
      case 'no_session':
        return 401
      case 'capability_denied':
      case 'flag_off':
        return 403
      case 'not_found':
      case 'token_replay':
      case 'identity_disclosure':
      case 'ambiguity_unresolved':
        return 404
      case 'capacity_conflict':
      case 'invalid_transition':
      case 'irreconcilable_idempotency':
      case 'non_waitlistable':
        return 409
      default: {
        // Exhaustiveness check — if TypeScript catches a missing case, this line is unreachable
        const _exhaustive: never = this.code
        return _exhaustive
      }
    }
  }
}

/**
 * Concurrency conflict error for optimistic locking.
 * Thrown when expectedVersion does not match the current version.
 * Shape mirrors dream-team/Errors.ts ConcurrencyConflictError (pattern reference only).
 */
export class OperatingCoreConcurrencyConflictError extends Error {
  readonly code = 'CONCURRENCY_CONFLICT' as const

  constructor(
    message: string,
    readonly context?: Readonly<Record<string, unknown>>,
  ) {
    super(message)
    this.name = 'OperatingCoreConcurrencyConflictError'
  }
}

/** All error classes — used by tests to assert no 500 mapping. */
export const OPERATING_CORE_ERROR_CLASSES: readonly OperatingCoreError[] = [
  new OperatingCoreError('invalid_input', ''),
  new OperatingCoreError('no_session', ''),
  new OperatingCoreError('capability_denied', ''),
  new OperatingCoreError('flag_off', ''),
  new OperatingCoreError('not_found', ''),
  new OperatingCoreError('token_replay', ''),
  new OperatingCoreError('identity_disclosure', ''),
  new OperatingCoreError('ambiguity_unresolved', ''),
  new OperatingCoreError('capacity_conflict', ''),
  new OperatingCoreError('invalid_transition', ''),
  new OperatingCoreError('irreconcilable_idempotency', ''),
  new OperatingCoreError('non_waitlistable', ''),
]
