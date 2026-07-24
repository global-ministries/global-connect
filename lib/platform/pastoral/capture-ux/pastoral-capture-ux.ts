/**
 * W13 — DT-078 sibling CAPTURE_UX extension for pastoral_one_on_one shape.
 *
 * Extends the domain-neutral CAPTURE_UX_STATES from operating-core with
 * a pastoral-specific shape: pastoral_one_on_one.
 *
 * Byte-identity: does NOT edit lib/platform/operating-core/capture-ux/capture-ux-types.ts
 * Byte-identity: does NOT edit lib/platform/operating-core/capture-ux/capture-ux-state.ts
 *
 * Reuses CAPTURE_UX_STATES, CaptureUXState, CAPTURE_UX_TRANSITIONS, canTransitionUX, isTerminal
 * from the protected parent modules via public exports.
 *
 * Shape pastoral_one_on_one:
 * - Used in: MentorPanel (DT-078) for quick-capture post-1:1
 * - Context fields: oneOnOneId, mentorPersonaId, assistedPersonaId, stepId?
 */

import {
  CAPTURE_UX_STATES,
  CAPTURE_UX_TRANSITIONS,
  canTransitionUX,
  isTerminal,
} from '@/lib/platform/operating-core/capture-ux/capture-ux-state'
import type { CaptureUXState } from '@/lib/platform/operating-core/capture-ux/capture-ux-state'

export { CAPTURE_UX_STATES, canTransitionUX, isTerminal } from '@/lib/platform/operating-core/capture-ux/capture-ux-state'
export type { CaptureUXState } from '@/lib/platform/operating-core/capture-ux/capture-ux-state'

// ─── Pastoral shape ──────────────────────────────────────────────────────────

/**
 * Pastoral-specific capture shape for 1:1 post-session quick capture.
 */
export const PASTORAL_CAPTURE_UX_SHAPE = 'pastoral_one_on_one' as const
export type PastoralCaptureUXShape = typeof PASTORAL_CAPTURE_UX_SHAPE

// ─── Pastoral capture context ─────────────────────────────────────────────────

/**
 * Context for pastoral_one_on_one capture flow.
 * Embedded in CaptureUXInput.context when shape = pastoral_one_on_one.
 */
export interface PastoralCaptureContext {
  readonly oneOnOneId: string
  readonly mentorPersonaId: string
  readonly assistedPersonaId: string
  /** Optional step being validated during this capture */
  readonly stepId?: string
  /** ISO timestamp of the 1:1 session */
  readonly sessionAtIso?: string
  readonly [key: string]: unknown
}

// ─── Pastoral capture output ───────────────────────────────────────────────────

/**
 * Pastoral-specific capture output with shape = pastoral_one_on_one.
 */
export interface PastoralCaptureOutput {
  readonly state: CaptureUXState
  readonly shape: PastoralCaptureUXShape
  readonly actions: readonly string[]
  readonly feedback?: string
  readonly capturedAtIso: string
}

// ─── Pastoral capture action types ─────────────────────────────────────────────

/**
 * Pastoral capture-specific actions (extends base CaptureUXActionType).
 * Added: 'validate_step' — confirms a spiritual step was taken.
 */
export type PastoralCaptureActionType =
  | CaptureUXState
  | 'validate_step'
  | 'add_note'
  | 'mark_crisis'

// ─── Pure functions ──────────────────────────────────────────────────────────

/**
 * Returns the pastoral capture context from a generic CaptureUXInput,
 * validating that shape = pastoral_one_on_one.
 */
export function extractPastoralCaptureContext(
  input: { shape: string; context: Record<string, unknown> }
): PastoralCaptureContext | null {
  if (input.shape !== PASTORAL_CAPTURE_UX_SHAPE) return null
  const ctx = input.context
  if (typeof ctx.oneOnOneId !== 'string' || !ctx.oneOnOneId) return null
  if (typeof ctx.mentorPersonaId !== 'string' || !ctx.mentorPersonaId) return null
  if (typeof ctx.assistedPersonaId !== 'string' || !ctx.assistedPersonaId) return null
  return {
    oneOnOneId: ctx.oneOnOneId as string,
    mentorPersonaId: ctx.mentorPersonaId as string,
    assistedPersonaId: ctx.assistedPersonaId as string,
    stepId: typeof ctx.stepId === 'string' ? ctx.stepId : undefined,
    sessionAtIso: typeof ctx.sessionAtIso === 'string' ? ctx.sessionAtIso : undefined,
  }
}

/**
 * Builds a PastoralCaptureOutput from a state and optional feedback.
 */
export function buildPastoralCaptureOutput(
  state: CaptureUXState,
  actions: readonly string[],
  feedback?: string
): PastoralCaptureOutput {
  return {
    state,
    shape: PASTORAL_CAPTURE_UX_SHAPE,
    actions,
    feedback,
    capturedAtIso: new Date().toISOString(),
  }
}
