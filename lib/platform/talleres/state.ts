/**
 * PR4 — DT-014 — Talleres state machines (workshop / participant / report).
 *
 * Implements design.md §7 — state machine catalog with optimistic concurrency.
 * The pure `transition()` function is the single entry point; every transition
 * for all three state machines (workshop, participant, report) goes through it.
 *
 * State machine catalog:
 *   workshop:    borrador → abierto → en_curso → cerrado (terminal)
 *                                            ↘ cancelado (terminal; motivo obligatorio)
 *   participant: pendiente → aprobado → unit_estado (completado|no_completado|abandono)
 *                pendiente → no_aprobado → pendiente (only while period active)
 *   report:      borrador → enviado → reabierto (motivo obligatorio) → cerrado
 *                                                ↑ only reopener can edit
 *
 * Concurrency: optimistic via `version`; stale writes throw StaleVersionError (HTTP 409).
 * Terminal states throw InvalidTransitionError on any action.
 * Motivo is mandatory for transitions to `reabierto` (report), `cancelado` (workshop),
 * or `no_aprobado` (participant) — MotivoRequeridoError otherwise.
 *
 * Purity: no I/O, no Date.now(), no globals — `transition()` is referentially
 * transparent. Higher layers (services / repositories) own time and persistence.
 */

import type {
  TallerEstado,
  TallerInscripcionEstado,
  TallerUnidadEstado,
  TallerReporteEstado,
} from './types'

// ---------------------------------------------------------------------------
// State constants
// ---------------------------------------------------------------------------

/** Closed set of workshop lifecycle states (D15). */
export const WORKSHOP_STATES = [
  'borrador',
  'abierto',
  'en_curso',
  'cerrado',
  'cancelado',
] as const satisfies readonly TallerEstado[]

/** Closed set of participant enrollment unit states (D16).
 * Includes the enrollment-state half (pendiente, aprobado) and the
 * unit_estado half (completado, no_completado, abandono). */
export const PARTICIPANT_STATES: ReadonlyArray<
  TallerInscripcionEstado | TallerUnidadEstado
> = ['pendiente', 'aprobado', 'completado', 'no_completado', 'abandono']

/** Closed set of report lifecycle states (D15). */
export const REPORT_STATES = [
  'borrador',
  'enviado',
  'reabierto',
  'cerrado',
] as const satisfies readonly TallerReporteEstado[]

// ---------------------------------------------------------------------------
// Public type aliases
// ---------------------------------------------------------------------------

export type WorkshopEstado = (typeof WORKSHOP_STATES)[number]
export type ParticipantEstado = (typeof PARTICIPANT_STATES)[number]
export type ReportEstado = (typeof REPORT_STATES)[number]

export type StateMachineTarget = 'workshop' | 'participant' | 'report'

/** All valid actions across the three state machines. */
export type TallerAccion =
  // workshop
  | 'abrir'
  | 'iniciar'
  | 'cerrar'
  | 'cancelar'
  // participant
  | 'aprobar'
  | 'rechazar'
  | 'reanudar'
  | 'completar'
  | 'no_completar'
  | 'marcar_abandono'
  // report
  | 'enviar'
  | 'reabrir'

/** Inputs the transition function accepts for any of the 3 machines. */
export interface TransitionInput<Current extends { estado: string; version: number }> {
  readonly target: StateMachineTarget
  readonly current: Current
  readonly action: TallerAccion
  readonly version: number
  /** Required when transitioning to `cancelado`, `reabierto`, or `no_aprobado`. */
  readonly motivo?: string
}

/** The result shape for any state-machine transition. Always returns a
 * new record with `estado` and `version: prev + 1`. Other fields are
 * forwarded from `current` unchanged. */
export type TransitionResult<Current extends { estado: string; version: number }> = Omit<
  Current,
  'estado' | 'version'
> & {
  readonly estado: Current['estado']
  readonly version: number
}

// ---------------------------------------------------------------------------
// Transition matrix
// ---------------------------------------------------------------------------

interface TransitionEntry<From extends string, To extends string> {
  readonly from: From
  readonly to: To
  readonly requiresMotivo?: boolean
}

/** A matrix slot is either a concrete entry, or `null` if the action is not
 * defined for that target. The 'cerrar' action is reused across workshop and
 * report (different (from,to) pairs); the matrix below pins each action to
 * its correct (from,to) for each target. */
type MatrixSlot = TransitionEntry<string, string> | null

/** Workshop: action → (from → to). The 'cerrar' action is workshop-owned here. */
const WORKSHOP_TRANSITIONS: Readonly<Record<TallerAccion, MatrixSlot>> = {
  abrir: { from: 'borrador', to: 'abierto' },
  iniciar: { from: 'abierto', to: 'en_curso' },
  cerrar: { from: 'en_curso', to: 'cerrado' },
  cancelar: { from: 'en_curso', to: 'cancelado', requiresMotivo: true },
  aprobar: null,
  rechazar: null,
  reanudar: null,
  completar: null,
  no_completar: null,
  marcar_abandono: null,
  enviar: null,
  reabrir: null,
}

/** Participant: action → (from → to). */
const PARTICIPANT_TRANSITIONS: Readonly<Record<TallerAccion, MatrixSlot>> = {
  aprobar: { from: 'pendiente', to: 'aprobado' },
  rechazar: { from: 'pendiente', to: 'no_aprobado', requiresMotivo: true },
  reanudar: { from: 'no_aprobado', to: 'pendiente' },
  completar: { from: 'aprobado', to: 'completado' },
  no_completar: { from: 'aprobado', to: 'no_completado' },
  marcar_abandono: { from: 'aprobado', to: 'abandono' },
  abrir: null,
  iniciar: null,
  cerrar: null,
  cancelar: null,
  enviar: null,
  reabrir: null,
}

/** Report: action → (from → to). The 'cerrar' action is report-owned here
 * (reabierto → cerrado), distinct from the workshop 'cerrar' (en_curso → cerrado). */
const REPORT_TRANSITIONS: Readonly<Record<TallerAccion, MatrixSlot>> = {
  enviar: { from: 'borrador', to: 'enviado' },
  reabrir: { from: 'enviado', to: 'reabierto', requiresMotivo: true },
  cerrar: { from: 'reabierto', to: 'cerrado' },
  abrir: null,
  iniciar: null,
  cancelar: null,
  aprobar: null,
  rechazar: null,
  reanudar: null,
  completar: null,
  no_completar: null,
  marcar_abandono: null,
}

// ---------------------------------------------------------------------------
// Terminal state sets
// ---------------------------------------------------------------------------

const TERMINAL_WORKSHOP: ReadonlySet<WorkshopEstado> = new Set(['cerrado', 'cancelado'])
const TERMINAL_PARTICIPANT: ReadonlySet<ParticipantEstado> = new Set([
  'completado',
  'no_completado',
  'abandono',
])
const TERMINAL_REPORT: ReadonlySet<ReportEstado> = new Set(['cerrado'])

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/** Thrown when a (state, action) pair is not present in the matrix for the
 * given target machine. Equivalent to HTTP 409 INVALID_STATE_TRANSITION. */
export class InvalidTransitionError extends Error {
  public readonly code = 'INVALID_STATE_TRANSITION' as const
  public readonly target: StateMachineTarget
  public readonly currentState: string
  public readonly action: TallerAccion

  public constructor(params: {
    target: StateMachineTarget
    currentState: string
    action: TallerAccion
    message?: string
  }) {
    super(
      params.message ??
        `Invalid transition: action '${params.action}' is not allowed from state '${params.currentState}' on target '${params.target}'`,
    )
    this.name = 'InvalidTransitionError'
    this.target = params.target
    this.currentState = params.currentState
    this.action = params.action
  }
}

/** Thrown when the supplied `version` does not match the record's current
 * `version`. Equivalent to HTTP 409 CONCURRENCY_CONFLICT. */
export class StaleVersionError extends Error {
  public readonly code = 'CONCURRENCY_CONFLICT' as const
  public readonly actual: number
  public readonly expected: number

  public constructor(params: { actual: number; expected: number; message?: string }) {
    super(
      params.message ??
        `Stale version: expected=${params.expected}, actual=${params.actual}`,
    )
    this.name = 'StaleVersionError'
    this.actual = params.actual
    this.expected = params.expected
  }
}

/** Thrown when an action that requires a `motivo` is invoked without one
 * (or with a blank string). Equivalent to HTTP 400 MISSING_MOTIVO. */
export class MotivoRequeridoError extends Error {
  public readonly code = 'MISSING_MOTIVO' as const
  public readonly action: TallerAccion
  public readonly target: StateMachineTarget

  public constructor(params: { target: StateMachineTarget; action: TallerAccion; message?: string }) {
    super(
      params.message ??
        `motivo is required for action '${params.action}' on target '${params.target}'`,
    )
    this.name = 'MotivoRequeridoError'
    this.action = params.action
    this.target = params.target
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function motivoProvided(motivo: string | undefined): boolean {
  return typeof motivo === 'string' && motivo.trim().length > 0
}

function isTerminal(target: StateMachineTarget, estado: string): boolean {
  switch (target) {
    case 'workshop':
      return TERMINAL_WORKSHOP.has(estado as WorkshopEstado)
    case 'participant':
      return TERMINAL_PARTICIPANT.has(estado as ParticipantEstado)
    case 'report':
      return TERMINAL_REPORT.has(estado as ReportEstado)
    default:
      return false
  }
}

function resolveMatrix(target: StateMachineTarget): Readonly<Record<TallerAccion, MatrixSlot>> {
  switch (target) {
    case 'workshop':
      return WORKSHOP_TRANSITIONS
    case 'participant':
      return PARTICIPANT_TRANSITIONS
    case 'report':
      return REPORT_TRANSITIONS
    default:
      return WORKSHOP_TRANSITIONS
  }
}

// ---------------------------------------------------------------------------
// Public transition function
// ---------------------------------------------------------------------------

/**
 * Pure state-machine transition. Returns a NEW record with `estado` set to
 * the next valid state and `version: prev + 1`. All other fields are
 * forwarded from `current` unchanged (no mutation, no shared references).
 *
 * Errors:
 *  - {@link StaleVersionError}  — supplied `version` does not match `current.version`
 *  - {@link InvalidTransitionError} — (state, action) not in matrix OR terminal source
 *  - {@link MotivoRequeridoError} — action requires motivo and none was supplied
 */
export function transition<Current extends { estado: string; version: number }>(
  input: TransitionInput<Current>,
): TransitionResult<Current> {
  const { target, current, action, version, motivo } = input
  const matrix = resolveMatrix(target)

  // 1) Optimistic concurrency: caller must hold the current version.
  if (version !== current.version) {
    throw new StaleVersionError({ actual: current.version, expected: version })
  }

  // 2) Resolve the transition entry for the requested machine.
  const entry = matrix[action] ?? null

  // 3) Action does not belong to this machine (e.g. 'aprobar' on workshop).
  if (entry === null) {
    throw new InvalidTransitionError({
      target,
      currentState: current.estado,
      action,
      message: `Action '${action}' is not defined for target '${target}'`,
    })
  }

  // 4) Terminal source state.
  if (isTerminal(target, current.estado)) {
    throw new InvalidTransitionError({
      target,
      currentState: current.estado,
      action,
      message: `Cannot transition from terminal state '${current.estado}' on target '${target}'`,
    })
  }

  // 5) Source state does not match the matrix.
  if (entry.from !== current.estado) {
    throw new InvalidTransitionError({
      target,
      currentState: current.estado,
      action,
      message: `Action '${action}' is not valid from state '${current.estado}' (expected '${entry.from}') on target '${target}'`,
    })
  }

  // 6) Motivo obligatorio.
  if (entry.requiresMotivo === true && !motivoProvided(motivo)) {
    throw new MotivoRequeridoError({ target, action })
  }

  // 7) Build the new record (immutable spread — no mutation of `current`).
  const { estado: _estado, version: _version, ...rest } = current
  return {
    ...rest,
    estado: entry.to as Current['estado'],
    version: current.version + 1,
  } as TransitionResult<Current>
}
