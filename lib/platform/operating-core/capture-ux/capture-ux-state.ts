/**
 * S20 — Capture-UX state machine.
 * Pure functions over the closed 6-state UX experience union.
 */
export {
  CAPTURE_UX_STATES,
  CAPTURE_UX_SHAPES,
} from './capture-ux-types'
export type { CaptureUXState, CaptureUXShape } from './capture-ux-types'

import type { CaptureUXState } from './capture-ux-types'

// ---------------------------------------------------------------------------
// Transition table
// ---------------------------------------------------------------------------

/**
 * Capture-UX transition table. Closed set; all 6 states participate.
 * Terminal states: `overridden` and `rejected` have no outbound transitions.
 */
export const CAPTURE_UX_TRANSITIONS: Readonly<Record<CaptureUXState, ReadonlySet<CaptureUXState>>> = {
  idle: new Set(['in_progress'] as const),
  in_progress: new Set(['awaiting_resolution', 'confirmed', 'overridden', 'rejected'] as const),
  awaiting_resolution: new Set(['in_progress', 'confirmed', 'overridden', 'rejected'] as const),
  confirmed: new Set(['overridden', 'rejected'] as const),
  overridden: new Set([] as const),
  rejected: new Set([] as const),
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Returns true if a transition from `from` to `to` is valid per the closed
 * Capture-UX state machine. Self-transitions are always invalid.
 */
export function canTransitionUX(from: CaptureUXState, to: CaptureUXState): boolean {
  if (from === to) return false
  return CAPTURE_UX_TRANSITIONS[from].has(to)
}

/**
 * Returns true if the state is terminal (no outbound transitions).
 * Terminal states: overridden, rejected.
 */
export function isTerminal(state: CaptureUXState): boolean {
  return state === 'overridden' || state === 'rejected'
}
