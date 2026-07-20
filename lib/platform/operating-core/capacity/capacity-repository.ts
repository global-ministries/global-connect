/**
 * S12 — Capacity repository interface.
 * Pure TypeScript — no Supabase, no SQL.
 * The alert hook is a simple pub/sub consumed by S19 notifications.
 */
import type {
  CapacityBase,
  CapacityOverride,
  CapacitySnapshot,
  CapacityAlert,
  CapacityScope,
} from './capacity-types'

export { CapacityScope }

export interface SetOverrideInput {
  eventInstanceId: string
  base: CapacityBase
  override: CapacityOverride | null
}

export interface CapacityAlertHook {
  alerts: readonly CapacityAlert[]
  subscribe?: (cb: (a: CapacityAlert) => void) => () => void
}

export interface CapacityRepository {
  getCurrent(eventInstanceId: string): Promise<CapacitySnapshot>
  setOverride(input: SetOverrideInput): Promise<CapacitySnapshot>
  getAlertHook(): CapacityAlertHook
}
