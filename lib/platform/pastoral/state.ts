/**
 * W02 — DT-010 — Pastoral 1:1 state machine.
 * 6 closed states (D12): pending_participant, scheduled, in_progress,
 * completed, cancelled, no_realizado.
 * Optimistic concurrency via `version` — stale version → 409 CONCURRENCY_CONFLICT.
 * Follows the DreamTeam state-machine.ts pattern (F2).
 */
import {
  pastoralError,
  isTerminalState,
  isConcurrencyConflict,
} from './errors'
import {
  ONE_ON_ONE_STATES,
  TERMINAL_ONE_ON_ONE_ESTADOS,
  type OneOnOneEstado,
  type OneOnOneAccion,
  type OneOnOneTransitionInput,
  type OneOnOneTransitionResult,
  type PastoralOneOnOne,
} from './types'

export { ONE_ON_ONE_STATES, TERMINAL_ONE_ON_ONE_ESTADOS }
export type { OneOnOneEstado, OneOnOneAccion, OneOnOneTransitionInput, OneOnOneTransitionResult }

/** Closed transition matrix — D12. */
export const ONE_ON_ONE_TRANSITIONS: Readonly<
  Record<OneOnOneEstado, ReadonlySet<OneOnOneEstado>>
> = {
  // From pending_participant: can schedule, or cancel (P3 — no rechazo allowed, but mentor autor can cancel)
  pending_participant: new Set(['scheduled', 'cancelled'] as const),
  // From scheduled: can start (in_progress), reprogram (stay scheduled), cancel, or mark no_realizado
  scheduled: new Set(['in_progress', 'scheduled', 'cancelled', 'no_realizado'] as const),
  // From in_progress: can stay (add nota), complete, or cancel
  in_progress: new Set(['in_progress', 'completed', 'cancelled'] as const),
  // Terminals: no outgoing transitions
  completed: new Set([] as const),
  cancelled: new Set([] as const),
  no_realizado: new Set([] as const),
}

/** Map action → target state. */
function accionToEstado(
  accion: OneOnOneAccion,
  estadoActual: OneOnOneEstado,
): OneOnOneEstado | null {
  switch (accion) {
    case 'schedule':
      return estadoActual === 'pending_participant' ? 'scheduled' : null
    case 'start':
      return estadoActual === 'scheduled' ? 'in_progress' : null
    case 'complete':
      return estadoActual === 'in_progress' ? 'completed' : null
    case 'cancel':
      return TERMINAL_ONE_ON_ONE_ESTADOS.has(estadoActual)
        ? null
        : 'cancelled'
    case 'mark_no_realizado':
      return estadoActual === 'scheduled' ? 'no_realizado' : null
    case 'add_nota':
      // Nota anexa no cambia estado; stays same.
      return estadoActual
    default:
      return null
  }
}

/**
 * Pure state transition function.
 * Returns updated PastoralOneOnOne or error.
 * ESC-01: happy path.
 * ESC-02: invalid transition → INVALID_STATE_TRANSITION.
 * ESC-03: stale version → CONCURRENCY_CONFLICT (HTTP 409).
 */
export function transition(
  input: OneOnOneTransitionInput,
): OneOnOneTransitionResult {
  const { oneOnOne, accion, version, scheduledAt, resumen, motivoCancelacion, motivoNoRealizado } = input

  // ESC-03: version obsoleta → 409
  if (version !== oneOnOne.version) {
    return {
      ok: false,
      error: pastoralError(
        'CONCURRENCY_CONFLICT',
        'version is stale',
        { expected: oneOnOne.version, received: version },
      ),
    }
  }

  const estadoActual = oneOnOne.estado

  // Terminal state: no transitions allowed
  if (TERMINAL_ONE_ON_ONE_ESTADOS.has(estadoActual)) {
    return {
      ok: false,
      error: pastoralError('TERMINAL_STATE', 'cannot transition from terminal state', {
        estado: estadoActual,
      }),
    }
  }

  // Self-transition for add_nota is allowed (no-op on state, just version bump)
  if (accion === 'add_nota') {
    return {
      ok: true,
      oneOnOneNuevo: {
        ...oneOnOne,
        version: oneOnOne.version + 1,
        updatedAt: new Date().toISOString(),
      },
    }
  }

  const estadoNuevo = accionToEstado(accion, estadoActual)

  // ESC-02: invalid transition
  if (estadoNuevo === null) {
    return {
      ok: false,
      error: pastoralError('INVALID_STATE_TRANSITION', 'transition is not valid', {
        from: estadoActual,
        accion,
      }),
    }
  }

  // Verify the target state is in the valid transitions from current state
  if (!ONE_ON_ONE_TRANSITIONS[estadoActual].has(estadoNuevo)) {
    return {
      ok: false,
      error: pastoralError('INVALID_STATE_TRANSITION', 'transition is not valid', {
        from: estadoActual,
        to: estadoNuevo,
        accion,
      }),
    }
  }

  // Validate required fields for terminal transitions
  if (estadoNuevo === 'cancelled') {
    if (!motivoCancelacion || motivoCancelacion.trim() === '') {
      return {
        ok: false,
        error: pastoralError('MISSING_MOTIVO', 'motivo_cancelacion is required for cancellation'),
    }
    }
  }

  if (estadoNuevo === 'no_realizado') {
    if (!motivoNoRealizado || motivoNoRealizado.trim() === '') {
      return {
        ok: false,
        error: pastoralError('MISSING_MOTIVO', 'motivo_no_realizado is required'),
    }
    }
  }

  if (estadoNuevo === 'completed') {
    if (resumen === undefined || resumen === null) {
      return {
        ok: false,
        error: pastoralError('MISSING_MOTIVO', 'resumen is required for completion'),
      }
    }
  }

  const now = new Date().toISOString()

  // Build the updated record by constructing a plain object then casting.
  // TypeScript readonly on PastoralOneOnOne fields prevents direct assignment,
  // so we use a plain-object intermediate and cast the final result.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partial: any = {
    estado: estadoNuevo,
    version: oneOnOne.version + 1,
    updatedAt: now,
  }
  if (scheduledAt !== undefined) partial.scheduledAt = scheduledAt
  if (resumen !== undefined) partial.resumen = resumen
  if (motivoCancelacion !== undefined) partial.motivoCancelacion = motivoCancelacion
  if (motivoNoRealizado !== undefined) partial.motivoNoRealizado = motivoNoRealizado
  if (estadoNuevo === 'completed') partial.completedAt = now

  const oneOnOneNuevo: PastoralOneOnOne = {
    ...oneOnOne,
    ...partial,
  }

  return {
    ok: true,
    oneOnOneNuevo,
  }
}
