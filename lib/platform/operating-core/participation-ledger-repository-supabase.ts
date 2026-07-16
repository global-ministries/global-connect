/**
 * Participation Ledger — Supabase adapter
 * S07 — mirrors dream-team/repository-supabase.ts pattern
 *
 * RLS enforcement: auth.uid() is bound SERVER-SIDE by Postgres RLS policies.
 * No p_auth_id parameter is ever sent by the client.
 *
 * NOTE: operating_core_participation_eventos is a future-apply migration (not yet
 * in generated Database types). This adapter uses a relaxed SupabaseClient type
 * to allow compile-time use before the migration is applied. The actual table
 * name is validated at runtime by Postgres.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AppendParticipationEventInput,
  ListParticipationEventsFilter,
  ParticipationLedgerEvent,
  ParticipationLedgerRepository,
} from './participation-ledger-repository'
import type { OperatingCoreParticipationKind } from './kinds'

// ─── Types ────────────────────────────────────────────────────────────────────

// Relaxed client type — operating_core_participation_eventos is not yet in generated
// Database types (future-apply migration). Using SupabaseClient without Database generic
// avoids cast-heavy code while maintaining runtime safety via Postgres.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberate type relaxation for future-apply table
type AnySupabaseClient = SupabaseClient<any, any>

// snake_case row from the database
interface DbParticipationEvent {
  readonly id: string
  readonly kind: OperatingCoreParticipationKind
  readonly subject_id: string
  readonly occurred_at: string
  readonly actor_persona_id: string
  readonly capture_source: string
  readonly experience: string
  readonly event_id: string | null
  readonly service_id: string | null
  readonly event_instance_id: string | null
  readonly corrects_event_id: string | null
  readonly status: 'recorded' | 'corrected' | 'superseded' | 'rejected'
  readonly metadata: Record<string, unknown>
  readonly created_at: string
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

function mapRow(row: DbParticipationEvent): ParticipationLedgerEvent {
  return {
    id: row.id,
    kind: row.kind,
    subjectId: row.subject_id,
    occurredAt: row.occurred_at,
    actorPersonaId: row.actor_persona_id,
    captureSource: row.capture_source,
    experience: row.experience,
    eventId: row.event_id,
    serviceId: row.service_id,
    eventInstanceId: row.event_instance_id,
    correctsEventId: row.corrects_event_id,
    status: row.status,
    metadata: row.metadata as Readonly<Record<string, unknown>>,
    createdAt: row.created_at,
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

const TABLE = 'operating_core_participation_eventos' as const

export function createSupabaseParticipationLedgerRepository(
  client: AnySupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future capability-gated operations
  _capability?: string,
): ParticipationLedgerRepository {
  // ── append ────────────────────────────────────────────────────────────────

  async function append(
    input: AppendParticipationEventInput,
  ): Promise<ParticipationLedgerEvent> {
    const insert: Record<string, unknown> = {
      kind: input.kind,
      subject_id: input.subjectId,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      actor_persona_id: input.actorPersonaId,
      capture_source: input.captureSource,
      experience: input.experience,
      event_id: input.eventId ?? null,
      service_id: input.serviceId ?? null,
      event_instance_id: input.eventInstanceId ?? null,
      corrects_event_id: input.correctsEventId ?? null,
      status: 'recorded',
      metadata: input.metadata ?? {},
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client as any)
      .from(TABLE)
      .insert(insert)
      .select()
      .single()

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to append participation event')
    }

    return mapRow(data as DbParticipationEvent)
  }

  // ── listBySubject ─────────────────────────────────────────────────────────

  async function listBySubject(
    subjectId: string,
    filter?: Omit<ListParticipationEventsFilter, 'subjectId'>,
  ): Promise<readonly ParticipationLedgerEvent[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (client as any).from(TABLE).select().eq('subject_id', subjectId)

    if (filter?.kind !== undefined) {
      const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind]
      query = query.in('kind', kinds)
    }
    if (filter?.eventId !== undefined) {
      query = query.eq('event_id', filter.eventId)
    }
    if (filter?.serviceId !== undefined) {
      query = query.eq('service_id', filter.serviceId)
    }
    if (filter?.eventInstanceId !== undefined) {
      query = query.eq('event_instance_id', filter.eventInstanceId)
    }
    if (filter?.actorPersonaId !== undefined) {
      query = query.eq('actor_persona_id', filter.actorPersonaId)
    }
    if (filter?.occurredFrom !== undefined) {
      query = query.gte('occurred_at', filter.occurredFrom)
    }
    if (filter?.occurredTo !== undefined) {
      query = query.lte('occurred_at', filter.occurredTo)
    }
    if (filter?.status !== undefined) {
      query = query.eq('status', filter.status)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)

    return (data ?? []).map((row: unknown) => mapRow(row as DbParticipationEvent))
  }

  // ── findById ──────────────────────────────────────────────────────────────

  async function findById(id: string): Promise<ParticipationLedgerEvent | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client as any)
      .from(TABLE)
      .select()
      .eq('id', id)
      .single()

    if (error || !data) return null

    return mapRow(data as DbParticipationEvent)
  }

  // ── correct ───────────────────────────────────────────────────────────────

  async function correct(
    originalId: string,
    input: Omit<AppendParticipationEventInput, 'correctsEventId'>,
  ): Promise<ParticipationLedgerEvent> {
    const original = await findById(originalId)
    if (!original) {
      throw new Error(`Original event ${originalId} not found`)
    }

    return append({
      ...input,
      correctsEventId: originalId,
    })
  }

  return { append, listBySubject, findById, correct }
}
