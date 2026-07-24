/**
 * W07 — DT-034 — Supabase adapter for PastoralTriadaRepository.
 *
 * Mirrors createSupabasePastoralOneOnOneRepository (W05) pattern.
 *
 * - Optimistic locking via version + 1 on every write (ConcurrencyConflictError on stale)
 * - SELECT/UPDATE parameterized queries (T12 SQL injection prevention)
 * - Maps snake_case DB rows to camelCase domain types
 * - Uses auth.uid() directly in policies (W02 precedent — no current_persona_id())
 *
 * Covers:
 * - Happy path create/get/update
 * - 409 stale version → ConcurrencyConflictError
 * - 404 missing record → null
 * - ESC-02 of pastoral-triada-disband: requires motivo from closed catalog
 *
 * Note: pastoral tables are not yet in the generated database.types.ts
 * Uses SupabaseClient<any, any> and manual type casts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PastoralTriadaRepository,
  CreateTriadaInput,
  UpdateTriadaInput,
  ListTriadasFilters,
  AddMiembroInput,
  AddNotaInput,
  PastoralTriadaNota,
} from './repository'
import type {
  PastoralTriada,
  PastoralTriadaMiembro,
  TriadaDissolutionReason,
} from '../types'
import type { PastoralLedgerEventInput } from '../participation-ledger-pastoral-writer'
import type { ParticipationLedgerEvent } from '@/lib/platform/operating-core/participation-ledger-repository'
import { TRIADA_DISSOLUTION_REASONS } from '../triad-state'

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

function mapTriada(row: Record<string, unknown>): PastoralTriada {
  return {
    id: String(row.id),
    mentorOficialPersonaId: String(row.mentor_oficial_persona_id),
    autorPersonaId: String(row.autor_persona_id),
    estado: String(row.estado) as PastoralTriada['estado'],
    contexto: String(row.contexto) as PastoralTriada['contexto'],
    motivoDisolucion: row.motivo_disolucion
      ? (String(row.motivo_disolucion) as TriadaDissolutionReason)
      : null,
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapMiembro(row: Record<string, unknown>): PastoralTriadaMiembro {
  return {
    id: String(row.id),
    triadaId: String(row.triada_id),
    personaId: String(row.persona_id),
    rolEnTriada: String(row.rol_en_triada),
    createdAt: String(row.created_at),
  }
}

function mapNota(row: Record<string, unknown>): PastoralTriadaNota {
  return {
    id: String(row.id),
    triadaId: String(row.triada_id),
    autorPersonaId: String(row.autor_persona_id),
    contenido: String(row.contenido),
    createdAt: String(row.created_at),
  }
}

// ─── Repository implementation ───────────────────────────────────────────────

export function createSupabasePastoralTriadaRepository(
  client: AnySupabaseClient,
): PastoralTriadaRepository {
  async function getTriadaById(id: string): Promise<PastoralTriada | null> {
    const { data, error } = await client
      .from('pastoral_triada')
      .select('*')
      .eq('id', id) // T12: parameterized — prevents SQL injection
      .single()

    if (error || !data) return null
    return mapTriada(data as Record<string, unknown>)
  }

  return {
    async createTriada(input: CreateTriadaInput): Promise<PastoralTriada> {
      const insert = {
        mentor_oficial_persona_id: input.mentorOficialPersonaId,
        autor_persona_id: input.autorPersonaId,
        contexto: input.contexto,
      }

      const { data, error } = await client
        .from('pastoral_triada')
        .insert(insert)
        .select()
        .single()

      if (error) throw error
      return mapTriada(data as Record<string, unknown>)
    },

    getTriadaById,

    async listTriadas(
      filters?: ListTriadasFilters,
    ): Promise<readonly PastoralTriada[]> {
      let query = client.from('pastoral_triada').select('*')

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

      const { data, error } = await query
      if (error) throw error
      return (data ?? []).map((r) => mapTriada(r as Record<string, unknown>))
    },

    async updateTriada(
      id: string,
      input: UpdateTriadaInput,
    ): Promise<PastoralTriada> {
      const current = await getTriadaById(id)
      if (!current) {
        throw new Error(`Triada ${id} not found`)
      }

      if (input.expectedVersion !== current.version) {
        throw new ConcurrencyConflictError(
          `expectedVersion ${input.expectedVersion} does not match current version ${current.version}`,
          { id, expectedVersion: input.expectedVersion, currentVersion: current.version },
        )
      }

      // ESC-02 of pastoral-triada-disband: motivo must be from closed catalog
      if (input.motivoDisolucion !== undefined && input.motivoDisolucion !== null) {
        if (!TRIADA_DISSOLUTION_REASONS.includes(input.motivoDisolucion as TriadaDissolutionReason)) {
          throw new Error(
            `motivo '${input.motivoDisolucion}' is not in the closed dissolution catalog: ${[...TRIADA_DISSOLUTION_REASONS].join(', ')}`,
          )
        }
      }

      const updates: Record<string, unknown> = {
        version: current.version + 1, // optimistic lock: version + 1
        updated_at: new Date().toISOString(),
      }
      if (input.estado !== undefined) updates.estado = input.estado
      if (input.motivoDisolucion !== undefined) {
        updates.motivo_disolucion = input.motivoDisolucion
      }

      // T12: all values come from server-side version or explicitly typed input
      const { data, error } = await client
        .from('pastoral_triada')
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

      return mapTriada(data as Record<string, unknown>)
    },

    async addMiembro(
      input: AddMiembroInput,
    ): Promise<PastoralTriadaMiembro> {
      const { data, error } = await client
        .from('pastoral_triada_miembros')
        .insert({
          triada_id: input.triadaId, // T12: parameterized
          persona_id: input.personaId,
          rol_en_triada: input.rolEnTriada,
        })
        .select()
        .single()

      if (error) throw error
      return mapMiembro(data as Record<string, unknown>)
    },

    async listMiembros(
      triadaId: string,
    ): Promise<readonly PastoralTriadaMiembro[]> {
      const { data, error } = await client
        .from('pastoral_triada_miembros')
        .select('*')
        .eq('triada_id', triadaId) // T12
        .order('created_at', { ascending: true })

      if (error) throw error
      return (data ?? []).map((r) => mapMiembro(r as Record<string, unknown>))
    },

    async addNota(input: AddNotaInput): Promise<PastoralTriadaNota> {
      const { data, error } = await client
        .from('pastoral_triada_notas')
        .insert({
          triada_id: input.triadaId, // T12
          autor_persona_id: input.autorPersonaId,
          contenido: input.contenido,
        })
        .select()
        .single()

      if (error) throw error
      return mapNota(data as Record<string, unknown>)
    },

    async listNotas(triadaId: string): Promise<readonly PastoralTriadaNota[]> {
      const { data, error } = await client
        .from('pastoral_triada_notas')
        .select('*')
        .eq('triada_id', triadaId) // T12
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
