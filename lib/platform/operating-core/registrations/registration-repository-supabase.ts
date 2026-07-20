/**
 * S10 — RegistrationsRepository Supabase adapter
 *
 * Mirrors participation-ledger-repository-supabase.ts (S07) pattern.
 *
 * RLS enforcement: auth.uid() is bound SERVER-SIDE by Postgres RLS policies.
 * No p_auth_id parameter is ever sent by the client.
 *
 * NOTE: operating_core_registrations is a future-apply migration (not yet
 * in generated Database types). This adapter uses a relaxed SupabaseClient type
 * to allow compile-time use before the migration is applied. The actual table
 * name is validated at runtime by Postgres.
 *
 * LIMITATION: cancel() calls promote_waitlist RPC AFTER updating the row to
 * cancelada. This is at-most-once-promotion semantics — the cancellation and
 * promotion are not in the same database transaction. If the RPC call fails after
 * the UPDATE commits, the waitlist entry will NOT be promoted (manual re-run needed).
 * This is an acceptable trade-off for Supabase's RPC + DML non-transactionality.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RegistrationState } from '../state'
import { canTransition } from '../state'
import { OperatingCoreConcurrencyConflictError } from '../errors'
import type { RegistrationsRepository } from './registration-repository'
import type {
  OperatingCoreRegistrationRow,
} from './registration-sql-row'
import {
  mapSqlRowToDomain,
} from './registration-sql-row'

// ─── Types ────────────────────────────────────────────────────────────────────

// Relaxed client type — operating_core_registrations is not yet in generated
// Database types (future-apply migration). Using SupabaseClient without Database generic
// avoids cast-heavy code while maintaining runtime safety via Postgres.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberate type relaxation for future-apply table
type AnySupabaseClient = SupabaseClient<any, any>

export interface RegistrationsRepositorySupabaseOptions {
  supabase: AnySupabaseClient
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABLE = 'operating_core_registrations' as const

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createSupabaseRegistrationsRepository(
  options: RegistrationsRepositorySupabaseOptions,
): RegistrationsRepository {
  const { supabase } = options

  // ── helpers ──────────────────────────────────────────────────────────────

  async function findByIdInternal(
    id: string,
  ): Promise<OperatingCoreRegistrationRow | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from(TABLE)
      .select()
      .eq('id', id)
      .maybeSingle()

    if (error || !data) return null
    return data as OperatingCoreRegistrationRow
  }

  async function upsertAndSelect(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
  ): Promise<OperatingCoreRegistrationRow> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (supabase as any)
      .from(TABLE)
      .insert(data)
      .select()
      .single()

    if (error || !row) {
      throw new Error(error?.message ?? 'Failed to insert registration')
    }
    return row as OperatingCoreRegistrationRow
  }

  // ── create ──────────────────────────────────────────────────────────────

  async function create(
    input: import('./registration-state').CreateRegistrationInput,
  ): Promise<import('./registration-state').RegistrationOutcome> {
    const { personaId, eventId, confirmationMode } = input

    try {
      const insertData = {
        persona_id: personaId,
        event_id: eventId,
        estado: 'pendiente',
        confirmation_mode: confirmationMode,
        waitlist_position: null,
        version: 1,
      }

      const row = await upsertAndSelect(insertData)
      const domain = mapSqlRowToDomain(row)

      if (confirmationMode === 'automatic' && input.currentConfirmedCount < input.effectiveCapacity) {
        // Auto-confirm: update to confirmada
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: updated, error } = await (supabase as any)
          .from(TABLE)
          .update({ estado: 'confirmada', version: 2 })
          .eq('id', row.id)
          .select()
          .single()

        if (error || !updated) {
          return { kind: 'confirmed', registrationId: row.id, state: 'pendiente' }
        }
        return { kind: 'confirmed', registrationId: row.id, state: 'confirmada' }
      }

      return { kind: 'confirmed', registrationId: row.id, state: 'pendiente' }
    } catch (err) {
      // Postgres error 23505 = unique_violation = partial unique constraint hit
      // This means a concurrent insert happened — idempotency success
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pgError = (err as any)?.originalError ?? err
      if ((pgError as { code?: string })?.code === '23505') {
        return {
          kind: 'irreconcilable_idempotency',
          personaId,
          eventId,
        }
      }
      throw err
    }
  }

  // ── findById ─────────────────────────────────────────────────────────────

  async function findById(id: string): Promise<import('./registration-repository').Registration | null> {
    const row = await findByIdInternal(id)
    if (!row) return null
    return {
      id: row.id,
      personaId: row.persona_id,
      eventId: row.event_id,
      state: row.estado,
      waitlistPosition: row.waitlist_position,
      confirmationMode: row.confirmation_mode,
      capturedAt: row.created_at,
      version: row.version,
    }
  }

  // ── findActiveByPersonaAndEvent ───────────────────────────────────────────

  async function findActiveByPersonaAndEvent(
    personaId: string,
    eventId: string,
  ): Promise<import('./registration-repository').Registration | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from(TABLE)
      .select()
      .eq('persona_id', personaId)
      .eq('event_id', eventId)
      .not('estado', 'in', '("cancelada","rechazada")')
      .maybeSingle()

    if (error || !data) return null
    const row = data as OperatingCoreRegistrationRow
    return {
      id: row.id,
      personaId: row.persona_id,
      eventId: row.event_id,
      state: row.estado,
      waitlistPosition: row.waitlist_position,
      confirmationMode: row.confirmation_mode,
      capturedAt: row.created_at,
      version: row.version,
    }
  }

  // ── listByEvent ───────────────────────────────────────────────────────────

  async function listByEvent(
    eventId: string,
    filter?: { state?: RegistrationState; includeWaitlist?: boolean },
  ): Promise<readonly import('./registration-repository').Registration[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any).from(TABLE).select().eq('event_id', eventId)

    if (filter?.state) {
      query = query.eq('estado', filter.state)
    }
    if (filter?.includeWaitlist === false) {
      query = query.is('waitlist_position', null)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)

    return (data ?? []).map((row: OperatingCoreRegistrationRow) => ({
      id: row.id,
      personaId: row.persona_id,
      eventId: row.event_id,
      state: row.estado,
      waitlistPosition: row.waitlist_position,
      confirmationMode: row.confirmation_mode,
      capturedAt: row.created_at,
      version: row.version,
    }))
  }

  // ── listWaitlist ──────────────────────────────────────────────────────────

  async function listWaitlist(
    eventId: string,
  ): Promise<readonly import('./registration-repository').Registration[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from(TABLE)
      .select()
      .eq('event_id', eventId)
      .eq('estado', 'pendiente')
      .not('waitlist_position', 'is', null)
      .order('waitlist_position', { ascending: true })

    if (error) throw new Error(error.message)

    return (data ?? []).map((row: OperatingCoreRegistrationRow) => ({
      id: row.id,
      personaId: row.persona_id,
      eventId: row.event_id,
      state: row.estado,
      waitlistPosition: row.waitlist_position,
      confirmationMode: row.confirmation_mode,
      capturedAt: row.created_at,
      version: row.version,
    }))
  }

  // ── transition ────────────────────────────────────────────────────────────

  async function transition(
    id: string,
    expectedVersion: number,
    to: RegistrationState,
    _motivo?: string,
    _actorPersonaId?: string,
  ): Promise<{ outcome: import('./registration-state').RegistrationOutcome; registration: import('./registration-repository').Registration }> {
    const current = await findByIdInternal(id)

    if (!current) {
      throw new Error(`Registration ${id} not found`)
    }

    if (current.version !== expectedVersion) {
      throw new OperatingCoreConcurrencyConflictError(
        `expectedVersion ${expectedVersion} does not match current version ${current.version}`,
        { id, expectedVersion, currentVersion: current.version },
      )
    }

    // Validate transition using S02 state machine
    if (!canTransition(current.estado, to)) {
      return {
        outcome: { kind: 'invalid_transition', from: current.estado, to },
        registration: {
          id: current.id,
          personaId: current.persona_id,
          eventId: current.event_id,
          state: current.estado,
          waitlistPosition: current.waitlist_position,
          confirmationMode: current.confirmation_mode,
          capturedAt: current.created_at,
          version: current.version,
        },
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error } = await (supabase as any)
      .from(TABLE)
      .update({ estado: to, version: current.version + 1 })
      .eq('id', id)
      .eq('version', expectedVersion) // optimistic lock
      .select()
      .maybeSingle()

    if (error || !updated) {
      // Version mismatch — someone else updated
      throw new OperatingCoreConcurrencyConflictError(
        `Optimistic lock failed for registration ${id}`,
        { id, expectedVersion },
      )
    }

    const row = updated as OperatingCoreRegistrationRow
    return {
      // Cast is safe because canTransition guard above ensures `to` is valid
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      outcome: { kind: 'confirmed', registrationId: id, state: to } as any,
      registration: {
        id: row.id,
        personaId: row.persona_id,
        eventId: row.event_id,
        state: row.estado,
        waitlistPosition: row.waitlist_position,
        confirmationMode: row.confirmation_mode,
        capturedAt: row.created_at,
        version: row.version,
      },
    }
  }

  // ── cancel ───────────────────────────────────────────────────────────────

  /**
   * Cancel a registration and promote the next waitlist entry.
   *
   * LIMITATION: cancellation (UPDATE) and promotion (RPC) are NOT in the same
   * database transaction. If the RPC call fails after the UPDATE commits,
   * the waitlist slot is NOT released automatically. This is an acceptable
   * trade-off for Supabase's RPC + DML non-transactionality.
   */
  async function cancel(
    id: string,
    expectedVersion: number,
    _motivo: string,
    _actorPersonaId: string,
  ): Promise<{ cancelled: import('./registration-repository').Registration; promoted: import('./registration-repository').Registration | null }> {
    const current = await findByIdInternal(id)

    if (!current) {
      throw new Error(`Registration ${id} not found`)
    }

    if (current.version !== expectedVersion) {
      throw new OperatingCoreConcurrencyConflictError(
        `expectedVersion ${expectedVersion} does not match current version ${current.version}`,
        { id, expectedVersion, currentVersion: current.version },
      )
    }

    // Step 1: Update to cancelada
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cancelledRow, error } = await (supabase as any)
      .from(TABLE)
      .update({ estado: 'cancelada', version: current.version + 1 })
      .eq('id', id)
      .eq('version', expectedVersion)
      .select()
      .maybeSingle()

    if (error || !cancelledRow) {
      throw new OperatingCoreConcurrencyConflictError(
        `Failed to cancel registration ${id}`,
        { id, expectedVersion },
      )
    }

    const cancelledDomain: import('./registration-repository').Registration = {
      id: cancelledRow.id,
      personaId: cancelledRow.persona_id,
      eventId: cancelledRow.event_id,
      state: cancelledRow.estado,
      waitlistPosition: cancelledRow.waitlist_position,
      confirmationMode: cancelledRow.confirmation_mode,
      capturedAt: cancelledRow.created_at,
      version: cancelledRow.version,
    }

    // Step 2: If cancelled from confirmada, promote the next waitlist entry
    let promoted: import('./registration-repository').Registration | null = null

    if (current.estado === 'confirmada') {
      const rpcResult = await promoteFromWaitlist(current.event_id, 1)
      if (rpcResult.length > 0) {
        const promotedRow = rpcResult[0]
        promoted = {
          id: promotedRow.id,
          personaId: promotedRow.personaId,
          eventId: promotedRow.eventId,
          state: promotedRow.state,
          waitlistPosition: promotedRow.waitlistPosition,
          confirmationMode: promotedRow.confirmationMode,
          capturedAt: promotedRow.capturedAt,
          version: promotedRow.version,
        }
      }
    }

    return { cancelled: cancelledDomain, promoted }
  }

  // ── deny ──────────────────────────────────────────────────────────────────

  /**
   * Manually deny a registration — transitions to rechazada.
   * Does NOT promote waitlist (no slot released on rejection).
   */
  async function deny(
    input: import('./registration-state').DenyManualRegistrationInput,
  ): Promise<import('./registration-repository').Registration> {
    const { registrationId, expectedVersion, reason, operatorPersonaId } = input

    const current = await findByIdInternal(registrationId)

    if (!current) {
      throw new Error(`Registration ${registrationId} not found`)
    }

    if (current.version !== expectedVersion) {
      throw new OperatingCoreConcurrencyConflictError(
        `expectedVersion ${expectedVersion} does not match current version ${current.version}`,
        { registrationId, expectedVersion, currentVersion: current.version },
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error } = await (supabase as any)
      .from(TABLE)
      .update({
        estado: 'rechazada',
        reason,
        captured_by_persona_id: operatorPersonaId,
        version: current.version + 1,
      })
      .eq('id', registrationId)
      .eq('version', expectedVersion)
      .select()
      .maybeSingle()

    if (error || !updated) {
      throw new OperatingCoreConcurrencyConflictError(
        `Failed to deny registration ${registrationId}`,
        { registrationId, expectedVersion },
      )
    }

    const row = updated as OperatingCoreRegistrationRow
    return {
      id: row.id,
      personaId: row.persona_id,
      eventId: row.event_id,
      state: row.estado,
      waitlistPosition: row.waitlist_position,
      confirmationMode: row.confirmation_mode,
      capturedAt: row.created_at,
      version: row.version,
    }
  }

  // ── promoteFromWaitlist ───────────────────────────────────────────────────

  /**
   * Call the atomic promote_waitlist RPC.
   * Uses FOR UPDATE SKIP LOCKED to prevent double-promotion under concurrent calls.
   */
  async function promoteFromWaitlist(
    eventId: string,
    slotsAvailable: number,
  ): Promise<readonly import('./registration-repository').Registration[]> {
    if (slotsAvailable <= 0) return []

    const { data: rpcData, error } = await supabase.rpc('operating_core_promote_waitlist', {
      p_event_id: eventId,
      p_slot_released: slotsAvailable,
    })

    if (error) {
      throw new Error(`promote_waitlist RPC failed: ${error.message}`)
    }

    const rows = (rpcData ?? []) as OperatingCoreRegistrationRow[]
    return rows.map((row) => ({
      id: row.id,
      personaId: row.persona_id,
      eventId: row.event_id,
      state: row.estado,
      waitlistPosition: row.waitlist_position,
      confirmationMode: row.confirmation_mode,
      capturedAt: row.created_at,
      version: row.version,
    }))
  }

  return {
    create,
    findById,
    findActiveByPersonaAndEvent,
    listByEvent,
    listWaitlist,
    transition,
    cancel,
    deny,
    promoteFromWaitlist,
  }
}
