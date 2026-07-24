/**
 * W02 — DT-011 — Pastoral Triada state machine (PARTIAL).
 *
 * Full implementation in W03 (DT-017).
 * This file provides the type declarations and closed catalog
 * so downstream W02 consumers (repos, API routes) can import without errors.
 *
 * D13: 4 closed states — pending_confirmation, active, en_pausa, disbanded.
 * D14: 5 dissolution reasons — gdv_liderazgo_removed, servicio_retirado,
 *      cambio_de_temporada, pastoral_decision, otro.
 *
 * The `triadTransition` function with full logic is implemented in W03 DT-017.
 */
import { TERMINAL_TRIADA_ESTADOS, type TriadaEstado } from './types'

export { TERMINAL_TRIADA_ESTADOS }
export type { TriadaEstado }

/**
 * Placeholder transition function — full implementation in W03 DT-017.
 * Currently returns an error indicating the function is not yet implemented.
 */
export function triadTransition(): { ok: false; error: { code: string; message: string } } {
  return {
    ok: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'triadTransition is implemented in W03 DT-017',
    },
  }
}
