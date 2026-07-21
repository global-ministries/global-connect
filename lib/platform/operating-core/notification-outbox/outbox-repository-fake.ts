/**
 * S17 — In-memory fake implementation of OutboxRepository.
 *
 * Suitable for unit tests. Not used in production.
 */

import type { OperatingCoreNotificationOutboxEntry } from './outbox-types'
import type { OutboxRepository } from './outbox-repository'

interface InMemoryEntry {
  entry: OperatingCoreNotificationOutboxEntry
  locked: boolean
}

/**
 * Creates an in-memory OutboxRepository for testing.
 *
 * The fake maintains an internal array of entries and simulates
 * the FOR UPDATE SKIP LOCKED claim behavior by tracking lock state.
 *
 * @param seedEntries - optional initial entries to populate the store
 */
export function createInMemoryOutboxRepository(
  seedEntries?: readonly OperatingCoreNotificationOutboxEntry[],
): OutboxRepository & {
  entries: readonly InMemoryEntry[]
  reset: () => void
  seed: (entries: readonly OperatingCoreNotificationOutboxEntry[]) => void
} {
  const store: Map<string, InMemoryEntry> = new Map()
  let lockCounter = 0

  function reset() {
    store.clear()
    lockCounter = 0
  }

  function seed(entries: readonly OperatingCoreNotificationOutboxEntry[]): void {
    for (const entry of entries) {
      store.set(entry.id, { entry, locked: false })
    }
  }

  // Apply seed if provided
  if (seedEntries) {
    seed(seedEntries)
  }

  async function claim(
    batchSize: number,
    _lockTimeoutMs: number,
  ): Promise<readonly OperatingCoreNotificationOutboxEntry[]> {
    const clampedSize = Math.min(Math.max(Math.trunc(batchSize), 1), 50)
    const now = new Date().toISOString()
    const candidates: InMemoryEntry[] = []

    for (const [_id, item] of Array.from(store.entries())) {
      if (item.locked) continue
      const entry = item.entry

      if (
        (entry.status === 'pending' && entry.availableAt <= now) ||
        (entry.status === 'processing' && entry.lockedAt !== null)
      ) {
        candidates.push(item)
        if (candidates.length >= clampedSize) break
      }
    }

    // Claim (lock) the candidates
    for (const item of candidates) {
      const current = store.get(item.entry.id)
      if (!current || current.locked) continue
      const updatedEntry: OperatingCoreNotificationOutboxEntry = {
        ...current.entry,
        status: 'processing',
        lockedAt: now,
        lockedBy: `fake-instance-${++lockCounter}`,
        updatedAt: now,
      }
      store.set(current.entry.id, { entry: updatedEntry, locked: true })
    }

    return candidates.map((c) => store.get(c.entry.id)!.entry)
  }

  async function markDispatched(id: string): Promise<void> {
    const item = store.get(id)
    if (!item || !item.locked) return
    const now = new Date().toISOString()
    const updatedEntry: OperatingCoreNotificationOutboxEntry = {
      ...item.entry,
      status: 'dispatched',
      dispatchedAt: now,
      updatedAt: now,
      lockedAt: null,
      lockedBy: null,
    }
    store.set(id, { entry: updatedEntry, locked: false })
  }

  async function markFailed(
    id: string,
    lastError: string,
    nextAttemptAt: string,
  ): Promise<void> {
    const item = store.get(id)
    if (!item || !item.locked) return
    const now = new Date().toISOString()
    const nextCount = item.entry.attemptCount + 1
    const newStatus =
      nextCount >= item.entry.maxAttempts ? 'failed' : 'pending'
    const updatedEntry: OperatingCoreNotificationOutboxEntry = {
      ...item.entry,
      status: newStatus,
      attemptCount: nextCount,
      lastError,
      availableAt: newStatus === 'pending' ? nextAttemptAt : item.entry.availableAt,
      lockedAt: null,
      lockedBy: null,
      updatedAt: now,
    }
    store.set(id, { entry: updatedEntry, locked: false })
  }

  return {
    claim,
    markDispatched,
    markFailed,
    get entries() {
      return Array.from(store.values())
    },
    reset,
    seed,
  }
}
