import {
  dreamTeamError,
  isConcurrencyConflict,
  isInvalidMotivoForTransition,
  isInvalidStateTransition,
  isMissingMotivo,
  isSelfTransition,
  isTerminalState,
  TERMINAL_ESTADOS,
} from '@/lib/platform/dream-team/errors'
import type { DreamTeamError } from '@/lib/platform/dream-team/errors'

describe('Dream Team errors', () => {
  it('creates an error with code and message', () => {
    expect(dreamTeamError('MISSING_MOTIVO', 'motivo is required')).toEqual({
      code: 'MISSING_MOTIVO',
      message: 'motivo is required',
    })
  })

  it('includes context when provided', () => {
    const error = dreamTeamError('INVALID_STATE_TRANSITION', 'bad transition', { from: 'postulado', to: 'activo' })
    expect(error.code).toBe('INVALID_STATE_TRANSITION')
    expect(error.message).toBe('bad transition')
    expect(error.context).toEqual({ from: 'postulado', to: 'activo' })
  })

  it('narrows errors by code through typed helpers', () => {
    const cases: Array<[DreamTeamError, (error: DreamTeamError) => boolean, string]> = [
      [dreamTeamError('INVALID_STATE_TRANSITION', 'x'), isInvalidStateTransition, 'INVALID_STATE_TRANSITION'],
      [dreamTeamError('MISSING_MOTIVO', 'x'), isMissingMotivo, 'MISSING_MOTIVO'],
      [dreamTeamError('TERMINAL_STATE', 'x'), isTerminalState, 'TERMINAL_STATE'],
      [dreamTeamError('INVALID_MOTIVO_FOR_TRANSITION', 'x'), isInvalidMotivoForTransition, 'INVALID_MOTIVO_FOR_TRANSITION'],
      [dreamTeamError('CONCURRENCY_CONFLICT', 'x'), isConcurrencyConflict, 'CONCURRENCY_CONFLICT'],
      [dreamTeamError('SELF_TRANSITION', 'x'), isSelfTransition, 'SELF_TRANSITION'],
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
    const error = dreamTeamError('MISSING_MOTIVO', 'x')
    expect(isInvalidStateTransition(error)).toBe(false)
    expect(isTerminalState(error)).toBe(false)
    expect(isSelfTransition(error)).toBe(false)
    expect(isInvalidMotivoForTransition(error)).toBe(false)
  })

  it('marks only retirado as terminal', () => {
    expect([...TERMINAL_ESTADOS]).toEqual(['retirado'])
  })
})
