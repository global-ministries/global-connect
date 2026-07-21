/**
 * S19 — NotificationStateRepository interface.
 *
 * Abstracts data access for:
 *   - Outbox sent_at and next_retry_at mutations (S17 outbox extension)
 *   - System notifications (in-app) with read_at tracking
 *
 * Implementations: in-memory fake (tests) and Supabase adapter (production).
 */

export interface SystemNotificationSummary {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly targetUrl: string | null
  readonly createdAt: string
}

export interface NotificationStateRepository {
  // ─── Outbox mutations (extend S17 outbox) ────────────────────────────────

  /**
   * Marks an outbox entry as sent (email dispatched).
   */
  markSent(outboxId: string, sentAt: string): Promise<void>

  /**
   * Sets the next retry timestamp for an outbox entry.
   */
  setNextRetry(outboxId: string, nextRetryAt: string): Promise<void>

  /**
   * Marks an outbox entry as terminal (failed after max attempts).
   */
  markTerminal(outboxId: string): Promise<void>

  /**
   * Fetches the current state of an outbox entry for retry decisioning.
   * Returns null if the entry does not exist.
   */
  getOutboxEntry(
    id: string,
  ): Promise<{
    status: 'pending' | 'processing' | 'dispatched' | 'failed'
    attemptCount: number
    sentAt: string | null
    nextRetryAt: string | null
  } | null>

  // ─── System notifications ────────────────────────────────────────────────

  /**
   * Creates a new system (in-app) notification.
   */
  createSystemNotification(input: {
    personaId: string
    outboxId: string | null
    kind: string
    title: string
    body: string
    targetUrl?: string
    expiresAt: string
  }): Promise<{ id: string }>

  /**
   * Lists unread system notifications for a persona.
   */
  listUnreadForPersona(
    personaId: string,
    limit: number,
  ): Promise<readonly SystemNotificationSummary[]>

  /**
   * Marks a system notification as read.
   */
  markRead(id: string, readAt: string): Promise<void>
}
