/**
 * S22 — Recurrent event types.
 *
 * Defines the RRULE subset for Operating Core recurrent events:
 * - RecurrenceFreq: daily, weekly, monthly, yearly
 * - RecurrenceRule: the subset of RRULE fields we support
 * - MaterializationInput/Result: for the materialize RPC
 * - MaterializedInstance: a materialized occurrence
 */

export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly'

/**
 * Supported RRULE subset for Operating Core events.
 * Per spec: freq, interval, count, until, byDay, start_time.
 */
export interface RecurrenceRule {
  readonly freq: RecurrenceFreq
  readonly interval: number
  /** Total number of instances to generate; null = unlimited */
  readonly count: number | null
  /** Stop generating after this date (ISO YYYY-MM-DD); null = use count */
  readonly until: string | null
  /** Weekdays to generate (0=Sunday, 6=Saturday); null = all days */
  readonly byDay: ReadonlyArray<number> | null
  /** HH:mm start time for each generated instance */
  readonly startTime: string | null
}

/**
 * Input for materializing event instances.
 */
export interface MaterializationInput {
  readonly event_id: string
  readonly horizon_days: number
  readonly now_iso: string
}

/**
 * A single materialized event instance.
 * Uses camelCase for domain consistency (mirrors OperatingCoreEventInstance in types.ts).
 */
export interface MaterializedInstance {
  readonly id: string
  readonly eventId: string
  readonly instanceDate: string
  readonly estado: 'active' | 'cancelled'
  readonly lifecycle: 'scheduled' | 'ongoing' | 'completed' | 'cancelled'
  readonly startTime: string
  readonly endTime: string
  readonly capacityOperativa: number
  readonly recurrenceRule: RecurrenceRule | null
  readonly horizonDays: number
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
}

/**
 * Result of a materialization operation.
 */
export interface MaterializationResult {
  readonly inserted: number
  readonly skipped: number
  readonly out_of_horizon: boolean
  readonly error?: {
    readonly code: 'out_of_horizon'
    readonly horizon_days: number
    readonly requested_date: string
  }
}

/**
 * Out-of-horizon error response shape.
 * Returned as HTTP 400 when materialization is requested beyond the horizon.
 */
export interface OutOfHorizonError {
  readonly code: 'out_of_horizon'
  readonly horizon_days: number
  readonly requested_date: string
}
