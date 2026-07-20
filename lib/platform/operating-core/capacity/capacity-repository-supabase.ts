/**
 * S13 — Capacity Repository Supabase adapter
 *
 * Mirrors registration-repository-supabase.ts (S10) pattern.
 *
 * Implements CapacityRepository (S12 interface) for the
 * operating_core_capacity_overrides table.
 *
 * RLS enforcement: service_role bypasses RLS; no p_auth_id parameter is ever
 * sent by the client. Identity is bound server-side.
 *
 * NOTE: operating_core_capacity_overrides is a future-apply migration (not yet
 * in generated Database types). This adapter uses a relaxed SupabaseClient type
 * to allow compile-time use before the migration is applied. The actual table
 * name is validated at runtime by Postgres.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CapacityBase, CapacityOverride, CapacitySnapshot } from './capacity-types'
import { validateOverride } from './capacity-validator'
import type { CapacityRepository, SetOverrideInput } from './capacity-repository'

// ─── Types ────────────────────────────────────────────────────────────────────

// Relaxed client type — operating_core_capacity_overrides is not yet in generated
// Database types (future-apply migration). Using SupabaseClient without Database generic
// avoids cast-heavy code while maintaining runtime safety via Postgres.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberate type relaxation for future-apply table
type AnySupabaseClient = SupabaseClient<any, any>

export interface CapacitySupabaseAdapterOptions {
  supabase: AnySupabaseClient
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OVERRIDES_TABLE = 'operating_core_capacity_overrides' as const
const EVENTS_TABLE = 'operating_core_events' as const

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createSupabaseCapacityRepository(
  options: CapacitySupabaseAdapterOptions,
): CapacityRepository {
  const { supabase } = options

  // ── getCurrent ─────────────────────────────────────────────────────────────

  async function getCurrent(eventInstanceId: string): Promise<CapacitySnapshot> {
    // Fetch event base capacity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: event, error: eventError } = await (supabase as any)
      .from(EVENTS_TABLE)
      .select('capacity_base, visibility_scope, id')
      .eq('id', eventInstanceId)
      .maybeSingle()

    if (eventError || !event) {
      throw new Error(`Event ${eventInstanceId} not found`)
    }

    // Fetch override row (if any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: overrideRow } = await (supabase as any)
      .from(OVERRIDES_TABLE)
      .select(
        'capacity_operativa, capacity_base_snapshot, reason, set_by_persona_id, set_at',
      )
      .eq('event_id', eventInstanceId)
      .maybeSingle()

    const base: CapacityBase = {
      value: event.capacity_base,
      scope: 'event',
      effectiveAt: new Date().toISOString(),
    }

    if (!overrideRow) {
      return { base, override: null, effective: base.value }
    }

    const override: CapacityOverride = {
      value: overrideRow.capacity_operativa,
      reason: overrideRow.reason,
      setByPersonaId: overrideRow.set_by_persona_id,
      setAt: overrideRow.set_at,
    }

    return { base, override, effective: override.value }
  }

  // ── setOverride ─────────────────────────────────────────────────────────────

  /**
   * Set or remove a capacity override for an event.
   *
   * MANDATORY: validateOverride (S12) is called BEFORE any DB write.
   * The DB CHECK constraint (chk_override_within_base) is defense-in-depth only.
   *
   * @param input.eventInstanceId — the event to override
   * @param input.base — the current base capacity (fetched by caller)
   * @param input.override — the new override value, or null to remove
   */
  async function setOverride(input: SetOverrideInput): Promise<CapacitySnapshot> {
    const { eventInstanceId, base, override } = input

    // MANDATORY S12 validation BEFORE any DB write
    const validation = validateOverride(base, override)
    if (!validation.ok) {
      // Surface as structured error for HTTP 400 response
      throw new CapacityOverrideValidationError(validation.error, validation.message)
    }

    const snapshot = validation.snapshot

    if (override === null) {
      // Remove override: DELETE the row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: deleteError } = await (supabase as any)
        .from(OVERRIDES_TABLE)
        .delete()
        .eq('event_id', eventInstanceId)

      if (deleteError) {
        throw new Error(`Failed to remove capacity override: ${deleteError.message}`)
      }
    } else {
      // Upsert override with snapshot of current base (defense-in-depth for CHECK)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upsertError } = await (supabase as any)
        .from(OVERRIDES_TABLE)
        .upsert(
          {
            event_id: eventInstanceId,
            capacity_operativa: override.value,
            capacity_base_snapshot: base.value,
            reason: override.reason,
            set_by_persona_id: override.setByPersonaId,
            set_at: override.setAt ?? new Date().toISOString(),
          },
          { onConflict: 'event_id' },
        )

      if (upsertError) {
        throw new Error(`Failed to upsert capacity override: ${upsertError.message}`)
      }
    }

    return snapshot
  }

  // ── getAlertHook ────────────────────────────────────────────────────────────

  /**
   * Returns a simple in-memory alert hook.
   * S19 will replace this with real pub/sub or database notifications.
   * For now, returns an empty alerts array.
   */
  function getAlertHook() {
    return {
      alerts: [],
      subscribe: undefined,
    }
  }

  return {
    getCurrent,
    setOverride,
    getAlertHook,
  }
}

// ─── Error type for validation failures ─────────────────────────────────────

export class CapacityOverrideValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'CapacityOverrideValidationError'
  }
}
