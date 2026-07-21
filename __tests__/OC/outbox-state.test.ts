/**
 * S17 — Outbox state machine tests.
 *
 * RED test first: tests the pure state functions from outbox-state.ts.
 * These are pure functions — no mocks needed.
 */

import {
  canRetry,
  isTerminalFailure,
  nextAttemptDelay,
  validatePayload,
  isDispatchable,
  isDispatched,
  isTerminal,
} from '@/lib/platform/operating-core/notification-outbox/outbox-state'
import type { OperatingCoreNotificationOutboxEntry } from '@/lib/platform/operating-core/notification-outbox/outbox-types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeEntry(
  overrides: Partial<OperatingCoreNotificationOutboxEntry> = {},
): OperatingCoreNotificationOutboxEntry {
  const defaults: OperatingCoreNotificationOutboxEntry = {
    id: '00000000-0000-0000-0000-000000000001',
    kind: 'registration',
    subjectId: null,
    payload: Object.freeze({}),
    targetKind: 'email',
    targetAddress: 'test@example.com',
    availableAt: new Date().toISOString(),
    attemptCount: 0,
    maxAttempts: 5,
    status: 'pending',
    lockedAt: null,
    lockedBy: null,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dispatchedAt: null,
  }
  return Object.freeze({ ...defaults, ...overrides })
}

// ─── canRetry ────────────────────────────────────────────────────────────────

describe('canRetry', () => {
  it('should return true when attemptCount + 1 < maxAttempts', () => {
    const entry = makeEntry({ attemptCount: 0, maxAttempts: 5 })
    expect(canRetry(entry)).toBe(true)
  })

  it('should return true when attemptCount = 3 and maxAttempts = 5', () => {
    const entry = makeEntry({ attemptCount: 3, maxAttempts: 5 })
    expect(canRetry(entry)).toBe(true)
  })

  it('should return false when attemptCount + 1 >= maxAttempts', () => {
    const entry = makeEntry({ attemptCount: 4, maxAttempts: 5 })
    expect(canRetry(entry)).toBe(false)
  })

  it('should return false when attemptCount = maxAttempts', () => {
    const entry = makeEntry({ attemptCount: 5, maxAttempts: 5 })
    expect(canRetry(entry)).toBe(false)
  })
})

// ─── isTerminalFailure ────────────────────────────────────────────────────────

describe('isTerminalFailure', () => {
  it('should return false when attemptCount < maxAttempts', () => {
    const entry = makeEntry({ attemptCount: 4, maxAttempts: 5 })
    expect(isTerminalFailure(entry)).toBe(false)
  })

  it('should return true when attemptCount >= maxAttempts', () => {
    const entry = makeEntry({ attemptCount: 5, maxAttempts: 5 })
    expect(isTerminalFailure(entry)).toBe(true)
  })
})

// ─── nextAttemptDelay ────────────────────────────────────────────────────────

describe('nextAttemptDelay', () => {
  it('should return 2s for attempt 1', () => {
    expect(nextAttemptDelay(1)).toBe(2_000)
  })

  it('should return 4s for attempt 2', () => {
    expect(nextAttemptDelay(2)).toBe(4_000)
  })

  it('should return 256s (2^8) for attempt 8', () => {
    expect(nextAttemptDelay(8)).toBe(256_000)
  })

  it('should cap at 300s for attempt 9+', () => {
    expect(nextAttemptDelay(9)).toBe(300_000)
    expect(nextAttemptDelay(100)).toBe(300_000)
  })

  it('should return 60s for invalid input', () => {
    expect(nextAttemptDelay(0)).toBe(60_000)
    expect(nextAttemptDelay(-1)).toBe(60_000)
    expect(nextAttemptDelay(NaN)).toBe(60_000)
  })
})

// ─── validatePayload ─────────────────────────────────────────────────────────

describe('validatePayload', () => {
  it('should return true for null', () => {
    expect(validatePayload(null)).toBe(true)
  })

  it('should return true for undefined', () => {
    expect(validatePayload(undefined)).toBe(true)
  })

  it('should return true for primitive', () => {
    expect(validatePayload('string')).toBe(true)
    expect(validatePayload(123)).toBe(true)
    expect(validatePayload(true)).toBe(true)
  })

  it('should return true for empty object', () => {
    expect(validatePayload({})).toBe(true)
  })

  it('should return true for non-PII object', () => {
    expect(validatePayload({ eventId: 'abc', kind: 'registration' })).toBe(true)
  })

  it('should return false when cedula is present', () => {
    expect(validatePayload({ cedula: '12345678' })).toBe(false)
  })

  it('should return false when telefono is present (case-insensitive key)', () => {
    expect(validatePayload({ telefono: '555-1234' })).toBe(false)
    expect(validatePayload({ TELEFONO: '555-1234' })).toBe(false)
  })

  it('should return false when email is present', () => {
    expect(validatePayload({ email: 'a@b.com' })).toBe(false)
  })

  it('should return false when nombre is present', () => {
    expect(validatePayload({ nombre: 'Juan' })).toBe(false)
  })

  it('should return false when apellido is present', () => {
    expect(validatePayload({ apellido: 'Perez' })).toBe(false)
  })

  it('should return false for name key (normalized)', () => {
    expect(validatePayload({ name: 'John' })).toBe(false)
  })

  it('should return true for nested objects (shallow scan only)', () => {
    // The shallow scan checks top-level keys only
    expect(validatePayload({ eventId: 'abc', nested: { email: 'a@b.com' } })).toBe(true)
  })
})

// ─── isDispatchable ──────────────────────────────────────────────────────────

describe('isDispatchable', () => {
  it('should return true for pending', () => {
    const entry = makeEntry({ status: 'pending' })
    expect(isDispatchable(entry)).toBe(true)
  })

  it('should return true for processing', () => {
    const entry = makeEntry({ status: 'processing' })
    expect(isDispatchable(entry)).toBe(true)
  })

  it('should return false for dispatched', () => {
    const entry = makeEntry({ status: 'dispatched' })
    expect(isDispatchable(entry)).toBe(false)
  })

  it('should return false for failed', () => {
    const entry = makeEntry({ status: 'failed' })
    expect(isDispatchable(entry)).toBe(false)
  })
})

// ─── isDispatched ────────────────────────────────────────────────────────────

describe('isDispatched', () => {
  it('should return true for dispatched', () => {
    const entry = makeEntry({ status: 'dispatched' })
    expect(isDispatched(entry)).toBe(true)
  })

  it('should return false for pending', () => {
    const entry = makeEntry({ status: 'pending' })
    expect(isDispatched(entry)).toBe(false)
  })
})

// ─── isTerminal ──────────────────────────────────────────────────────────────

describe('isTerminal', () => {
  it('should return true for dispatched', () => {
    const entry = makeEntry({ status: 'dispatched' })
    expect(isTerminal(entry)).toBe(true)
  })

  it('should return true for failed', () => {
    const entry = makeEntry({ status: 'failed' })
    expect(isTerminal(entry)).toBe(true)
  })

  it('should return false for pending', () => {
    const entry = makeEntry({ status: 'pending' })
    expect(isTerminal(entry)).toBe(false)
  })

  it('should return false for processing', () => {
    const entry = makeEntry({ status: 'processing' })
    expect(isTerminal(entry)).toBe(false)
  })
})
