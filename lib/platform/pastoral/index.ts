/**
 * W01 — DT-001 — Pastoral module public barrel (D1).
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
