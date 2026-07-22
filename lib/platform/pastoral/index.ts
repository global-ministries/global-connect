/**
 * W01 — DT-001 — Pastoral module public barrel (D1).
 * W02 — DT-013 — Types exports added.
 * Re-exports all public pastoral types and functions.
 */

// Errors
export {
  pastoralError,
  isInvalidStateTransition,
  isMissingMotivo,
  isTerminalState,
  isInvalidMotivoForTransition,
  isConcurrencyConflict,
  isSelfTransition,
  isPastoralNotFound,
  isPastoralAccessDenied,
  TERMINAL_ONE_ON_ONE_STATES,
  TERMINAL_TRIADA_STATES,
} from './errors'
export type { PastoralError, PastoralErrorCode } from './errors'

// Participation kinds
export { PASTORAL_PARTICIPATION_KINDS } from './participation-kinds'
export type { PastoralParticipationKind } from './participation-kinds'

// Flags
export { getPastoralFlags, isPastoralEnabled, getPastoralStage, getPastoralStageGate } from './flags'
export type { PastoralFlags, PastoralRolloutStage } from './flags'

// Capabilities
export { resolvePastoralCapability } from './capabilities'
export type { PastoralSessionContext } from './capabilities'

// W02 — Types (1:1 + triada)
export {
  ONE_ON_ONE_STATES,
  TERMINAL_ONE_ON_ONE_ESTADOS,
  TRIADA_STATES,
  TERMINAL_TRIADA_ESTADOS,
  TRIADA_DISSOLUTION_REASONS,
} from './types'
export type {
  OneOnOneEstado,
  OneOnOneAccion,
  PastoralOneOnOne,
  PastoralOneOnOneParticipante,
  PastoralOneOnOneNota,
  OneOnOneTransitionInput,
  OneOnOneTransitionResult,
  TriadaEstado,
  TriadaDissolutionReason,
  PastoralTriada,
  PastoralTriadaMiembro,
  PastoralTriadaEvento,
} from './types'

// W02 — 1:1 state machine
export {
  ONE_ON_ONE_TRANSITIONS,
  transition as oneOnOneTransition,
} from './state'

// W02 — Triada state (placeholder — full in W03)
export { triadTransition } from './triad-state'

// W02 — 1:1 validators
export { validarResumen } from './one-on-one/validators'
export type { ValidarResumenResult, ValidarResumenError, ValidarResumenResultType } from './one-on-one/validators'
