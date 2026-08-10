/**
 * PR4 — DT-016 — Talleres state-machine composition.
 *
 * Composes the three pure state machines from `./state` (workshop, participant,
 * report) into higher-level domain operations:
 *   - assertVersion(actual, expected)              — shared optimistic concurrency helper
 *   - canEnrollParticipants(workshopEstado)        — enrollment window guard
 *   - canReopenReport(reportEstado)                — reopen eligibility guard
 *   - applyWorkshopToEnrollment(taller, p, action) — composition: rejects when
 *                                                    the workshop is not in a
 *                                                    compatible lifecycle state
 *
 * Role checks (e.g. only `coordinador` / `director` can reopen a report) are
 * intentionally OUT OF SCOPE for this slice. The state-machine composition is
 * purely about the state graph; the role gate is a separate concern that will
 * live in the service / route layer.
 *
 * All exports are pure functions. No I/O, no Date.now(), no globals.
 */

import {
  InvalidTransitionError,
  StaleVersionError,
  transition,
  type WorkshopEstado,
  type ReportEstado,
  type TallerAccion,
} from './state'
import type { TallerMetadata } from './types'

// ---------------------------------------------------------------------------
// assertVersion — optimistic concurrency helper
// ---------------------------------------------------------------------------

/**
 * Asserts that the caller's expected version matches the record's actual
 * version. Throws {@link StaleVersionError} (HTTP 409) if they differ.
 *
 * @param actual   the version currently stored in the record
 * @param expected the version the caller believes it holds
 */
export function assertVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new StaleVersionError({ actual, expected })
  }
}

// ---------------------------------------------------------------------------
// canEnrollParticipants — workshop lifecycle gate
// ---------------------------------------------------------------------------

/**
 * Returns true if participants may be enrolled given the current workshop
 * lifecycle state. Enrollment is allowed while the workshop is `abierto` or
 * `en_curso`; it is closed in `borrador`, `cerrado`, and `cancelado`.
 *
 * See design.md §1 (workshop lifecycle) and catalog spec ("Enrollment only
 * while the workshop is `abierto` or `en_curso`").
 */
export function canEnrollParticipants(estado: WorkshopEstado): boolean {
  return estado === 'abierto' || estado === 'en_curso'
}

// ---------------------------------------------------------------------------
// canReopenReport — report lifecycle gate
// ---------------------------------------------------------------------------

/**
 * Returns true if the report is in a state from which a reopen is valid.
 * Per design.md §7, reopen applies to `enviado` reports; `borrador` reports
 * can simply be edited, `reabierto` reports are already reopened, and
 * `cerrado` reports are terminal.
 */
export function canReopenReport(estado: ReportEstado): boolean {
  return estado === 'enviado'
}

// ---------------------------------------------------------------------------
// applyWorkshopToEnrollment — workshop × enrollment composition
// ---------------------------------------------------------------------------

/** Actions that are valid to apply to a participant (subset of `TallerAccion`). */
export type EnrollmentAction = Extract<
  TallerAccion,
  'aprobar' | 'rechazar' | 'reanudar' | 'completar' | 'no_completar' | 'marcar_abandono'
>

/**
 * Composes the workshop and participant state machines. The participant
 * transition only succeeds if the workshop is in a compatible lifecycle
 * state — specifically `abierto` or `en_curso`. The participant's own
 * version is also asserted via the underlying `transition()` call.
 *
 * The `Current` generic is open: the state machine treats participant
 * state as a single `estado` field across the full 5-value range
 * (pendiente, aprobado, completado, no_completado, abandono). The DB
 * schema splits this into `estado` (3 values) + `unit_estado` (3 values)
 * for storage; that projection is a concern of the repository layer,
 * not the state machine.
 *
 * Throws:
 *  - {@link InvalidTransitionError} if the workshop is in a state that
 *    does not accept enrollment (borrador, cerrado, cancelado) OR if the
 *    participant transition itself is invalid (terminal state, wrong
 *    source state, motivo missing).
 *  - {@link StaleVersionError} if the supplied `version` is stale.
 *  - {@link MotivoRequeridoError} if the action requires a motivo and
 *    none was supplied.
 */
export function applyWorkshopToEnrollment<
  Current extends { estado: string; version: number },
>(
  taller: TallerMetadata,
  inscripcion: Current,
  action: EnrollmentAction,
  params: { version: number; motivo?: string } = { version: inscripcion.version },
): Current {
  if (!canEnrollParticipants(taller.estado)) {
    throw new InvalidTransitionError({
      target: 'participant',
      currentState: inscripcion.estado,
      action,
      message: `Workshop '${taller.taller_id}' is in state '${taller.estado}' which does not accept enrollment actions`,
    })
  }

  return transition<Current>({
    target: 'participant',
    current: inscripcion,
    action,
    version: params.version,
    motivo: params.motivo,
  }) as Current
}
