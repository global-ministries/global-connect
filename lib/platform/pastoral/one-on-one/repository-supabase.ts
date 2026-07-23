/**
 * W05 — DT-028 — Supabase adapter for PastoralOneOnOneRepository.
 *
 * Mirrors createSupabaseDreamTeamRepository (F2) pattern.
 *
 * - Optimistic locking via version + 1 on every write (ConcurrencyConflictError on stale)
 * - SELECT/UPDATE parameterized queries (T12 SQL injection prevention)
 * - Maps snake_case DB rows to camelCase domain types
 * - Uses auth.uid() directly in policies (F2 precedent — no current_persona_id())
 *
 * Covers:
 * - Happy path create/get/update
 * - 409 stale version → ConcurrencyConflictError
 * - 404 missing record → null
 *
 * Note: pastoral tables are not yet in the generated database.types.ts
 * (W02/W03 migrations create them in staging, types regenerated post-migration).
 * Uses SupabaseClient<any, any> and manual type casts — mirrors the W04 pattern
 * where the pastoral module cannot edit generated types.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PastoralOneOnOneRepository,
  CreateOneOnOneInput,
  UpdateOneOnOneInput,
  ListOneOnOnesFilters,
  AddNotaInput,
} from './repository'
import type {
  PastoralOneOnOne,
  PastoralOneOnOneParticipante,
  PastoralOneOnOneNota,
} from '../types'
import type { PastoralLedgerEventInput } from '../participation-ledger-pastoral-writer'
import type { ParticipationLedgerEvent } from '@/lib/platform/operating-core/participation-ledger-repository'

// Reuse the same error class from the fake — single definition
export class ConcurrencyConflictError extends Error {
  readonly code = 'CONCURRENCY_CONFLICT' as const
  constructor(
    message: string,
    readonly context?: Readonly<Record<string, unknown>>,
  ) {
    super(message)
    this.name = 'ConcurrencyConflictError'
  }
}

// Relaxed client type — pastoral tables not yet in generated database.types.ts
type AnySupabaseClient = SupabaseClient<any, any>

// ─── Row types (snake_case from DB) ────────────────────────────────────────
// Pastoral tables not in generated types — using Record<string, any>
// These mirror the actual DB columns from the W02 migration

function mapOneOnOne(row: Record<string, unknown>): PastoralOneOnOne {
  return {
    id: String(row.id),
    mentorOficialPersonaId: String(row.mentor_oficial_persona_id),
    autorPersonaId: String(row.autor_persona_id),
    estado: String(row.estado) as PastoralOneOnOne['estado'],
    scheduledAt: row.scheduled_at ? String(row.scheduled_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    motivoCancelacion: row.motivo_cancelacion ? String(row.motivo_cancelacion) : null,
    resumen: row.resumen ? String(row.resumen) : null,
    motivoNoRealizado: row.motivo_no_realizado ? String(row.motivo_no_realizado) : null,
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapParticipante(row: Record<string, unknown>): PastoralOneOnOneParticipante {
  return {
    id: String(row.id),
    oneOnOneId: String(row.one_on_one_id),
    personaId: String(row.persona_id),
    createdAt: String(row.created_at),
  }
}

function mapNota(row: Record<string, unknown>): PastoralOneOnOneNota {
  return {
    id: String(row.id),
    oneOnOneId: String(row.one_on_one_id),
    autorPersonaId: String(row.autor_persona_id),
    contenido: String(row.contenido),
    createdAt: String(row.created_at),
  }
}

// ─── Repository implementation ───────────────────────────────────────────────

export function createSupabasePastoralOneOnOneRepository(
  client: AnySupabaseClient,
): PastoralOneOnOneRepository {
  async function getOneOnOneById(id: string): Promise<PastoralOneOnOne | null> {
    const { data, error } = await client
      .from('pastoral_one_on_one')
      .select('*')
      .eq('id', id) // T12: parameterized — prevents SQL injection
      .single()

    if (error || !data) return null
    return mapOneOnOne(data as Record<string, unknown>)
  }

  return {
    async createOneOnOne(input: CreateOneOnOneInput): Promise<PastoralOneOnOne> {
      const insert = {
        mentor_oficial_persona_id: input.mentorOficialPersonaId,
        autor_persona_id: input.autorPersonaId,
        scheduled_at: input.scheduledAt ?? null,
      }

      const { data, error } = await client
        .from('pastoral_one_on_one')
        .insert(insert)
        .select()
        .single()

      if (error) throw error
      return mapOneOnOne(data as Record<string, unknown>)
    },

    getOneOnOneById,

    async listOneOnOnes(
      filters?: ListOneOnOnesFilters,
    ): Promise<readonly PastoralOneOnOne[]> {
      let query = client.from('pastoral_one_on_one').select('*')

      if (filters?.mentorOficialPersonaId !== undefined) {
        query = query.eq('mentor_oficial_persona_id', filters.mentorOficialPersonaId) // T12
      }
      if (filters?.autorPersonaId !== undefined) {
        query = query.eq('autor_persona_id', filters.autorPersonaId) // T12
      }
      if (filters?.estado !== undefined) {
        const estados = Array.isArray(filters.estado)
          ? filters.estado
          : [filters.estado]
        query = query.in('estado', estados) // T12: parameterized IN
      }
      if (filters?.participanteId !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(query as any).exists(
          client
            .from('pastoral_one_on_one_participantes')
            .select('id')
            .eq('one_on_one_id', 'id') // T12: correlated subquery param
            .eq('persona_id', filters.participanteId),
        )
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []).map((r) => mapOneOnOne(r as Record<string, unknown>))
    },

    async updateOneOnOne(
      id: string,
      input: UpdateOneOnOneInput,
    ): Promise<PastoralOneOnOne> {
      const current = await getOneOnOneById(id)
      if (!current) {
        throw new Error(`OneOnOne ${id} not found`)
      }

      if (input.expectedVersion !== current.version) {
        throw new ConcurrencyConflictError(
          `expectedVersion ${input.expectedVersion} does not match current version ${current.version}`,
          { id, expectedVersion: input.expectedVersion, currentVersion: current.version },
        )
      }

      const updates: Record<string, unknown> = {
        version: current.version + 1, // optimistic lock: version + 1
        updated_at: new Date().toISOString(),
      }
      if (input.estado !== undefined) updates.estado = input.estado
      if (input.scheduledAt !== undefined) updates.scheduled_at = input.scheduledAt
      if (input.resumen !== undefined) updates.resumen = input.resumen
      if (input.motivoCancelacion !== undefined)
        updates.motivo_cancelacion = input.motivoCancelacion
      if (input.motivoNoRealizado !== undefined)
        updates.motivo_no_realizado = input.motivoNoRealizado
      if (input.estado === 'completed') updates.completed_at = new Date().toISOString()

      // T12: all values come from server-side version or explicitly typed input
      const { data, error } = await client
        .from('pastoral_one_on_one')
        .update(updates)
        .eq('id', id) // T12: parameterized
        .eq('version', input.expectedVersion) // T12: double-write protection
        .select()
        .single()

      if (error) {
        // Check for version conflict (PostgREST returns error on failed .eq('version'))
        if (
          error.message?.toLowerCase().includes('version') ||
          error.code === 'PGRST116'
        ) {
          throw new ConcurrencyConflictError(
            `expectedVersion ${input.expectedVersion} does not match current version`,
            { id, expectedVersion: input.expectedVersion },
          )
        }
        throw error
      }

      if (!data) {
        throw new ConcurrencyConflictError(
          `expectedVersion ${input.expectedVersion} does not match current version`,
          { id, expectedVersion: input.expectedVersion },
        )
      }

      return mapOneOnOne(data as Record<string, unknown>)
    },

    async addParticipante(
      oneOnOneId: string,
      personaId: string,
    ): Promise<PastoralOneOnOneParticipante> {
      const { data, error } = await client
        .from('pastoral_one_on_one_participantes')
        .insert({
          one_on_one_id: oneOnOneId, // T12: parameterized
          persona_id: personaId,
        })
        .select()
        .single()

      if (error) throw error
      return mapParticipante(data as Record<string, unknown>)
    },

    async listParticipantes(
      oneOnOneId: string,
    ): Promise<readonly PastoralOneOnOneParticipante[]> {
      const { data, error } = await client
        .from('pastoral_one_on_one_participantes')
        .select('*')
        .eq('one_on_one_id', oneOnOneId) // T12
        .order('created_at', { ascending: true })

      if (error) throw error
      return (data ?? []).map((r) => mapParticipante(r as Record<string, unknown>))
    },

    async addNota(input: AddNotaInput): Promise<PastoralOneOnOneNota> {
      const { data, error } = await client
        .from('pastoral_one_on_one_notas')
        .insert({
          one_on_one_id: input.oneOnOneId, // T12
          autor_persona_id: input.autorPersonaId,
          contenido: input.contenido,
        })
        .select()
        .single()

      if (error) throw error
      return mapNota(data as Record<string, unknown>)
    },

    async listNotas(oneOnOneId: string): Promise<readonly PastoralOneOnOneNota[]> {
      const { data, error } = await client
        .from('pastoral_one_on_one_notas')
        .select('*')
        .eq('one_on_one_id', oneOnOneId) // T12
        .order('created_at', { ascending: true })

      if (error) throw error
      return (data ?? []).map((r) => mapNota(r as Record<string, unknown>))
    },

    async emitPastoralEvent(
      input: PastoralLedgerEventInput,
    ): Promise<ParticipationLedgerEvent> {
      // Delegate to the shared ledger repository (W04)
      const { createSupabaseParticipationLedgerRepository } =
        await import('@/lib/platform/operating-core/participation-ledger-repository-supabase')

      // Cast to any to allow the pastoral client to be used with the ledger repo
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ledgerRepo = createSupabaseParticipationLedgerRepository(client as any)

      // Cast the pastoral kind to the underlying ledger kind (M4 extended the enum)
      const ledgerInput = {
        kind: input.kind as ParticipationLedgerEvent['kind'],
        subjectId: input.subjectId,
        occurredAt: input.occurredAt,
        actorPersonaId: input.actorPersonaId,
        captureSource: input.captureSource ?? 'manual',
        experience: 'pastoral',
        eventId: input.eventId ?? null,
        serviceId: input.serviceId ?? null,
        eventInstanceId: input.eventInstanceId ?? null,
        metadata: input.metadata ?? {},
      }

      return ledgerRepo.append(ledgerInput)
    },
  }
}
