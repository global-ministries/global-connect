/**
 * S12 — Capacity repository in-memory fake.
 * Thread-hostile; use only in tests.
 */
import type {
  CapacitySnapshot,
  CapacityAlert,
} from './capacity-types'
import { validateOverride, diffForAlert } from './capacity-validator'
import type {
  CapacityRepository,
  SetOverrideInput,
  CapacityAlertHook,
} from './capacity-repository'

interface SnapshotEntry {
  snapshot: CapacitySnapshot
}

export function createCapacityRepositoryFake(): CapacityRepository {
  const store = new Map<string, SnapshotEntry>()
  const alertListeners = new Set<(a: CapacityAlert) => void>()
  const emittedAlerts: CapacityAlert[] = []

  return {
    async getCurrent(eventInstanceId: string): Promise<CapacitySnapshot> {
      const entry = store.get(eventInstanceId)
      if (!entry) {
        throw new Error(
          `No capacity snapshot found for eventInstanceId "${eventInstanceId}". ` +
            'Call setOverride first to initialize.',
        )
      }
      return entry.snapshot
    },

    async setOverride(input: SetOverrideInput): Promise<CapacitySnapshot> {
      const { eventInstanceId, base, override } = input

      // Get previous snapshot for alert diff
      const prevEntry = store.get(eventInstanceId)
      const prevSnap: CapacitySnapshot | null = prevEntry?.snapshot ?? null

      // Validate BEFORE any persistence — domain layer rejects above-base
      const validation = validateOverride(base, override)
      if (!validation.ok) {
        // Return a failure snapshot — never persisted
        // Reflects the rejection: override not applied, effective = base
        const failureSnap: CapacitySnapshot = {
          base,
          override: null,
          effective: base.value,
        }
        return failureSnap
      }

      const nextSnap = validation.snapshot

      // Persist validated snapshot
      store.set(eventInstanceId, { snapshot: nextSnap })

      // Emit alert if applicable (compare prev and next)
      if (prevSnap) {
        const detectedAt = new Date().toISOString()
        const setByPersonaId = override?.setByPersonaId ?? 'unknown'
        const alert = diffForAlert(prevSnap, nextSnap, setByPersonaId, detectedAt)
        if (alert) {
          emittedAlerts.push(alert)
          for (const listener of alertListeners) {
            listener(alert)
          }
        }
      }

      return nextSnap
    },

    getAlertHook(): CapacityAlertHook {
      return {
        alerts: emittedAlerts,
        subscribe(callback: (a: CapacityAlert) => void): () => void {
          alertListeners.add(callback)
          return () => {
            alertListeners.delete(callback)
          }
        },
      }
    },
  }
}
