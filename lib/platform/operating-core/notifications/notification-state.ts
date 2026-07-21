/**
 * S19 — Pure state machine functions for notification read/sent state,
 * retry backoff, and terminal failure.
 *
 * No side effects. Encodes:
 * - Exponential backoff math (base 2^attempt * baseDelaySeconds)
 * - Terminal failure detection (attemptCount >= maxAttempts)
 * - read_at / sent_at null checks
 */

import type { NextRetryResult } from './notification-state-types'

// ---------------------------------------------------------------------------
// Exponential backoff
// ---------------------------------------------------------------------------

/**
 * Computes the next retry timestamp using bounded exponential backoff.
 *
 * @param currentAttempt  - 0-based attempt index (0 = first attempt, 1 = second, etc.)
 * @param maxAttempts     - ceiling; when currentAttempt + 1 >= maxAttempts → terminal
 * @param baseDelaySeconds - base delay in seconds (e.g., 60 for 1 minute)
 * @param nowIso         - ISO timestamp string representing "now"
 * @returns next retry ISO timestamp, or { terminal: true } if exhausted
 *
 * Formula: delay = baseDelaySeconds * 2^currentAttempt
 * Example (base=60s): attempt 0→60s, attempt 1→120s, attempt 2→240s …
 */
export function nextRetryAt(
  currentAttempt: number,
  maxAttempts: number,
  baseDelaySeconds: number,
  nowIso: string,
): NextRetryResult {
  if (currentAttempt + 1 >= maxAttempts) {
    return { terminal: true }
  }

  const delaySeconds = baseDelaySeconds * 2 ** currentAttempt
  const nowMs = new Date(nowIso).getTime()
  const nextMs = nowMs + delaySeconds * 1000
  return { nextRetryAt: new Date(nextMs).toISOString() }
}

// ---------------------------------------------------------------------------
// Retry eligibility
// ---------------------------------------------------------------------------

/**
 * Returns true when retry is allowed (attempt count strictly below ceiling).
 */
export function shouldRetry(attemptCount: number, maxAttempts: number): boolean {
  return attemptCount < maxAttempts
}

// ---------------------------------------------------------------------------
// Terminal state
// ---------------------------------------------------------------------------

/**
 * Returns true when the status is the terminal `failed` state.
 * Note: `dispatched` is also terminal in the sense no further action is needed,
 * but this function only identifies the explicit `failed` status.
 */
export function isTerminalFailureStatus(status: 'pending' | 'processing' | 'dispatched' | 'failed'): boolean {
  return status === 'failed'
}

/**
 * Returns true when the status is terminal (dispatched or failed).
 */
export function isTerminalStatus(status: 'pending' | 'processing' | 'dispatched' | 'failed'): boolean {
  return status === 'dispatched' || status === 'failed'
}

// ---------------------------------------------------------------------------
// read_at / sent_at helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the notification has been read (read_at is set).
 */
export function isRead(readAt: string | null): boolean {
  return readAt !== null
}

/**
 * Returns true when the email notification has been sent (sent_at is set).
 */
export function isSent(sentAt: string | null): boolean {
  return sentAt !== null
}
