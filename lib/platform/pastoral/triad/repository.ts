/**
 * W07 — DT-032 — Pastoral Triada Repository interface.
 *
 * Read + write + history + participation — mirrors PastoralOneOnOneRepository pattern (W05).
 *
 * Operations:
 * - Create, read (single + list), update (state transitions via optimistic locking)
 * - Member management (add + list)
 * - Notes (append-only, never mutable)
 * - Ledger event emission for pastoral triada participation events
 */
import type {
  PastoralTriada,
  PastoralTriadaMiembro,
  PastoralTriadaEvento,
  TriadaEstado,
  TriadaDissolutionReason,
} from '../types'
import type { PastoralLedgerEventInput } from '../participation-ledger-pastoral-writer'
import type { ParticipationLedgerEvent } from '@/lib/platform/operating-core/participation-ledger-repository'

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateTriadaInput {
  readonly mentorOficialPersonaId: string
  readonly autorPersonaId: string
  readonly contexto: PastoralTriada['contexto']
}

export interface ListTriadasFilters {
  readonly mentorOficialPersonaId?: string
  readonly autorPersonaId?: string
  readonly estado?: TriadaEstado | readonly TriadaEstado[]
}

export interface UpdateTriadaInput {
  readonly estado?: TriadaEstado
  readonly motivoDisolucion?: TriadaDissolutionReason | null
  readonly expectedVersion: number
}

export interface AddMiembroInput {
  readonly triadaId: string
  readonly personaId: string
  readonly rolEnTriada: string
}

export interface AddNotaInput {
  readonly triadaId: string
  readonly autorPersonaId: string
  readonly contenido: string
}

// ─── Repository interface ─────────────────────────────────────────────────────

export interface PastoralTriadaRepository {
  /**
   * Create a new triada pastoral record.
   * Auto-generates id, sets version to 1, estado to 'pending_confirmation'.
   */
  createTriada(input: CreateTriadaInput): Promise<PastoralTriada>

  /**
   * Find a triada by its unique id.
   * Returns null if not found.
   */
  getTriadaById(id: string): Promise<PastoralTriada | null>

  /**
   * List triada records with optional filters.
   * Supports filtering by mentor, autor, and estado.
   */
  listTriadas(
    filters?: ListTriadasFilters,
  ): Promise<readonly PastoralTriada[]>

  /**
   * Update a triada with optimistic locking.
   * @throws ConcurrencyConflictError if expectedVersion does not match current version
   */
  updateTriada(
    id: string,
    input: UpdateTriadaInput,
  ): Promise<PastoralTriada>

  /**
   * Add a member to a triada.
   * Idempotent by unique constraint on (triada_id, persona_id).
   */
  addMiembro(input: AddMiembroInput): Promise<PastoralTriadaMiembro>

  /**
   * List all members of a triada.
   */
  listMiembros(
    triadaId: string,
  ): Promise<readonly PastoralTriadaMiembro[]>

  /**
   * Add a note to a triada (append-only — never mutable per D16).
   */
  addNota(input: AddNotaInput): Promise<PastoralTriadaNota>

  /**
   * List all notes of a triada.
   */
  listNotas(triadaId: string): Promise<readonly PastoralTriadaNota[]>

  /**
   * Emit a pastoral participation event to the shared ledger.
   */
  emitPastoralEvent(
    input: PastoralLedgerEventInput,
  ): Promise<ParticipationLedgerEvent>
}

// ─── Note type (mirrors PastoralTriadaNota from types.ts) ─────────────────────

export interface PastoralTriadaNota {
  readonly id: string
  readonly triadaId: string
  readonly autorPersonaId: string
  readonly contenido: string
  readonly createdAt: string
}
