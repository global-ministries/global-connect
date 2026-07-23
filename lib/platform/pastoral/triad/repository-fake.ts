/**
 * W07 — DT-033 — In-memory fake for PastoralTriadaRepository.
 * F(pastoral/triad/repository-fake)
 *
 * Mirrors the pattern of createInMemoryPastoralOneOnOneRepository (W05).
 * Covers all operations in the repository contract + cardinalidad 3 fija (D25).
 */
import { randomUUID } from 'node:crypto'
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
} from '../types'
import type { PastoralLedgerEventInput } from '../participation-ledger-pastoral-writer'
import type { ParticipationLedgerEvent } from '@/lib/platform/operating-core/participation-ledger-repository'

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

export interface InMemoryPastoralTriadaRepositoryOptions {
  readonly seed?: {
    readonly triadas?: readonly PastoralTriada[]
    readonly miembros?: readonly PastoralTriadaMiembro[]
    readonly notas?: readonly PastoralTriadaNota[]
  }
}

export function createInMemoryPastoralTriadaRepository(
  options: InMemoryPastoralTriadaRepositoryOptions = {},
): PastoralTriadaRepository {
  const triadas: PastoralTriada[] = [...(options.seed?.triadas ?? [])]
  const miembros: PastoralTriadaMiembro[] = [...(options.seed?.miembros ?? [])]
  const notas: PastoralTriadaNota[] = [...(options.seed?.notas ?? [])]
  const ledgerEvents: ParticipationLedgerEvent[] = []

  function requireTriada(id: string): PastoralTriada {
    const found = triadas.find((t) => t.id === id)
    if (!found) {
      throw new Error(`Triada ${id} not found`)
    }
    return found
  }

  return {
    async createTriada(input: CreateTriadaInput): Promise<PastoralTriada> {
      const now = new Date().toISOString()
      const created: PastoralTriada = {
        id: randomUUID(),
        mentorOficialPersonaId: input.mentorOficialPersonaId,
        autorPersonaId: input.autorPersonaId,
        estado: 'pending_confirmation',
        contexto: input.contexto,
        motivoDisolucion: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      }
      triadas.push(created)
      return created
    },

    async getTriadaById(id: string): Promise<PastoralTriada | null> {
      return triadas.find((t) => t.id === id) ?? null
    },

    async listTriadas(
      filters?: ListTriadasFilters,
    ): Promise<readonly PastoralTriada[]> {
      let result = triadas
      if (filters?.mentorOficialPersonaId !== undefined) {
        result = result.filter(
          (t) => t.mentorOficialPersonaId === filters.mentorOficialPersonaId,
        )
      }
      if (filters?.autorPersonaId !== undefined) {
        result = result.filter((t) => t.autorPersonaId === filters.autorPersonaId)
      }
      if (filters?.estado !== undefined) {
        const estados = Array.isArray(filters.estado)
          ? filters.estado
          : [filters.estado]
        result = result.filter((t) => estados.includes(t.estado))
      }
      return result
    },

    async updateTriada(
      id: string,
      input: UpdateTriadaInput,
    ): Promise<PastoralTriada> {
      const current = requireTriada(id)
      if (input.expectedVersion !== current.version) {
        throw new ConcurrencyConflictError(
          `expectedVersion ${input.expectedVersion} does not match current version ${current.version}`,
          {
            id,
            expectedVersion: input.expectedVersion,
            currentVersion: current.version,
          },
        )
      }

      const now = new Date().toISOString()
      const updated: PastoralTriada = {
        ...current,
        estado: (input.estado as PastoralTriada['estado']) ?? current.estado,
        motivoDisolucion: input.motivoDisolucion !== undefined
          ? input.motivoDisolucion
          : current.motivoDisolucion,
        version: current.version + 1,
        updatedAt: now,
      }

      const index = triadas.findIndex((t) => t.id === id)
      triadas[index] = updated
      return updated
    },

    async addMiembro(input: AddMiembroInput): Promise<PastoralTriadaMiembro> {
      requireTriada(input.triadaId)

      // Idempotent: return existing if already present
      const existing = miembros.find(
        (m) => m.triadaId === input.triadaId && m.personaId === input.personaId,
      )
      if (existing) return existing

      // Validate cardinalidad 3 (D25) before adding a NEW distinct person
      // Only count distinct personaIds (D25: same person with different roles counts once)
      const existingMiembros = miembros.filter((m) => m.triadaId === input.triadaId)
      const distinctPersonaIds = new Set(existingMiembros.map((m) => m.personaId))
      if (distinctPersonaIds.size >= 3) {
        throw new Error('triada must have exactly 3 distinct humans')
      }

      const created: PastoralTriadaMiembro = {
        id: randomUUID(),
        triadaId: input.triadaId,
        personaId: input.personaId,
        rolEnTriada: input.rolEnTriada,
        createdAt: new Date().toISOString(),
      }
      miembros.push(created)
      return created
    },

    async listMiembros(
      triadaId: string,
    ): Promise<readonly PastoralTriadaMiembro[]> {
      return miembros.filter((m) => m.triadaId === triadaId)
    },

    async addNota(input: AddNotaInput): Promise<PastoralTriadaNota> {
      requireTriada(input.triadaId)
      const created: PastoralTriadaNota = {
        id: randomUUID(),
        triadaId: input.triadaId,
        autorPersonaId: input.autorPersonaId,
        contenido: input.contenido,
        createdAt: new Date().toISOString(),
      }
      notas.push(created)
      return created
    },

    async listNotas(triadaId: string): Promise<readonly PastoralTriadaNota[]> {
      return notas.filter((n) => n.triadaId === triadaId)
    },

    async emitPastoralEvent(
      input: PastoralLedgerEventInput,
    ): Promise<ParticipationLedgerEvent> {
      const event: ParticipationLedgerEvent = {
        id: randomUUID(),
        kind: input.kind as ParticipationLedgerEvent['kind'],
        subjectId: input.subjectId,
        occurredAt: input.occurredAt ?? new Date().toISOString(),
        actorPersonaId: input.actorPersonaId,
        captureSource: input.captureSource ?? 'manual',
        experience: 'pastoral',
        eventId: input.eventId ?? null,
        serviceId: input.serviceId ?? null,
        eventInstanceId: input.eventInstanceId ?? null,
        correctsEventId: null,
        status: 'recorded',
        metadata: input.metadata ?? {},
        createdAt: new Date().toISOString(),
      }
      ledgerEvents.push(event)
      return event
    },
  }
}
