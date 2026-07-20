/**
 * S17 — Drain dispatcher for Operating Core notification outbox.
 *
 * The drain is responsible for:
 *   1. Claiming a batch of pending entries via the repository
 *   2. Processing each entry (calling processOne hook)
 *   3. Marking dispatched on success
 *   4. Marking failed with exponential backoff on failure
 *   5. Enforcing rate limiting between dispatches
 *
 * The drain itself is pure — all I/O is through the repository and processOne.
 */

import type {
  DrainResult,
  OperatingCoreNotificationOutboxEntry,
} from './outbox-types'
import type { OutboxRepository } from './outbox-repository'
import { canRetry, nextAttemptDelay } from './outbox-state'

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface DrainOptions {
  /** Maximum dispatches per second (from env: operating_core.drain.rate_per_second) */
  ratePerSecond: number
  /** Current ISO timestamp used for scheduling — injectable for tests */
  currentIsoTimestamp: string
  /** Stale lock recovery timeout in milliseconds (typically 5 minutes) */
  currentLockTimeoutMs: number
  /** Current attempt number — used for backoff calculation */
  currentAttempt: number
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface DrainDeps {
  /** Repository for claiming, marking dispatched/failed */
  outbox: OutboxRepository
  /**
   * Optional processor hook. When provided, called for each claimed entry.
   * When omitted, the drain simulates successful dispatch (no-op).
   *
   * The hook returns { ok: true } on success or { ok: false, error: string } on failure.
   */
  processOne?: (
    entry: OperatingCoreNotificationOutboxEntry,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const DEFAULT_RATE_PER_SECOND = 100
const MIN_RATE_PER_SECOND = 1

/**
 * Main drain function.
 *
 * Claims a batch, processes each entry, marks results, and respects
 * the configured rate limit.
 *
 * @param deps - outbox repository and optional processOne hook
 * @param options - rate limit, timestamps, timeouts
 * @returns aggregate drain result
 */
export async function drainOutbox(
  deps: DrainDeps,
  options: DrainOptions,
): Promise<DrainResult> {
  const ratePerSecond = clampRate(options.ratePerSecond)
  const claimed = await deps.outbox.claim(
    50, // batch size — capped at RPC max
    options.currentLockTimeoutMs,
  )

  let dispatched = 0
  let failed = 0
  let requeued = 0

  for (const entry of claimed) {
    // Rate limit between dispatches
    if (dispatched > 0 || failed > 0 || requeued > 0) {
      await sleep(1000 / ratePerSecond)
    }

    const result = await processEntry(deps, entry, options)

    if (result === 'dispatched') {
      dispatched++
    } else if (result === 'failed') {
      failed++
    } else {
      requeued++
    }
  }

  return Object.freeze({
    claimed,
    dispatched,
    failed,
    requeued,
  })
}

/**
 * Process a single entry: call processOne hook, then mark result.
 */
async function processEntry(
  deps: DrainDeps,
  entry: OperatingCoreNotificationOutboxEntry,
  _options: DrainOptions,
): Promise<'dispatched' | 'failed' | 'requeued'> {
  let processResult: { ok: true } | { ok: false; error: string }

  if (deps.processOne) {
    processResult = await deps.processOne(entry)
  } else {
    // No-op simulation — useful for testing lock recovery without delivery logic
    processResult = { ok: true }
  }

  if (processResult.ok) {
    await deps.outbox.markDispatched(entry.id)
    return 'dispatched'
  }

  // Dispatch failed — determine retry vs terminal
  const attemptAfterFailure = entry.attemptCount + 1
  // TypeScript narrowing: after ok check, processResult is { ok: false; error: string }
  const errorMessage = (processResult as { ok: false; error: string }).error ?? 'Unknown dispatch error'

  if (!canRetry(entry)) {
    // Terminal failure — no more retries
    await deps.outbox.markFailed(
      entry.id,
      errorMessage,
      entry.availableAt, // no next attempt
    )
    return 'failed'
  }

  // Schedule retry with exponential backoff
  const delayMs = nextAttemptDelay(attemptAfterFailure)
  const now = Date.now()
  const nextAttemptAt = new Date(now + delayMs).toISOString()

  await deps.outbox.markFailed(entry.id, errorMessage, nextAttemptAt)
  return 'requeued'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampRate(rate: number): number {
  if (!Number.isFinite(rate) || rate < MIN_RATE_PER_SECOND) {
    return DEFAULT_RATE_PER_SECOND
  }
  return Math.min(rate, 1000)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}
