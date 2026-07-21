/**
 * S20 — Capture-UX domain-neutral types.
 * These contracts are shared across GDV, Niños, Estudiantes, Talleres, DPS.
 * Hardware (QR, printer, tablet) is optional.
 */

// ---------------------------------------------------------------------------
// State unions
// ---------------------------------------------------------------------------

/**
 * 6-element UX experience state union.
 * Different from S02's CAPTURE_STATES (7-element capture process states).
 * - idle: initial state, no capture in progress
 * - in_progress: user is actively capturing
 * - awaiting_resolution: capture paused waiting for external resolution
 * - confirmed: operator confirmed the capture
 * - overridden: operator overrode the default
 * - rejected: operator rejected the capture
 */
export const CAPTURE_UX_STATES = [
  'idle',
  'in_progress',
  'awaiting_resolution',
  'confirmed',
  'overridden',
  'rejected',
] as const

export type CaptureUXState = (typeof CAPTURE_UX_STATES)[number]

// ---------------------------------------------------------------------------
// Shape union
// ---------------------------------------------------------------------------

/**
 * 3-element capture domain shape union.
 * - visitor_resolution: GDV leader looking up a visitor
 * - registration: workshop/event registration
 * - attendance: check-in / check-out / no-show
 */
export const CAPTURE_UX_SHAPES = [
  'visitor_resolution',
  'registration',
  'attendance',
] as const

export type CaptureUXShape = (typeof CAPTURE_UX_SHAPES)[number]

// ---------------------------------------------------------------------------
// Input / Output contracts
// ---------------------------------------------------------------------------

export interface CaptureUXInput {
  shape: CaptureUXShape
  context: {
    eventId?: string
    personaId?: string
    groupId?: string
    operatorPersonaId: string
    nowIso: string
    // extensible per shape
    [key: string]: unknown
  }
  state: CaptureUXState
}

export type CaptureUXActionType =
  | 'start'           // from idle → in_progress
  | 'pause'           // from in_progress → awaiting_resolution
  | 'resume'          // from awaiting_resolution → in_progress
  | 'confirm'         // from in_progress|awaiting_resolution → confirmed
  | 'override'        // from in_progress|awaiting_resolution|confirmed → overridden
  | 'reject'          // from in_progress|awaiting_resolution|confirmed → rejected
  | 'reset'           // from any → idle

export interface CaptureUXAction {
  type: CaptureUXActionType
  payload?: Record<string, unknown>
}

export interface CaptureUXOutput {
  state: CaptureUXState
  shape: CaptureUXShape
  actions: readonly CaptureUXAction[]
  feedback?: string
}
