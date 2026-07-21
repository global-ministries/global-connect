/**
 * S19 — Notification state machine tests.
 *
 * Tests the pure functions:
 *   - nextRetryAt (exponential backoff + terminal)
 *   - shouldRetry
 *   - isTerminalFailureStatus / isTerminalStatus
 *   - isRead / isSent
 */

import {
  nextRetryAt,
  shouldRetry,
  isTerminalFailureStatus,
  isTerminalStatus,
  isRead,
  isSent,
} from '@/lib/platform/operating-core/notifications/notification-state'

const NOW = '2026-07-20T12:00:00.000Z'

// ─── nextRetryAt ─────────────────────────────────────────────────────────────

describe('nextRetryAt', () => {
  describe('exponential backoff formula', () => {
    it('should return delay = baseDelaySeconds * 2^currentAttempt', () => {
      const result = nextRetryAt(0, 6, 60, NOW)
      expect(result).toEqual({ nextRetryAt: '2026-07-20T12:01:00.000Z' })
    })

    it('should double delay on second attempt (currentAttempt=1)', () => {
      const result = nextRetryAt(1, 6, 60, NOW)
      expect(result).toEqual({ nextRetryAt: '2026-07-20T12:02:00.000Z' })
    })

    it('should quadruple on third attempt (currentAttempt=2)', () => {
      const result = nextRetryAt(2, 6, 60, NOW)
      expect(result).toEqual({ nextRetryAt: '2026-07-20T12:04:00.000Z' })
    })

    it('should triple-base (3x) on first attempt when baseDelaySeconds is custom', () => {
      const result = nextRetryAt(0, 6, 30, NOW)
      expect(result).toEqual({ nextRetryAt: '2026-07-20T12:00:30.000Z' })
    })

    it('should handle large baseDelaySeconds', () => {
      const result = nextRetryAt(0, 6, 3600, NOW)
      expect(result).toEqual({ nextRetryAt: '2026-07-20T13:00:00.000Z' })
    })
  })

  describe('terminal state', () => {
    it('should return terminal:true when currentAttempt + 1 >= maxAttempts (boundary)', () => {
      // maxAttempts=6, currentAttempt=5 → 5+1=6 >= 6 → terminal
      const result = nextRetryAt(5, 6, 60, NOW)
      expect(result).toEqual({ terminal: true })
    })

    it('should return terminal:true when currentAttempt >= maxAttempts', () => {
      const result = nextRetryAt(6, 6, 60, NOW)
      expect(result).toEqual({ terminal: true })
    })

    it('should return nextRetryAt when currentAttempt < maxAttempts - 1', () => {
      const result = nextRetryAt(4, 6, 60, NOW)
      expect(result).toEqual({ nextRetryAt: '2026-07-20T12:16:00.000Z' })
    })
  })
})

// ─── shouldRetry ─────────────────────────────────────────────────────────────

describe('shouldRetry', () => {
  it('should return true when attemptCount < maxAttempts', () => {
    expect(shouldRetry(0, 6)).toBe(true)
    expect(shouldRetry(5, 6)).toBe(true)
  })

  it('should return false when attemptCount >= maxAttempts', () => {
    expect(shouldRetry(6, 6)).toBe(false)
    expect(shouldRetry(7, 6)).toBe(false)
  })

  it('should handle maxAttempts=1 (edge case — first attempt allowed)', () => {
    // maxAttempts=1 means exactly 1 attempt allowed; attemptCount=0 is the first
    expect(shouldRetry(0, 1)).toBe(true)
    // second attempt (count=1) exceeds ceiling
    expect(shouldRetry(1, 1)).toBe(false)
  })
})

// ─── isTerminalFailureStatus ──────────────────────────────────────────────────

describe('isTerminalFailureStatus', () => {
  it('should return true only for failed status', () => {
    expect(isTerminalFailureStatus('failed')).toBe(true)
  })

  it('should return false for pending, processing, dispatched', () => {
    expect(isTerminalFailureStatus('pending')).toBe(false)
    expect(isTerminalFailureStatus('processing')).toBe(false)
    expect(isTerminalFailureStatus('dispatched')).toBe(false)
  })
})

// ─── isTerminalStatus ─────────────────────────────────────────────────────────

describe('isTerminalStatus', () => {
  it('should return true for dispatched and failed', () => {
    expect(isTerminalStatus('dispatched')).toBe(true)
    expect(isTerminalStatus('failed')).toBe(true)
  })

  it('should return false for pending and processing', () => {
    expect(isTerminalStatus('pending')).toBe(false)
    expect(isTerminalStatus('processing')).toBe(false)
  })
})

// ─── isRead ──────────────────────────────────────────────────────────────────

describe('isRead', () => {
  it('should return true when readAt is set', () => {
    expect(isRead('2026-07-20T12:00:00.000Z')).toBe(true)
  })

  it('should return false when readAt is null', () => {
    expect(isRead(null)).toBe(false)
  })
})

// ─── isSent ──────────────────────────────────────────────────────────────────

describe('isSent', () => {
  it('should return true when sentAt is set', () => {
    expect(isSent('2026-07-20T12:00:00.000Z')).toBe(true)
  })

  it('should return false when sentAt is null', () => {
    expect(isSent(null)).toBe(false)
  })
})
