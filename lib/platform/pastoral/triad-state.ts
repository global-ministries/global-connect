/**
 * W03 — DT-017 — Pastoral Triada state machine.
 *
 * D13: 4 closed states — pending_confirmation, active, en_pausa, disbanded.
 * disbanded is terminal absolute — no transitions allowed from it.
 *
 * D14: 5 dissolution reasons — gdv_liderazgo_removed, servicio_retirado,
 *      cambio_de_temporada, pastoral_decision, otro.
 *
 * State machine logic:
 *   pending_confirmation → active  (confirm)
 *   pending_confirmation → disbanded (disband)
 *   active → en_pausa  (pause)
 *   active → disbanded (disband)
 *   en_pausa → active  (resume)
 *   en_pausa → disbanded (disband)
 *   disbanded → nothing (terminal absolute)
 *
 * Follows the DreamTeam state-machine.ts pattern (F2).
 */
import {
  pastoralError,
  isTerminalState,
  isConcurrencyConflict,
} from './errors'
import {
  TRIADA_STATES,
  TERMINAL_TRIADA_ESTADOS,
  TRIADA_DISSOLUTION_REASONS,
  type PastoralTriada,
  type TriadaEstado,
  type TriadaAccion,
  type TriadaTransitionInput,
  type TriadaTransitionResult,
  type TriadaDissolutionReason,
} from './types'

export { TRIADA_STATES, TERMINAL_TRIADA_ESTADOS, TRIADA_DISSOLUTION_REASONS }
export type { TriadaEstado, TriadaAccion, TriadaTransitionInput, TriadaTransitionResult }

/** Closed transition matrix — D13. */
export const TRIADA_TRANSITIONS: Readonly<
  Record<TriadaEstado, ReadonlySet<TriadaEstado>>
> = {
  pending_confirmation: new Set(['active', 'disbanded'] as const),
  active: new Set(['en_pausa', 'disbanded'] as const),
  en_pausa: new Set(['active', 'disbanded'] as const),
  disbanded: new Set([] as const),
}

/**
 * Maps action + current state → target state.
 * Returns null if the action is not valid from the current state.
 */
function acciónAEstado(
  accion: TriadaAccion,
  estadoActual: TriadaEstado,
): TriadaEstado | null {
  switch (accion) {
    case 'confirm':
      return estadoActual === 'pending_confirmation' ? 'active' : null
    case 'disband':
      // disband is valid from pending_confirmation, active, or en_pausa
      if (estadoActual === 'disbanded') return null
      return 'disbanded'
    case 'pause':
      return estadoActual === 'active' ? 'en_pausa' : null
    case 'resume':
      return estadoActual === 'en_pausa' ? 'active' : null
    default:
      return null
  }
}

/**
 * Pure state transition function for the Triada lifecycle.
 *
 * ESC-04: transitions to disbanded (terminal).
 * ESC-02: en_pausa → active round-trip.
 * ESC-03: stale version → CONCURRENCY_CONFLICT (HTTP 409).
 * ESC-05: disbanded is terminal — no outgoing transitions.
 *
 * ESC-05 of pastoral-triada-disband: motivo must be from closed catalog.
 */
export function triadTransition(
  input: TriadaTransitionInput,
): TriadaTransitionResult {
  const { triada, accion, version, motivo } = input

  // ESC-03: stale version → 409
  if (version !== triada.version) {
    return {
      ok: false,
      error: pastoralError(
        'CONCURRENCY_CONFLICT',
        'version is stale',
        { expected: triada.version, received: version },
      ),
    }
  }

  const estadoActual = triada.estado

  // ESC-05: disbanded is terminal absolute — no transitions allowed
  if (TERMINAL_TRIADA_ESTADOS.has(estadoActual)) {
    return {
      ok: false,
      error: pastoralError('TERMINAL_STATE', 'cannot transition from terminal state', {
        estado: estadoActual,
      }),
    }
  }

  const estadoNuevo = acciónAEstado(accion, estadoActual)

  // Invalid action from current state
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
  if (!TRIADA_TRANSITIONS[estadoActual].has(estadoNuevo)) {
    return {
      ok: false,
      error: pastoralError('INVALID_STATE_TRANSITION', 'transition is not valid', {
        from: estadoActual,
        to: estadoNuevo,
        accion,
      }),
    }
  }

  // disband requires motivo from the closed catalog (ESC-05 of pastoral-triada-disband)
  if (estadoNuevo === 'disbanded') {
    if (!motivo) {
      return {
        ok: false,
        error: pastoralError('MISSING_MOTIVO', 'disband requires a motivo from the closed catalog'),
      }
    }
    if (!TRIADA_DISSOLUTION_REASONS.includes(motivo as TriadaDissolutionReason)) {
      return {
        ok: false,
        error: pastoralError(
          'INVALID_MOTIVO_FOR_TRANSITION',
          `motivo '${motivo}' is not in the closed dissolution catalog`,
          {
            allowedMotivos: [...TRIADA_DISSOLUTION_REASONS],
          },
        ),
      }
    }
  }

  const now = new Date().toISOString()

  // Build updated record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partial: any = {
    estado: estadoNuevo,
    version: triada.version + 1,
    updatedAt: now,
  }
  if (estadoNuevo === 'disbanded' && motivo) {
    partial.motivoDisolucion = motivo
  }

  const triadaNueva: PastoralTriada = {
    ...triada,
    ...partial,
  }

  return {
    ok: true,
    triadaNueva,
  }
}
