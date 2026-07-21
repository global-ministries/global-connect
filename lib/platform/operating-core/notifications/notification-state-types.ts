/**
 * S19 — Domain types for notification read/sent state.
 *
 * These types encode the read_at (in-app) and sent_at (email) timestamps
 * and the retry/backoff/terminal-state machine for the outbox.
 */

/**
 * Represents the read state of a system (in-app) notification.
 */
export interface NotificationReadState {
  readonly read_at: string | null
}

/**
 * Represents the sent state of an email notification.
 */
export interface NotificationSentState {
  readonly sent_at: string | null
}

/**
 * Outbox entry with retry + sent state fields added in S19.
 */
export interface NotificationOutboxStateEntry {
  readonly id: string
  readonly status: 'pending' | 'processing' | 'dispatched' | 'failed'
  readonly attemptCount: number
  readonly maxAttempts: number
  readonly nextRetryAt: string | null
  readonly sentAt: string | null
}

/**
 * Result of computing the next retry timestamp via exponential backoff.
 */
export type NextRetryResult =
  | { readonly nextRetryAt: string }
  | { readonly terminal: true }

/**
 * Input for signed link generation.
 */
export interface SignedLinkInput {
  readonly resourceType: string
  readonly resourceId: string
  readonly personaId: string | null
  readonly ttlDays: number
  readonly secret: string
  readonly nowIso: string
}

/**
 * A generated signed link token with its metadata.
 */
export interface SignedLinkToken {
  readonly token: string
  readonly expiresAt: string
  readonly resourceType: string
  readonly resourceId: string
  readonly personaId: string | null
}

/**
 * Result of verifying a signed link.
 */
export type SignedLinkVerifyResult =
  | { readonly ok: true; readonly payload: SignedLinkToken }
  | { readonly ok: false; readonly reason: 'invalid_signature' | 'expired' | 'malformed' }
