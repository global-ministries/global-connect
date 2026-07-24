/**
 * W02 — DT-013 — Pastoral 1:1 and Triada TypeScript types.
 * Includes PastoralOneOnOne, PastoralOneOnOneParticipante, PastoralOneOnOneNota
 * with version for optimistic concurrency and optional motivo_cancelacion/resumen.
 * Follows the DreamTeamServicio pattern (F2) for version + terminal states.
 */

// ── 1:1 States and transitions ────────────────────────────────────────

export const ONE_ON_ONE_STATES = [
  'pending_participant',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'no_realizado',
] as const
export type OneOnOneEstado = (typeof ONE_ON_ONE_STATES)[number]

export const TERMINAL_ONE_ON_ONE_ESTADOS: ReadonlySet<OneOnOneEstado> = new Set<OneOnOneEstado>([
  'completed',
  'cancelled',
  'no_realizado',
])

// ── 1:1 Types ─────────────────────────────────────────────────────────

export interface PastoralOneOnOne {
  readonly id: string
  readonly mentorOficialPersonaId: string
  readonly autorPersonaId: string
  readonly estado: OneOnOneEstado
  readonly scheduledAt: string | null
  readonly completedAt: string | null
  readonly motivoCancelacion: string | null
  readonly resumen: string | null
  readonly motivoNoRealizado: string | null
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PastoralOneOnOneParticipante {
  readonly id: string
  readonly oneOnOneId: string
  readonly personaId: string
  readonly createdAt: string
}

export interface PastoralOneOnOneNota {
  readonly id: string
  readonly oneOnOneId: string
  readonly autorPersonaId: string
  readonly contenido: string
  readonly createdAt: string
}

// ── 1:1 State transition input / output ──────────────────────────────

export type OneOnOneAccion =
  | 'schedule'
  | 'start'
  | 'complete'
  | 'cancel'
  | 'mark_no_realizado'
  | 'add_nota'

export interface OneOnOneTransitionInput {
  readonly oneOnOne: PastoralOneOnOne
  readonly accion: OneOnOneAccion
  readonly version: number
  readonly scheduledAt?: string | null
  readonly resumen?: string | null
  readonly motivoCancelacion?: string | null
  readonly motivoNoRealizado?: string | null
}

export type OneOnOneTransitionResult =
  | { readonly ok: true; readonly oneOnOneNuevo: PastoralOneOnOne }
  | { readonly ok: false; readonly error: import('./errors').PastoralError }

// ── Triada types (placeholder — W03 full implementation) ───────────────

export const TRIADA_STATES = [
  'pending_confirmation',
  'active',
  'en_pausa',
  'disbanded',
] as const
export type TriadaEstado = (typeof TRIADA_STATES)[number]

export const TERMINAL_TRIADA_ESTADOS: ReadonlySet<TriadaEstado> = new Set<TriadaEstado>([
  'disbanded',
])

export const TRIADA_DISSOLUTION_REASONS = [
  'gdv_liderazgo_removed',
  'servicio_retirado',
  'cambio_de_temporada',
  'pastoral_decision',
  'otro',
] as const
export type TriadaDissolutionReason = (typeof TRIADA_DISSOLUTION_REASONS)[number]

export interface PastoralTriada {
  readonly id: string
  readonly mentorOficialPersonaId: string
  readonly autorPersonaId: string
  readonly estado: TriadaEstado
  readonly contexto: 'nuevo_paso' | 'simultaneidad' | 'inicial' | 'reformada'
  readonly motivoDisolucion: TriadaDissolutionReason | null
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PastoralTriadaMiembro {
  readonly id: string
  readonly triadaId: string
  readonly personaId: string
  readonly rolEnTriada: string
  readonly createdAt: string
}

export interface PastoralTriadaEvento {
  readonly id: string
  readonly triadaId: string
  readonly tipoEvento: string
  readonly actorPersonaId: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly createdAt: string
}

// ── Triada State transition types (DT-017) ────────────────────────────────

export type TriadaAccion = 'confirm' | 'disband' | 'pause' | 'resume'

export interface TriadaTransitionInput {
  readonly triada: PastoralTriada
  readonly accion: TriadaAccion
  readonly version: number
  readonly motivo?: TriadaDissolutionReason
}

export type TriadaTransitionResult =
  | { readonly ok: true; readonly triadaNueva: PastoralTriada }
  | { readonly ok: false; readonly error: import('./errors').PastoralError }
