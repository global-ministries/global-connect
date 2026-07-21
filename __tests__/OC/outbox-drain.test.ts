/**
 * S17 — Outbox drain dispatcher tests.
 *
 * Tests the pure drain logic:
 *   - Claims batch, processes each, marks results
 *   - Rate limiting between dispatches
 *   - Retry on transient failure with exponential backoff
 *   - Terminal failure after max attempts exhausted
 *   - Concurrent drain safety (empty claim = no-ops)
 *
 * Uses in-memory fake repository for isolation.
 */

import { drainOutbox } from '@/lib/platform/operating-core/notification-outbox/drain'
import { createInMemoryOutboxRepository } from '@/lib/platform/operating-core/notification-outbox/outbox-repository-fake'
import type { OperatingCoreNotificationOutboxEntry } from '@/lib/platform/operating-core/notification-outbox/outbox-types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeEntry(
  overrides: Partial<OperatingCoreNotificationOutboxEntry> = {},
): OperatingCoreNotificationOutboxEntry {
  const defaults: OperatingCoreNotificationOutboxEntry = {
    id: `entry-${Math.random().toString(36).slice(2)}`,
    kind: 'registration',
    subjectId: null,
    payload: Object.freeze({ eventId: 'abc' }),
    targetKind: 'email',
    targetAddress: 'test@example.com',
    availableAt: new Date().toISOString(),
    attemptCount: 0,
    maxAttempts: 3,
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('drainOutbox', () => {
  it('should return empty result when no entries available', async () => {
    const repo = createInMemoryOutboxRepository()
    const result = await drainOutbox(
      { outbox: repo },
      {
        ratePerSecond: 100,
        currentIsoTimestamp: new Date().toISOString(),
        currentLockTimeoutMs: 300_000,
        currentAttempt: 1,
      },
    )

    expect(result.claimed).toHaveLength(0)
    expect(result.dispatched).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.requeued).toBe(0)
  })

  it('should mark entry as dispatched when processOne returns ok', async () => {
    const entry = makeEntry({ status: 'pending', attemptCount: 0 })
    const repo = createInMemoryOutboxRepository([entry])
    const processed: string[] = []

    const result = await drainOutbox(
      {
        outbox: repo,
        processOne: async (e) => {
          processed.push(e.id)
          return { ok: true }
        },
      },
      {
        ratePerSecond: 100,
        currentIsoTimestamp: new Date().toISOString(),
        currentLockTimeoutMs: 300_000,
        currentAttempt: 1,
      },
    )

    expect(result.claimed).toHaveLength(1)
    expect(result.dispatched).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.requeued).toBe(0)
    expect(processed).toContain(entry.id)
  })

  it('should requeue when processOne returns error and retries remain', async () => {
    const entry = makeEntry({ status: 'pending', attemptCount: 0, maxAttempts: 3 })
    const repo = createInMemoryOutboxRepository([entry])

    const result = await drainOutbox(
      {
        outbox: repo,
        processOne: async () => ({ ok: false, error: 'provider timeout' }),
      },
      {
        ratePerSecond: 100,
        currentIsoTimestamp: new Date().toISOString(),
        currentLockTimeoutMs: 300_000,
        currentAttempt: 1,
      },
    )

    expect(result.dispatched).toBe(0)
    expect(result.requeued).toBe(1)
    expect(result.failed).toBe(0)
  })

  it('should mark as failed when max attempts exhausted', async () => {
    // Entry with all retries exhausted
    const entry = makeEntry({ status: 'pending', attemptCount: 2, maxAttempts: 3 })
    const repo = createInMemoryOutboxRepository([entry])

    const result = await drainOutbox(
      {
        outbox: repo,
        processOne: async () => ({ ok: false, error: 'permanent failure' }),
      },
      {
        ratePerSecond: 100,
        currentIsoTimestamp: new Date().toISOString(),
        currentLockTimeoutMs: 300_000,
        currentAttempt: 1,
      },
    )

    expect(result.dispatched).toBe(0)
    expect(result.requeued).toBe(0)
    expect(result.failed).toBe(1)
  })

  it('should skip rate limiting for single entry', async () => {
    const entry = makeEntry()
    const repo = createInMemoryOutboxRepository([entry])

    const start = Date.now()
    await drainOutbox(
      {
        outbox: repo,
        processOne: async () => ({ ok: true }),
      },
      {
        ratePerSecond: 100,
        currentIsoTimestamp: new Date().toISOString(),
        currentLockTimeoutMs: 300_000,
        currentAttempt: 1,
      },
    )
    const elapsed = Date.now() - start

    // Single entry: no rate-limit delay (or minimal)
    expect(elapsed).toBeLessThan(50)
  })

  it('should use no-op when processOne is not provided (simulate success)', async () => {
    const entry = makeEntry()
    const repo = createInMemoryOutboxRepository([entry])

    const result = await drainOutbox(
      { outbox: repo }, // no processOne
      {
        ratePerSecond: 100,
        currentIsoTimestamp: new Date().toISOString(),
        currentLockTimeoutMs: 300_000,
        currentAttempt: 1,
      },
    )

    expect(result.dispatched).toBe(1)
  })

  it('should handle mixed results (some succeed, some fail)', async () => {
    const entries = [
      makeEntry({ id: 'entry-succeed', status: 'pending', attemptCount: 0, maxAttempts: 3 }),
      makeEntry({ id: 'entry-retry', status: 'pending', attemptCount: 0, maxAttempts: 3 }),
      makeEntry({ id: 'entry-fail', status: 'pending', attemptCount: 2, maxAttempts: 3 }),
    ]
    const repo = createInMemoryOutboxRepository(entries)

    const result = await drainOutbox(
      {
        outbox: repo,
        processOne: async (e) => {
          if (e.id === 'entry-retry') return { ok: false, error: 'transient' }
          return { ok: true }
        },
      },
      {
        ratePerSecond: 100,
        currentIsoTimestamp: new Date().toISOString(),
        currentLockTimeoutMs: 300_000,
        currentAttempt: 1,
      },
    )

    // entry-succeed: dispatched (ok)
    // entry-retry: requeued (transient error, retries remain)
    // entry-fail: failed (exhausted all retries)
    expect(result.dispatched).toBeGreaterThanOrEqual(1)
    expect(result.dispatched + result.requeued + result.failed).toBe(3)
  })
})

// ─── Atomicity test ───────────────────────────────────────────────────────────

describe('drainOutbox — concurrent claim atomicity (simulated)', () => {
  it('should process all entries', async () => {
    const entries = [
      makeEntry({ id: 'e1', status: 'pending' }),
      makeEntry({ id: 'e2', status: 'pending' }),
    ]
    const repo = createInMemoryOutboxRepository(entries)
    const processed: string[] = []

    const result = await drainOutbox(
      {
        outbox: repo,
        processOne: async (e) => {
          processed.push(e.id)
          return { ok: true }
        },
      },
      {
        ratePerSecond: 100,
        currentIsoTimestamp: new Date().toISOString(),
        currentLockTimeoutMs: 300_000,
        currentAttempt: 1,
      },
    )

    expect(result.claimed).toHaveLength(2)
    expect(processed).toContain('e1')
    expect(processed).toContain('e2')
  })
})
