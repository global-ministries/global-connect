/**
 * S22 — RecurrentEventRepository Supabase adapter.
 *
 * 6th OC Supabase adapter.
 * Uses the `operating_core_materialize_event_instances` RPC for atomic,
 * idempotent materialization.
 *
 * NOTE: operating_core_event_instances with recurrence fields is a future-apply
 * migration (S22). This adapter uses a relaxed SupabaseClient type to allow
 * compile-time use before the migration is applied. Runtime safety is enforced
 * by Postgres.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RecurrentEventRepository } from './recurrent-repository'
import type { MaterializationInput, MaterializedInstance } from './recurrent-types'
import type { OperatingCoreEventInstanceRowWithRecurrence } from './recurrent-sql-row'

// Relaxed client type — future-apply table not yet in generated Database types
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberate type relaxation for future-apply table
type AnySupabaseClient = SupabaseClient<any, any>

export interface RecurrentRepositorySupabaseOptions {
  supabase: AnySupabaseClient
}

const TABLE = 'operating_core_event_instances' as const

/**
 * Map a SQL row to the domain MaterializedInstance type.
 */
function mapRowToDomain(row: OperatingCoreEventInstanceRowWithRecurrence): MaterializedInstance {
  return {
    id: row.id,
    eventId: row.event_id,
    instanceDate: row.instance_date,
    estado: row.estado as 'active' | 'cancelled',
    lifecycle: row.lifecycle as 'scheduled' | 'ongoing' | 'completed' | 'cancelled',
    startTime: row.start_time,
    endTime: row.end_time,
    capacityOperativa: row.capacity_operativa,
    recurrenceRule: (row.recurrence_rule ?? null) as MaterializedInstance['recurrenceRule'],
    horizonDays: row.horizon_days,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createSupabaseRecurrentRepository(
  options: RecurrentRepositorySupabaseOptions,
): RecurrentEventRepository {
  const { supabase } = options

  return {
    async materialize(
      input: MaterializationInput,
    ): Promise<readonly MaterializedInstance[]> {
      const { event_id, horizon_days, now_iso } = input

      const { data, error } = await supabase.rpc(
        'operating_core_materialize_event_instances',
        {
          p_event_id: event_id,
          p_horizon_days: horizon_days,
          p_now_iso: now_iso,
        },
      )

      if (error || !data) {
        // RPC failed or returned nothing — return empty
        return []
      }

      const rows = data as OperatingCoreEventInstanceRowWithRecurrence[]
      return rows.map(mapRowToDomain)
    },

    async getById(id: string): Promise<MaterializedInstance | null> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .select()
        .eq('id', id)
        .maybeSingle()

      if (error || !data) return null
      return mapRowToDomain(data as OperatingCoreEventInstanceRowWithRecurrence)
    },

    async listByEvent(
      eventId: string,
      range?: { readonly from: string; readonly to: string },
    ): Promise<readonly MaterializedInstance[]> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any).from(TABLE).select().eq('event_id', eventId)

      if (range) {
        query = query.gte('instance_date', range.from).lte('instance_date', range.to)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)

      const rows = (data ?? []) as OperatingCoreEventInstanceRowWithRecurrence[]
      return rows.map(mapRowToDomain)
    },
  }
}
