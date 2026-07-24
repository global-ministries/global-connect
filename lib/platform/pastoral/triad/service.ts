/**
 * W07 — DT-036 — Pastoral Triada service.
 *
 * Implements:
 * - createTriadaWithAutoFormation(...) — creates triada triggered by P4 (step taken)
 *   Called directly when a step is validated in the 1:1 flow.
 *   contexto='nuevo_paso' (new step formation).
 *
 * - disbandTriadaWithAudit(...) — disbands triada with required motivo
 *   and emits pastoral_triada_disbanded to the ledger.
 *
 * Mirrors the F2/F3 transitionWithGrants pattern but simplified for pastoral.
 */
import { triadTransition } from '../triad-state'
import type { PastoralTriadaRepository } from './repository'
import type {
  PastoralTriada,
  PastoralTriadaMiembro,
  TriadaDissolutionReason,
} from '../types'
import {
  isConcurrencyConflict,
  isTerminalState,
  isInvalidStateTransition,
  isMissingMotivo,
} from '../errors'
import type { PastoralError } from '../errors'
import type { PastoralLedgerWriter } from '../participation-ledger-pastoral-writer'
import { buildTriadaPastoralEvent } from '../build-pastoral-event'
import { validarCardinalidadTriada } from './validators'

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateTriadaWithAutoFormationInput {
  readonly mentorOficialPersonaId: string
  readonly autorPersonaId: string
  readonly assistedPersonaId: string
  readonly coordinatorPersonaId: string
}

export interface CreateTriadaWithAutoFormationResult {
  readonly ok: true
  readonly triada: PastoralTriada
  readonly miembros: readonly PastoralTriadaMiembro[]
}

export type CreateTriadaWithAutoFormationError = PastoralError
export type CreateTriadaWithAutoFormationResultType =
  | CreateTriadaWithAutoFormationResult
  | { readonly ok: false; readonly error: CreateTriadaWithAutoFormationError }

export interface DisbandTriadaWithAuditInput {
  readonly triadaId: string
  readonly actorPersonaId: string
  readonly motivo: TriadaDissolutionReason
  readonly expectedVersion: number
}

export interface DisbandTriadaWithAuditResult {
  readonly ok: true
  readonly triada: PastoralTriada
}

export type DisbandTriadaWithAuditError = PastoralError
export type DisbandTriadaWithAuditResultType =
  | DisbandTriadaWithAuditResult
  | { readonly ok: false; readonly error: DisbandTriadaWithAuditError }

// W08 — DT-047: Confirm triada (pending_confirmation → active)

export interface ConfirmTriadaInput {
  readonly triadaId: string
  readonly actorPersonaId: string
  readonly expectedVersion: number
}

export interface ConfirmTriadaResult {
  readonly ok: true
  readonly triada: PastoralTriada
}

export type ConfirmTriadaError = PastoralError
export type ConfirmTriadaResultType =
  | ConfirmTriadaResult
  | { readonly ok: false; readonly error: ConfirmTriadaError }

// ─── Service ─────────────────────────────────────────────────────────────────

export interface PastoralTriadaService {
  createTriadaWithAutoFormation(
    input: CreateTriadaWithAutoFormationInput,
  ): Promise<CreateTriadaWithAutoFormationResultType>

  disbandTriadaWithAudit(
    input: DisbandTriadaWithAuditInput,
  ): Promise<DisbandTriadaWithAuditResultType>

  confirmTriada(
    input: ConfirmTriadaInput,
  ): Promise<ConfirmTriadaResultType>
}

export function createPastoralTriadaService(
  repository: PastoralTriadaRepository,
  ledgerWriter: PastoralLedgerWriter,
): PastoralTriadaService {
  async function createTriadaWithAutoFormation(
    input: CreateTriadaWithAutoFormationInput,
  ): Promise<CreateTriadaWithAutoFormationResultType> {
    const {
      mentorOficialPersonaId,
      autorPersonaId,
      assistedPersonaId,
      coordinatorPersonaId,
    } = input

    // 1. Create the triada with contexto='nuevo_paso' (P4 — new step formation)
    const triada = await repository.createTriada({
      mentorOficialPersonaId,
      autorPersonaId,
      contexto: 'nuevo_paso',
    })

    // 2. Add the 3 members (cardinality 3 — D25)
    // Members: mentor, assisted person, coordinator
    const miembros: PastoralTriadaMiembro[] = []

    try {
      const m1 = await repository.addMiembro({
        triadaId: triada.id,
        personaId: mentorOficialPersonaId,
        rolEnTriada: 'mentor',
      })
      miembros.push(m1)

      const m2 = await repository.addMiembro({
        triadaId: triada.id,
        personaId: assistedPersonaId,
        rolEnTriada: 'asistido',
      })
      miembros.push(m2)

      const m3 = await repository.addMiembro({
        triadaId: triada.id,
        personaId: coordinatorPersonaId,
        rolEnTriada: 'coordinador',
      })
      miembros.push(m3)
    } catch (memberError) {
      // If adding members fails due to cardinality, return error
      const message = memberError instanceof Error ? memberError.message : 'Unknown error'
      return {
        ok: false,
        error: {
          code: 'INVALID_CARDINALITY',
          message,
        },
      }
    }

    // 3. Emit pastoral_triada_formed to the ledger
    try {
      const eventInput = buildTriadaPastoralEvent({
        kind: 'pastoral_triada_formed',
        actorPersonaId: autorPersonaId,
        triadaId: triada.id,
        metadata: {
          contexto: 'nuevo_paso',
          miembros: miembros.map((m) => ({
            personaId: m.personaId,
            rol: m.rolEnTriada,
          })),
        },
      })
      await ledgerWriter.emitPastoralEvent(eventInput)
    } catch (ledgerError) {
      // Ledger failure should not rollback the formation
      // (append-only ledger can be reconciled asynchronously)
      console.error('[PastoralTriadaService] Ledger emit failed:', ledgerError)
    }

    return { ok: true, triada, miembros }
  }

  async function disbandTriadaWithAudit(
    input: DisbandTriadaWithAuditInput,
  ): Promise<DisbandTriadaWithAuditResultType> {
    const { triadaId, actorPersonaId, motivo, expectedVersion } = input

    // 1. Fetch current triada record
    const current = await repository.getTriadaById(triadaId)
    if (!current) {
      return {
        ok: false,
        error: {
          code: 'PASTORAL_NOT_FOUND',
          message: `Triada ${triadaId} not found`,
        },
      }
    }

    // 2. Apply state machine transition (disband requires motivo from closed catalog)
    const transitionResult = triadTransition({
      triada: current,
      accion: 'disband',
      version: expectedVersion,
      motivo,
    })

    if (!transitionResult.ok) {
      return { ok: false, error: (transitionResult as unknown as { ok: false; error: PastoralError }).error }
    }

    // 3. Update the record with disbanded state + version bump
    const updated = await repository.updateTriada(triadaId, {
      estado: transitionResult.triadaNueva.estado,
      motivoDisolucion: motivo,
      expectedVersion,
    })

    // 4. Emit pastoral_triada_disbanded to the ledger
    try {
      const eventInput = buildTriadaPastoralEvent({
        kind: 'pastoral_triada_disbanded',
        actorPersonaId,
        triadaId,
        metadata: {
          previousEstado: current.estado,
          motivoDisolucion: motivo,
        },
      })
      await ledgerWriter.emitPastoralEvent(eventInput)
    } catch (ledgerError) {
      // Ledger failure should not rollback the disband
      console.error('[PastoralTriadaService] Ledger emit failed:', ledgerError)
    }

    return { ok: true, triada: updated }
  }

  async function confirmTriada(
    input: ConfirmTriadaInput,
  ): Promise<ConfirmTriadaResultType> {
    const { triadaId, actorPersonaId, expectedVersion } = input

    // 1. Fetch current triada record
    const current = await repository.getTriadaById(triadaId)
    if (!current) {
      return {
        ok: false,
        error: {
          code: 'PASTORAL_NOT_FOUND',
          message: `Triada ${triadaId} not found`,
        },
      }
    }

    // 2. Apply state machine transition (pending_confirmation → active)
    const transitionResult = triadTransition({
      triada: current,
      accion: 'confirm',
      version: expectedVersion,
    })

    if (!transitionResult.ok) {
      return { ok: false, error: (transitionResult as unknown as { ok: false; error: PastoralError }).error }
    }

    // 3. Update the record with active state + version bump
    const updated = await repository.updateTriada(triadaId, {
      estado: transitionResult.triadaNueva.estado,
      expectedVersion,
    })

    // 4. Emit pastoral_triada_confirmed to the ledger
    // pastoral_triada_confirmed is not yet in PastoralParticipationKind union
    // Use as any to bypass type check (ledger accepts it at runtime via M3)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventInput = buildTriadaPastoralEvent({
        kind: 'pastoral_triada_confirmed' as any,
        actorPersonaId,
        triadaId,
        metadata: {
          previousEstado: current.estado,
        },
      })
      await ledgerWriter.emitPastoralEvent(eventInput)
    } catch (ledgerError) {
      // Ledger failure should not rollback the confirmation
      console.error('[PastoralTriadaService] Ledger emit failed:', ledgerError)
    }

    return { ok: true, triada: updated }
  }

  return {
    createTriadaWithAutoFormation,
    disbandTriadaWithAudit,
    confirmTriada,
  }
}
