/**
 * W01 — DT-001 — Pastoral errors discriminated union.
 * Follows the DreamTeamErrorCode pattern from dream-team/errors.ts.
 */
import {
  pastoralError,
  isInvalidStateTransition,
  isMissingMotivo,
  isTerminalState,
  isInvalidMotivoForTransition,
  isConcurrencyConflict,
  isSelfTransition,
  isPastoralNotFound,
  isPastoralAccessDenied,
  TERMINAL_ONE_ON_ONE_STATES,
  TERMINAL_TRIADA_STATES,
} from '@/lib/platform/pastoral/errors'
import type { PastoralError, PastoralErrorCode } from '@/lib/platform/pastoral/errors'

describe('Pastoral errors', () => {
  it('creates an error with code and message', () => {
    expect(pastoralError('MISSING_MOTIVO', 'motivo is required')).toEqual({
      code: 'MISSING_MOTIVO',
      message: 'motivo is required',
    })
  })

  it('includes context when provided', () => {
    const error = pastoralError('INVALID_STATE_TRANSITION', 'bad transition', { from: 'pending_participant', to: 'completed' })
    expect(error.code).toBe('INVALID_STATE_TRANSITION')
    expect(error.message).toBe('bad transition')
    expect(error.context).toEqual({ from: 'pending_participant', to: 'completed' })
  })

  it('narrows errors by code through typed guards', () => {
    const cases: Array<[PastoralError, (e: PastoralError) => boolean, PastoralErrorCode]> = [
      [pastoralError('INVALID_STATE_TRANSITION', 'x'), isInvalidStateTransition, 'INVALID_STATE_TRANSITION'],
      [pastoralError('MISSING_MOTIVO', 'x'), isMissingMotivo, 'MISSING_MOTIVO'],
      [pastoralError('TERMINAL_STATE', 'x'), isTerminalState, 'TERMINAL_STATE'],
      [pastoralError('INVALID_MOTIVO_FOR_TRANSITION', 'x'), isInvalidMotivoForTransition, 'INVALID_MOTIVO_FOR_TRANSITION'],
      [pastoralError('CONCURRENCY_CONFLICT', 'x'), isConcurrencyConflict, 'CONCURRENCY_CONFLICT'],
      [pastoralError('SELF_TRANSITION', 'x'), isSelfTransition, 'SELF_TRANSITION'],
      [pastoralError('PASTORAL_NOT_FOUND', 'x'), isPastoralNotFound, 'PASTORAL_NOT_FOUND'],
      [pastoralError('PASTORAL_ACCESS_DENIED', 'x'), isPastoralAccessDenied, 'PASTORAL_ACCESS_DENIED'],
    ]

    for (const [error, guard, code] of cases) {
      expect(guard(error)).toBe(true)
      if (guard(error)) {
        expect(error.code).toBe(code)
      } else {
        throw new Error(`guard for ${code} should have narrowed`)
      }
    }
  })

  it('returns false for mismatched helpers', () => {
    const error = pastoralError('MISSING_MOTIVO', 'x')
    expect(isInvalidStateTransition(error)).toBe(false)
    expect(isTerminalState(error)).toBe(false)
    expect(isSelfTransition(error)).toBe(false)
    expect(isPastoralNotFound(error)).toBe(false)
    expect(isPastoralAccessDenied(error)).toBe(false)
  })

  it('marks only completed and cancelled as terminal one_on_one states', () => {
    expect([...TERMINAL_ONE_ON_ONE_STATES]).toEqual(['completed', 'cancelled'])
  })

  it('marks only disbanded as terminal triada state', () => {
    expect([...TERMINAL_TRIADA_STATES]).toEqual(['disbanded'])
  })
})
