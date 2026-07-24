/**
 * W05 — DT-030 — Pastoral 1:1 service.
 *
 * Implements `completeOneOnOneWithGrants(...)` — mirrors F2/F3 transitionWithGrants pattern.
 *
 * Flow:
 * 1. Fetch the 1:1 record
 * 2. Apply state machine transition (in_progress → completed)
 * 3. Validate resumen (validarResumen — D17, P4)
 * 4. Update the record (version + 1)
 * 5. Emit pastoral_one_on_one_completed to the ledger (via PastoralLedgerWriter)
 * 6. Return the updated 1:1
 *
 * ESC-01 (pastoral-one-on-one-complete): happy path completion.
 *
 * Does NOT manage grants (pastoral 1:1 does not have the pause/restore grant system).
 */
import { transition } from '../state'
import { validarResumen } from './validators'
import type { PastoralOneOnOneRepository } from './repository'
import type {
  PastoralOneOnOne,
  PastoralOneOnOneParticipante,
} from '../types'
import { isConcurrencyConflict, isTerminalState, isInvalidStateTransition, isMissingMotivo } from '../errors'
import type { PastoralError } from '../errors'
import type { PastoralLedgerWriter } from '../participation-ledger-pastoral-writer'
import { buildOneOnOnePastoralEvent } from '../build-pastoral-event'

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CompleteOneOnOneInput {
  readonly oneOnOneId: string
  readonly actorPersonaId: string
  readonly resumen: string
  readonly expectedVersion: number
}

export interface CompleteOneOnOneResult {
  readonly ok: true
  readonly oneOnOne: PastoralOneOnOne
}
export type CompleteOneOnOneError = PastoralError
export type CompleteOneOnOneResultType = CompleteOneOnOneResult | { readonly ok: false; readonly error: CompleteOneOnOneError }

// ─── Service ─────────────────────────────────────────────────────────────────

export interface PastoralOneOnOneService {
  completeOneOnOne(input: CompleteOneOnOneInput): Promise<CompleteOneOnOneResultType>
}

export function createPastoralOneOnOneService(
  repository: PastoralOneOnOneRepository,
  ledgerWriter: PastoralLedgerWriter,
): PastoralOneOnOneService {
  async function completeOneOnOne(
    input: CompleteOneOnOneInput,
  ): Promise<CompleteOneOnOneResultType> {
    const { oneOnOneId, actorPersonaId, resumen, expectedVersion } = input

    // 1. Fetch current record
    const current = await repository.getOneOnOneById(oneOnOneId)
    if (!current) {
      return {
        ok: false,
        error: {
          code: 'PASTORAL_NOT_FOUND',
          message: `OneOnOne ${oneOnOneId} not found`,
        },
      }
    }

    // 2. Validate resumen (D17, P4 — ESC-04, ESC-05 from pastoral-one-on-one-complete)
    const resumenValidation = validarResumen(resumen)
    if (!resumenValidation.ok) {
      return {
        ok: false,
        error: {
          code: resumenValidation.code === 'RESUMEN_TOO_LONG'
            ? 'MISSING_MOTIVO'
            : 'INVALID_STATE_TRANSITION',
          message: resumenValidation.message,
        },
      }
    }

    // 3. Apply state machine transition (in_progress → completed)
    const transitionResult = transition({
      oneOnOne: current,
      accion: 'complete',
      version: expectedVersion,
      resumen,
    })

    if (!transitionResult.ok) {
      return { ok: false, error: transitionResult.error }
    }

    // 4. Update the record with new state + version bump
    const updated = await repository.updateOneOnOne(oneOnOneId, {
      estado: transitionResult.oneOnOneNuevo.estado,
      resumen,
      expectedVersion,
    })

    // 5. Emit pastoral_one_on_one_completed to the ledger (via writer from W04)
    try {
      const eventInput = buildOneOnOnePastoralEvent({
        kind: 'pastoral_one_on_one_completed',
        actorPersonaId,
        oneOnOneId,
        metadata: {
          previousEstado: current.estado,
          completedAt: updated.completedAt ?? new Date().toISOString(),
        },
      })
      await ledgerWriter.emitPastoralEvent(eventInput)
    } catch (ledgerError) {
      // Ledger failure should not rollback the completed state
      // (append-only ledger can be reconciled asynchronously)
      console.error('[PastoralOneOnOneService] Ledger emit failed:', ledgerError)
    }

    return { ok: true, oneOnOne: updated }
  }

  return { completeOneOnOne }
}
