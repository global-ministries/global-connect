/**
 * S22 — Recurrent event repository interface.
 *
 * Defines the contract for materializing and querying recurrent event instances.
 * The materialize() method calls the SQL RPC for atomic, idempotent materialization.
 */

import type { MaterializationInput, MaterializedInstance } from './recurrent-types'

export interface RecurrentEventRepository {
  /**
   * Materialize event instances from a recurrence rule within a horizon.
   *
   * Calls the SQL RPC `operating_core_materialize_event_instances` which is:
   * - Atomic: single RPC call
   * - Idempotent: UNIQUE(event_id, instance_date) + ON CONFLICT DO NOTHING
   * - Deterministic: same (event_id, horizon_days, now_iso) → same result
   *
   * @param input - event_id, horizon_days, now_iso
   * @returns array of materialized instances
   */
  materialize(input: MaterializationInput): Promise<readonly MaterializedInstance[]>

  /**
   * Get a single instance by its id.
   * Returns null if not found.
   */
  getById(instanceId: string): Promise<MaterializedInstance | null>

  /**
   * List all instances for an event, optionally filtered by date range.
   */
  listByEvent(
    eventId: string,
    range?: {
      readonly from: string
      readonly to: string
    },
  ): Promise<readonly MaterializedInstance[]>
}
