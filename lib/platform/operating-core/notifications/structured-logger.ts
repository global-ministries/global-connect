/**
 * S19 — Structured logger for notification events.
 *
 * Uses pure console.log(JSON.stringify(...)) for output.
 * NO Sentry. NO third-party observability SDKs.
 *
 * Each log entry contains: timestamp, level, event, and event-specific fields.
 */

export type NotificationLogLevel = 'info' | 'warn' | 'error'

export type NotificationLogEvent =
  | 'claim'
  | 'release'
  | 'retry'
  | 'terminal'
  | 'send'
  | 'read'
  | 'expire'

export interface NotificationLogEntry {
  readonly timestamp: string
  readonly level: NotificationLogLevel
  readonly event: NotificationLogEvent
  readonly outbox_id?: string
  readonly system_notification_id?: string
  readonly attempt?: number
  readonly status?: 'pending' | 'processing' | 'dispatched' | 'failed'
  readonly error?: string
  readonly [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Base emitter
// ---------------------------------------------------------------------------

function emit(entry: Omit<NotificationLogEntry, 'timestamp'>): void {
  const full = {
    ...entry,
    timestamp: new Date().toISOString(),
  } as NotificationLogEntry
  console.log(JSON.stringify(full))
}

// ---------------------------------------------------------------------------
// Event-specific log functions
// ---------------------------------------------------------------------------

/**
 * Logs a claim event — when a drain worker claims an outbox entry.
 */
export function logClaim(
  entry: Omit<NotificationLogEntry, 'event' | 'level' | 'timestamp'>,
): void {
  emit({ ...entry, event: 'claim', level: 'info' })
}

/**
 * Logs a release event — when a claim is released without success.
 */
export function logRelease(
  entry: Omit<NotificationLogEntry, 'event' | 'level' | 'timestamp'>,
): void {
  emit({ ...entry, event: 'release', level: 'info' })
}

/**
 * Logs a retry event — when an entry is rescheduled for retry.
 */
export function logRetry(
  entry: Omit<NotificationLogEntry, 'event' | 'level' | 'timestamp'>,
): void {
  emit({ ...entry, event: 'retry', level: 'warn' })
}

/**
 * Logs a terminal failure event — when retries are exhausted.
 */
export function logTerminal(
  entry: Omit<NotificationLogEntry, 'event' | 'level' | 'timestamp'>,
): void {
  emit({ ...entry, event: 'terminal', level: 'error' })
}

/**
 * Logs a send event — when an email is dispatched.
 */
export function logSend(
  entry: Omit<NotificationLogEntry, 'event' | 'level' | 'timestamp'>,
): void {
  emit({ ...entry, event: 'send', level: 'info' })
}

/**
 * Logs a read event — when a system notification is read.
 */
export function logRead(
  entry: Omit<NotificationLogEntry, 'event' | 'level' | 'timestamp'>,
): void {
  emit({ ...entry, event: 'read', level: 'info' })
}

/**
 * Logs an expire event — when a signed link expires.
 */
export function logExpire(
  entry: Omit<NotificationLogEntry, 'event' | 'level' | 'timestamp'>,
): void {
  emit({ ...entry, event: 'expire', level: 'warn' })
}
