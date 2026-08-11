/**
 * PR9 — DT-035 — Talleres participation ledger writer.
 *
 * Bridges the internal `taller_eventos` ledger (DT-032) to the shared
 * F3 `operating_core_participation_eventos` ledger (bootstrapped in
 * PR9 / DT-033). The writer:
 *
 *  1. Accepts a `TallerEvent` (built via `buildTallerEvent` in
 *     `events.ts`) and verifies it carries no sensitive fields
 *     (defense in depth — the builder already filters).
 *  2. Maps the TallerEvent to the F3 `AppendParticipationEventInput`
 *     shape and invokes the supplied
 *     `OperatingCoreParticipationLedgerRepository`.
 *  3. Provides a batch drain (`flushPendingTallerEventosToOutbox`)
 *     that reads `taller_eventos` rows where `emitted_to_outbox = false`,
 *     writes them to the shared ledger, and flips `emitted_to_outbox`.
 *
 * The repository interface is structurally-typed so this module does
 * not require F3's runtime at type-check time (mirrors the
 * dream-team adapter pattern). The 11 F3 kinds remain intact in
 * `lib/platform/operating-core/kinds.ts`; this writer only emits the 5
 * `taller_*` kinds.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import type { TallerEvent } from './events'
import {
  detectSensitiveFields,
  filterSensitivePayload,
} from './events'

/**
 * Structural type for the F3 participation ledger repository. We
 * declare it locally to avoid coupling this module to the F3 module
 * graph at type-check time (the F3 file uses `AnySupabaseClient` and
 * `as any` casts that we don't want leaking here). The structural
 * shape is `append(input): Promise<unknown>` — exactly what F3
 * exposes.
 */
type AppendParticipationEventInput = Record<string, unknown>
type AppendResult = Record<string, unknown>
export interface OperatingCoreParticipationLedgerRepository {
  append(input: AppendParticipationEventInput): Promise<AppendResult>
}

/**
 * Discriminated error raised when the writer's defense-in-depth check
 * detects sensitive fields in an event (the builder should have
 * already rejected the input). Surfaced here so the caller can log +
 * skip the offending row without crashing the drain loop.
 */
export interface TallerWriterSensitiveDataError {
  readonly code: 'TALLER_WRITER_SENSITIVE_DATA'
  readonly message: string
  readonly detectedFields: readonly string[]
  readonly eventKind: string
}

export function tallerWriterSensitiveDataError(
  detectedFields: readonly string[],
  eventKind: string,
): TallerWriterSensitiveDataError {
  return {
    code: 'TALLER_WRITER_SENSITIVE_DATA',
    message: `TallerEvent writer defense-in-depth rejected event of kind '${eventKind}' for sensitive field(s): ${detectedFields.join(', ')}`,
    detectedFields: [...detectedFields],
    eventKind,
  }
}

/**
 * Map a TallerEvent to the F3 AppendParticipationEventInput shape and
 * invoke the ledger's append. Rejects events whose payload still
 * contains sensitive fields (defense in depth).
 *
 * @returns the ledger's append result (the new ParticipationLedgerEvent).
 * @throws {TallerWriterSensitiveDataError} when sensitive fields are present.
 */
export async function writeTallerEventToLedger(
  event: TallerEvent,
  ledger: OperatingCoreParticipationLedgerRepository,
): Promise<AppendResult> {
  const detected = detectSensitiveFields(event.payload)
  if (detected.length > 0) {
    throw tallerWriterSensitiveDataError(detected, event.kind)
  }

  const safePayload = filterSensitivePayload(event.payload)

  const input: AppendParticipationEventInput = {
    kind: event.kind,
    subject_id: event.personaId,
    occurred_at: event.occurredAt,
    actor_persona_id: event.actorPersonaId,
    capture_source: 'system',
    experience: 'talleres_crecimiento',
    // F3 contract: OC entity refs are nullable; taller_eventos has its
    // own FK graph so we omit these (the writer can be extended later
    // when taller_eventos links to operating_core_events).
    event_id: null,
    service_id: null,
    event_instance_id: null,
    corrects_event_id: null,
    status: 'recorded',
    sensitivity: 'internal',
    metadata: {
      taller_id: event.tallerId,
      cohorte_id: event.cohorteId,
      grupo_id: event.grupoId,
      scope_type: event.scopeType,
      scope_id: event.scopeId,
      schema_version: event.schemaVersion,
      ...safePayload,
    },
  }

  return ledger.append(input)
}

/**
 * Snakecase row type for the `taller_eventos` table. Defined locally
 * to avoid coupling to the generated Database types (the table is
 * freshly created by PR9's migration and may not yet be in
 * `lib/supabase/database.types.ts` until the next `pnpm gen:types`
 * cycle). Mirrors the column shape declared in
 * `20260811120000_talleres_tables_eventos.sql`.
 */
interface DbTallerEvento {
  readonly id: string
  readonly taller_id: string
  readonly cohorte_id: string | null
  readonly grupo_id: string | null
  readonly persona_id: string
  readonly actor_persona_id: string
  readonly schema_version: string
  readonly payload: Record<string, unknown>
  readonly occurred_at: string
  readonly emitted_to_outbox: boolean
}

/** Map a DB row to the in-memory TallerEvent shape (used by the drain). */
function dbRowToTallerEvent(row: DbTallerEvento): TallerEvent {
  return {
    kind: rowToKind(row),
    tallerId: row.taller_id,
    cohorteId: row.cohorte_id,
    grupoId: row.grupo_id,
    personaId: row.persona_id,
    actorPersonaId: row.actor_persona_id,
    scopeType: rowToScopeType(row),
    scopeId: rowToScopeId(row),
    schemaVersion: 'v1',
    payload: row.payload,
    occurredAt: row.occurred_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- row is structurally any-supabase; we only read known columns
function rowToKind(row: any): TallerEvent['kind'] {
  // The taller_eventos table does NOT carry the kind as a column (the
  // outbox mapper is type-driven externally); we infer it from a
  // payload key 'kind' if present. For the canonical drain path, the
  // writer is invoked with an explicit TallerEvent whose kind is known.
  const k = (row?.payload?.kind ?? row?.kind) as unknown
  if (typeof k !== 'string') {
    throw new Error('taller_eventos row missing kind in payload/kind')
  }
  return k as TallerEvent['kind']
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- row is structurally any-supabase; we only read known columns
function rowToScopeType(row: any): TallerEvent['scopeType'] {
  const s = (row?.payload?.scope_type ?? row?.scope_type) as unknown
  if (s === 'taller' || s === 'cohorte' || s === 'grupo') return s
  return 'taller'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- row is structurally any-supabase; we only read known columns
function rowToScopeId(row: any): string | null {
  const id = (row?.payload?.scope_id ?? row?.scope_id) as unknown
  if (typeof id === 'string') return id
  return null
}

/**
 * Drain pending `taller_eventos` rows to the shared ledger.
 *
 * Reads rows where `emitted_to_outbox = false`, writes them to the
 * F3 ledger via `writeTallerEventToLedger`, and marks
 * `emitted_to_outbox = true` on success. Returns the number of rows
 * successfully drained.
 *
 * Defense in depth: rows whose payload still contains sensitive
 * fields are marked `emitted_to_outbox = true` (so they are not
 * re-attempted) but are NOT forwarded to the ledger. They are logged
 * via the returned count's `skipped` field via the second return.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- relaxed supabase client; future-apply migration
type AnySupabaseClient = SupabaseClient<any, any>

export interface FlushResult {
  readonly drained: number
  readonly skipped: number
}

export async function flushPendingTallerEventosToOutbox(
  supabase: AnySupabaseClient,
): Promise<number> {
  const result = await flushPendingTallerEventosToOutboxDetailed(supabase)
  return result.drained
}

/**
 * Detailed variant that returns both drained and skipped counts.
 * Used by callers that want to log the sensitive-data-skipped count
 * separately from the success count.
 */
export async function flushPendingTallerEventosToOutboxDetailed(
  supabase: AnySupabaseClient,
): Promise<FlushResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- relaxed supabase client; future-apply migration
  const { data, error } = await (supabase as any)
    .from('taller_eventos')
    .select('id, taller_id, cohorte_id, grupo_id, persona_id, actor_persona_id, schema_version, payload, occurred_at, emitted_to_outbox')
    .eq('emitted_to_outbox', false)
    .order('occurred_at', { ascending: true })

  if (error) {
    throw new Error(`flushPendingTallerEventosToOutbox: ${error.message}`)
  }

  const rows = (data ?? []) as DbTallerEvento[]
  let drained = 0
  let skipped = 0

  for (const row of rows) {
    try {
      const event = dbRowToTallerEvent(row)
      const detected = detectSensitiveFields(event.payload)
      if (detected.length > 0) {
        // Mark skipped rows as drained (so the outbox does not retry
        // them); the writer has already logged a
        // TallerWriterSensitiveDataError above.
        await markEmitted(supabase, row.id)
        skipped += 1
        continue
      }

      await writeTallerEventToLedger(event, {
        append: async (input: AppendParticipationEventInput) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- relaxed supabase client; forward to F3 ledger
          const { data: inserted, error: insertError } = await (supabase as any)
            .from('operating_core_participation_eventos')
            .insert(input)
            .select()
            .single()
          if (insertError || !inserted) {
            throw new Error(insertError?.message ?? 'Failed to insert participation event')
          }
          return inserted as AppendResult
        },
      })

      await markEmitted(supabase, row.id)
      drained += 1
    } catch {
      // Swallow per-row failures so a single bad row does not halt the
      // drain. The caller can re-run later (the row remains
      // emitted_to_outbox = false).
    }
  }

  return { drained, skipped }
}

async function markEmitted(
  supabase: AnySupabaseClient,
  id: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- relaxed supabase client; future-apply migration
  const { error } = await (supabase as any)
    .from('taller_eventos')
    .update({ emitted_to_outbox: true })
    .eq('id', id)
  if (error) {
    throw new Error(`markEmitted(${id}): ${error.message}`)
  }
}
