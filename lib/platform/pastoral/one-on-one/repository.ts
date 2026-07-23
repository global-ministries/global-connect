/**
 * W05 — DT-026 — Pastoral 1:1 Repository interface.
 *
 * Read + write + history + participation — mirrors DreamTeamRepository pattern (F2).
 *
 * Operations:
 * - Create, read (single + list), update (state transitions via optimistic locking)
 * - Participant management (add + list)
 * - Notes (append-only, never mutable)
 * - Ledger event emission for pastoral participation events
 */
import type {
  PastoralOneOnOne,
  PastoralOneOnOneParticipante,
  PastoralOneOnOneNota,
} from '../types'
import type { PastoralLedgerEventInput } from '../participation-ledger-pastoral-writer'
import type { ParticipationLedgerEvent } from '@/lib/platform/operating-core/participation-ledger-repository'

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateOneOnOneInput {
  readonly mentorOficialPersonaId: string
  readonly autorPersonaId: string
  readonly scheduledAt?: string | null
}

export interface ListOneOnOnesFilters {
  readonly mentorOficialPersonaId?: string
  readonly autorPersonaId?: string
  readonly estado?: string | readonly string[]
  readonly participanteId?: string
}

export interface UpdateOneOnOneInput {
  readonly estado?: string
  readonly scheduledAt?: string | null
  readonly resumen?: string | null
  readonly motivoCancelacion?: string | null
  readonly motivoNoRealizado?: string | null
  readonly expectedVersion: number
}

export interface AddNotaInput {
  readonly oneOnOneId: string
  readonly autorPersonaId: string
  readonly contenido: string
}

// ─── Repository interface ─────────────────────────────────────────────────────

export interface PastoralOneOnOneRepository {
  /**
   * Create a new 1:1 pastoral record.
   * Auto-generates id, sets version to 1, estado to 'pending_participant'.
   */
  createOneOnOne(input: CreateOneOnOneInput): Promise<PastoralOneOnOne>

  /**
   * Find a 1:1 by its unique id.
   * Returns null if not found.
   */
  getOneOnOneById(id: string): Promise<PastoralOneOnOne | null>

  /**
   * List 1:1 records with optional filters.
   * Supports filtering by mentor, autor, estado, and participant.
   */
  listOneOnOnes(
    filters?: ListOneOnOnesFilters,
  ): Promise<readonly PastoralOneOnOne[]>

  /**
   * Update a 1:1 with optimistic locking.
   * @throws ConcurrencyConflictError if expectedVersion does not match current version
   */
  updateOneOnOne(
    id: string,
    input: UpdateOneOnOneInput,
  ): Promise<PastoralOneOnOne>

  /**
   * Add a participant to a 1:1.
   * Idempotent by unique constraint on (one_on_one_id, persona_id).
   */
  addParticipante(
    oneOnOneId: string,
    personaId: string,
  ): Promise<PastoralOneOnOneParticipante>

  /**
   * List all participants of a 1:1.
   */
  listParticipantes(
    oneOnOneId: string,
  ): Promise<readonly PastoralOneOnOneParticipante[]>

  /**
   * Add a note to a 1:1 (append-only — never mutable per D16).
   */
  addNota(input: AddNotaInput): Promise<PastoralOneOnOneNota>

  /**
   * List all notes of a 1:1.
   */
  listNotas(oneOnOneId: string): Promise<readonly PastoralOneOnOneNota[]>

  /**
   * Emit a pastoral participation event to the shared ledger.
   */
  emitPastoralEvent(
    input: PastoralLedgerEventInput,
  ): Promise<ParticipationLedgerEvent>
}
