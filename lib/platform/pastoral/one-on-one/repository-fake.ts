/**
 * W05 — DT-027 — In-memory fake for PastoralOneOnOneRepository.
 * F(pastoral/one-on-one/repository-fake)
 *
 * Mirrors the pattern of createInMemoryDreamTeamRepository (F2).
 * Covers all operations in the repository contract.
 */
import { randomUUID } from 'node:crypto'
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

export interface InMemoryPastoralOneOnOneRepositoryOptions {
  readonly seed?: {
    readonly oneOnOnes?: readonly PastoralOneOnOne[]
    readonly participantes?: readonly PastoralOneOnOneParticipante[]
    readonly notas?: readonly PastoralOneOnOneNota[]
  }
}

export function createInMemoryPastoralOneOnOneRepository(
  options: InMemoryPastoralOneOnOneRepositoryOptions = {},
): PastoralOneOnOneRepository {
  const oneOnOnes: PastoralOneOnOne[] = [...(options.seed?.oneOnOnes ?? [])]
  const participantes: PastoralOneOnOneParticipante[] = [
    ...(options.seed?.participantes ?? []),
  ]
  const notas: PastoralOneOnOneNota[] = [...(options.seed?.notas ?? [])]
  const ledgerEvents: ParticipationLedgerEvent[] = []

  function requireOneOnOne(id: string): PastoralOneOnOne {
    const found = oneOnOnes.find((o) => o.id === id)
    if (!found) {
      throw new Error(`OneOnOne ${id} not found`)
    }
    return found
  }

  return {
    async createOneOnOne(input: CreateOneOnOneInput): Promise<PastoralOneOnOne> {
      const now = new Date().toISOString()
      const created: PastoralOneOnOne = {
        id: randomUUID(),
        mentorOficialPersonaId: input.mentorOficialPersonaId,
        autorPersonaId: input.autorPersonaId,
        estado: 'pending_participant',
        scheduledAt: input.scheduledAt ?? null,
        completedAt: null,
        motivoCancelacion: null,
        resumen: null,
        motivoNoRealizado: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      }
      oneOnOnes.push(created)
      return created
    },

    async getOneOnOneById(id: string): Promise<PastoralOneOnOne | null> {
      return oneOnOnes.find((o) => o.id === id) ?? null
    },

    async listOneOnOnes(
      filters?: ListOneOnOnesFilters,
    ): Promise<readonly PastoralOneOnOne[]> {
      let result = oneOnOnes
      if (filters?.mentorOficialPersonaId !== undefined) {
        result = result.filter(
          (o) => o.mentorOficialPersonaId === filters.mentorOficialPersonaId,
        )
      }
      if (filters?.autorPersonaId !== undefined) {
        result = result.filter((o) => o.autorPersonaId === filters.autorPersonaId)
      }
      if (filters?.estado !== undefined) {
        const estados = Array.isArray(filters.estado)
          ? filters.estado
          : [filters.estado]
        result = result.filter((o) => estados.includes(o.estado))
      }
      if (filters?.participanteId !== undefined) {
        result = result.filter((o) =>
          participantes.some(
            (p) =>
              p.oneOnOneId === o.id &&
              p.personaId === filters.participanteId,
          ),
        )
      }
      return result
    },

    async updateOneOnOne(
      id: string,
      input: UpdateOneOnOneInput,
    ): Promise<PastoralOneOnOne> {
      const current = requireOneOnOne(id)
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
      const updated: PastoralOneOnOne = {
        ...current,
        estado: (input.estado as PastoralOneOnOne['estado']) ?? current.estado,
        scheduledAt: input.scheduledAt !== undefined ? input.scheduledAt : current.scheduledAt,
        resumen: input.resumen !== undefined ? input.resumen : current.resumen,
        motivoCancelacion:
          input.motivoCancelacion !== undefined
            ? input.motivoCancelacion
            : current.motivoCancelacion,
        motivoNoRealizado:
          input.motivoNoRealizado !== undefined
            ? input.motivoNoRealizado
            : current.motivoNoRealizado,
        completedAt:
          input.estado === 'completed' && !current.completedAt
            ? now
            : current.completedAt,
        version: current.version + 1,
        updatedAt: now,
      }

      const index = oneOnOnes.findIndex((o) => o.id === id)
      oneOnOnes[index] = updated
      return updated
    },

    async addParticipante(
      oneOnOneId: string,
      personaId: string,
    ): Promise<PastoralOneOnOneParticipante> {
      requireOneOnOne(oneOnOneId)
      // Idempotent: return existing if already present
      const existing = participantes.find(
        (p) => p.oneOnOneId === oneOnOneId && p.personaId === personaId,
      )
      if (existing) return existing

      const created: PastoralOneOnOneParticipante = {
        id: randomUUID(),
        oneOnOneId,
        personaId,
        createdAt: new Date().toISOString(),
      }
      participantes.push(created)
      return created
    },

    async listParticipantes(
      oneOnOneId: string,
    ): Promise<readonly PastoralOneOnOneParticipante[]> {
      return participantes.filter((p) => p.oneOnOneId === oneOnOneId)
    },

    async addNota(input: AddNotaInput): Promise<PastoralOneOnOneNota> {
      requireOneOnOne(input.oneOnOneId)
      const created: PastoralOneOnOneNota = {
        id: randomUUID(),
        oneOnOneId: input.oneOnOneId,
        autorPersonaId: input.autorPersonaId,
        contenido: input.contenido,
        createdAt: new Date().toISOString(),
      }
      notas.push(created)
      return created
    },

    async listNotas(oneOnOneId: string): Promise<readonly PastoralOneOnOneNota[]> {
      return notas.filter((n) => n.oneOnOneId === oneOnOneId)
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
