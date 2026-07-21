/**
 * S17 — Pure state machine functions for the notification outbox.
 *
 * No side effects. These functions encode the business rules:
 * - Retry eligibility (bounded exponential backoff)
 * - Payload PII validation (non-PII assertion)
 * - Next attempt delay calculation
 */

import type { OperatingCoreNotificationOutboxEntry } from './outbox-types'

// ---------------------------------------------------------------------------
// PII keys that MUST NOT appear in any outbox payload
// ---------------------------------------------------------------------------

const PII_KEYS = new Set<string>([
  'cedula',
  'telefono',
  'email',
  'nombre',
  'apellido',
  'name',
  'lastname',
  'first_name',
  'last_name',
  'phone',
  'mobile',
  'celular',
  'correo',
  'mail',
])

// ---------------------------------------------------------------------------
// Retry eligibility
// ---------------------------------------------------------------------------

/**
 * Returns true when the entry can be retried (has not exhausted max_attempts).
 */
export function canRetry(entry: OperatingCoreNotificationOutboxEntry): boolean {
  return entry.attemptCount + 1 < entry.maxAttempts
}

/**
 * Returns true when the entry has reached terminal failure.
 */
export function isTerminalFailure(entry: OperatingCoreNotificationOutboxEntry): boolean {
  return entry.attemptCount >= entry.maxAttempts
}

// ---------------------------------------------------------------------------
// Exponential backoff — returns delay in milliseconds
// ---------------------------------------------------------------------------

/**
 * Computes the next retry delay using bounded exponential backoff.
 * Cap: 5 minutes (300_000 ms) after 9+ attempts.
 *
 * @param attemptNumber — the 1-based attempt count (NOT zero-based)
 */
export function nextAttemptDelay(attemptNumber: number): number {
  if (!Number.isFinite(attemptNumber) || attemptNumber < 1) return 60_000
  // 2^attempt, capped at 300s
  const seconds = Math.min(300, 2 ** Math.min(attemptNumber, 9))
  return seconds * 1000
}

// ---------------------------------------------------------------------------
// Payload validation — non-PII assertion
// ---------------------------------------------------------------------------

/**
 * Validates that a payload contains no PII keys.
 * Returns true when the payload is safe to store without privacy risk.
 *
 * The validation checks top-level keys only (shallow scan) — deep inspection
 * is the caller's responsibility. This mirrors the jsonb CHECK constraint
 * in the migration which enforces the same discipline at the DB layer.
 */
export function validatePayload(payload: unknown): boolean {
  if (payload === null || payload === undefined) return true
  if (typeof payload !== 'object') return true

  const obj = payload as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    const normalized = key.toLowerCase()
    if (PII_KEYS.has(normalized)) return false
  }

  return true
}

// ---------------------------------------------------------------------------
// Status transition guards
// ---------------------------------------------------------------------------

/**
 * Returns true when the entry is in a state that allows dispatch attempts.
 */
export function isDispatchable(entry: OperatingCoreNotificationOutboxEntry): boolean {
  return entry.status === 'pending' || entry.status === 'processing'
}

/**
 * Returns true when the entry has completed successfully.
 */
export function isDispatched(entry: OperatingCoreNotificationOutboxEntry): boolean {
  return entry.status === 'dispatched'
}

/**
 * Returns true when the entry is in a terminal state (dispatched or failed).
 */
export function isTerminal(entry: OperatingCoreNotificationOutboxEntry): boolean {
  return entry.status === 'dispatched' || entry.status === 'failed'
}
