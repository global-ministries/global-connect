/**
 * Operating Core Capture UX state machine.
 * Domain-neutral closed state set for visitor/resolution capture flows.
 */

export const CAPTURE_STATES = [
  'idle',
  'in_progress',
  'awaiting_resolution',
  'resolved',
  'ambiguous',
  'no_match',
  'error',
] as const

export type CaptureState = (typeof CAPTURE_STATES)[number]

/**
 * Explicit capture UX transition table.
 * Transitions:
 * - idle → in_progress
 * - in_progress → resolved | ambiguous | no_match | error
 * - awaiting_resolution → resolved | ambiguous | error
 * - ambiguous → in_progress | resolved | error
 * - no_match → in_progress | resolved
 * - resolved → idle | in_progress (new capture)
 * - error → idle | in_progress
 */
export const CAPTURE_TRANSITIONS: Readonly<
  Record<CaptureState, ReadonlySet<CaptureState>>
> = {
  idle: new Set(['in_progress'] as const),
  in_progress: new Set(['resolved', 'ambiguous', 'no_match', 'error'] as const),
  awaiting_resolution: new Set(['resolved', 'ambiguous', 'error'] as const),
  resolved: new Set(['idle', 'in_progress'] as const),
  ambiguous: new Set(['in_progress', 'resolved', 'error'] as const),
  no_match: new Set(['in_progress', 'resolved'] as const),
  error: new Set(['idle', 'in_progress'] as const),
}

/**
 * Returns true if a transition from `from` to `to` is valid per the closed capture state machine.
 * Self-transitions are always invalid.
 */
export function canTransitionCapture(
  from: CaptureState,
  to: CaptureState,
): boolean {
  if (from === to) return false
  return CAPTURE_TRANSITIONS[from].has(to)
}
