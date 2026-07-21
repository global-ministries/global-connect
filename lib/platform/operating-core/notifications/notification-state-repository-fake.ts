/**
 * S19 — In-memory fake implementation of NotificationStateRepository.
 *
 * Suitable for unit tests. Not used in production.
 */

import type {
  NotificationStateRepository,
  SystemNotificationSummary,
} from './notification-state-repository'

interface SystemNotification {
  id: string
  personaId: string
  outboxId: string | null
  kind: string
  title: string
  body: string
  targetUrl: string | null
  readAt: string | null
  expiresAt: string
  createdAt: string
}

interface OutboxEntryState {
  status: 'pending' | 'processing' | 'dispatched' | 'failed'
  attemptCount: number
  sentAt: string | null
  nextRetryAt: string | null
}

/**
 * Creates an in-memory NotificationStateRepository for testing.
 */
export function createNotificationStateRepositoryFake(): NotificationStateRepository & {
  reset: () => void
} {
  const outboxStore = new Map<string, OutboxEntryState>()
  const systemNotifStore = new Map<string, SystemNotification>()
  let systemNotifCounter = 0

  function reset() {
    outboxStore.clear()
    systemNotifStore.clear()
    systemNotifCounter = 0
  }

  async function markSent(outboxId: string, sentAt: string): Promise<void> {
    const entry = outboxStore.get(outboxId)
    if (!entry) return
    outboxStore.set(outboxId, { ...entry, sentAt, status: 'dispatched' })
  }

  async function setNextRetry(outboxId: string, nextRetryAt: string): Promise<void> {
    const entry = outboxStore.get(outboxId)
    if (!entry) return
    outboxStore.set(outboxId, { ...entry, nextRetryAt })
  }

  async function markTerminal(outboxId: string): Promise<void> {
    const entry = outboxStore.get(outboxId)
    if (!entry) return
    outboxStore.set(outboxId, { ...entry, status: 'failed', nextRetryAt: null })
  }

  async function getOutboxEntry(id: string) {
    const entry = outboxStore.get(id)
    if (!entry) return null
    return {
      status: entry.status,
      attemptCount: entry.attemptCount,
      sentAt: entry.sentAt,
      nextRetryAt: entry.nextRetryAt,
    }
  }

  async function createSystemNotification(input: {
    personaId: string
    outboxId: string | null
    kind: string
    title: string
    body: string
    targetUrl?: string
    expiresAt: string
  }): Promise<{ id: string }> {
    const id = `fake-notif-${++systemNotifCounter}`
    const now = new Date().toISOString()
    const notif: SystemNotification = {
      id,
      personaId: input.personaId,
      outboxId: input.outboxId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      targetUrl: input.targetUrl ?? null,
      readAt: null,
      expiresAt: input.expiresAt,
      createdAt: now,
    }
    systemNotifStore.set(id, notif)
    return { id }
  }

  async function listUnreadForPersona(
    personaId: string,
    limit: number,
  ): Promise<readonly SystemNotificationSummary[]> {
    const results: SystemNotificationSummary[] = []
    for (const notif of systemNotifStore.values()) {
      if (notif.personaId === personaId && notif.readAt === null) {
        results.push({
          id: notif.id,
          title: notif.title,
          body: notif.body,
          targetUrl: notif.targetUrl,
          createdAt: notif.createdAt,
        })
        if (results.length >= limit) break
      }
    }
    return results
  }

  async function markRead(id: string, readAt: string): Promise<void> {
    const notif = systemNotifStore.get(id)
    if (!notif) return
    systemNotifStore.set(id, { ...notif, readAt })
  }

  return {
    markSent,
    setNextRetry,
    markTerminal,
    getOutboxEntry,
    createSystemNotification,
    listUnreadForPersona,
    markRead,
    reset,
  }
}
