/**
 * S22 — SQL row types for recurrent events.
 *
 * Snake_case row types matching the actual database columns.
 * These are used by the Supabase adapter to map SQL results.
 */

/**
 * OperatingCoreEventInstance row with recurrence fields (S22).
 * Extends the S03 base row with recurrence_rule and horizon_days.
 */
export interface OperatingCoreEventInstanceRowWithRecurrence {
  readonly id: string
  readonly event_id: string
  readonly instance_date: string
  readonly estado: string
  readonly lifecycle: string
  readonly start_time: string
  readonly end_time: string
  readonly capacity_operativa: number
  readonly metadata: Record<string, unknown>
  // S22 new fields:
  readonly recurrence_rule: Record<string, unknown> | null
  readonly horizon_days: number
  readonly created_at: string
  readonly updated_at: string
  readonly version: number
}

/**
 * Domain-mapped MaterializedInstance from SQL row.
 */
export interface MaterializedInstanceDomain {
  readonly id: string
  readonly eventId: string
  readonly instanceDate: string
  readonly estado: 'active' | 'cancelled'
  readonly lifecycle: 'scheduled' | 'ongoing' | 'completed' | 'cancelled'
  readonly startTime: string
  readonly endTime: string
  readonly capacityOperativa: number
  readonly recurrenceRule: Record<string, unknown> | null
  readonly horizonDays: number
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
}
