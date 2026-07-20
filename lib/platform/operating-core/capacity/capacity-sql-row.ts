/**
 * SQL schema mirror for `operating_core_capacity_overrides`.
 * Hand-written (NOT regenerated into database.types.ts per program rules).
 * Source: supabase/migrations/20260720170000_operating_core_capacity_overrides.sql
 */

export type OperatingCoreCapacitySourceSql = 'base' | 'override'

export interface OperatingCoreCapacityOverrideRow {
  event_id: string
  capacity_operativa: number
  capacity_base_snapshot: number
  reason: string
  set_by_persona_id: string
  set_at: string
}

export function isOverrideValid(row: OperatingCoreCapacityOverrideRow): boolean {
  return row.capacity_operativa <= row.capacity_base_snapshot && row.capacity_operativa >= 0
}
