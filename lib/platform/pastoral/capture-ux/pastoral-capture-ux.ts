/**
 * W06 — D22 extension — Pastoral capture-UX shape.
 *
 * Byte-identity sibling: does NOT edit
 * lib/platform/operating-core/capture-ux/capture-ux-types.ts (protected file).
 *
 * Instead, this file re-exports the base capture UX constants and adds the
 * pastoral_one_on_one shape, following the same pattern as W01-DT-002 where
 * kinds.ts was extended via a sibling module rather than editing the original.
 *
 * D22: Reuse CAPTURE_UX_STATES with new shape = 'pastoral_one_on_one'.
 * The 6-element UX experience state union remains the same;
 * only the shape domain is extended.
 *
 * W13 (DT-078) will use this in app/(pastoral)/lider/captura/page.tsx
 * for the pastoral mobile capture flow.
 */

// Re-export base constants (read-only — do not reimplement)
export {
  CAPTURE_UX_STATES,
  CAPTURE_UX_SHAPES,
} from '@/lib/platform/operating-core/capture-ux/capture-ux-types'

export type {
  CaptureUXState,
  CaptureUXShape,
  CaptureUXInput,
  CaptureUXActionType,
  CaptureUXAction,
  CaptureUXOutput,
} from '@/lib/platform/operating-core/capture-ux/capture-ux-types'

// ─── Pastoral capture-UX domain extension ────────────────────────────────────

/**
 * Pastoral 1:1 capture domain.
 * Added to CAPTURE_UX_SHAPES as the 4th shape.
 *
 * Used in app/(pastoral)/lider/captura/page.tsx (W13 DT-078).
 */
export const PASTORAL_CAPTURE_UX_SHAPE = 'pastoral_one_on_one' as const

/**
 * All capture UX shapes including pastoral_one_on_one.
 * Use this instead of CAPTURE_UX_SHAPES when pastoral capture is in scope.
 */
export const CAPTURE_UX_SHAPES_WITH_PASTORAL = [
  'visitor_resolution',
  'registration',
  'attendance',
  'pastoral_one_on_one',
] as const

export type CaptureUXShapeWithPastoral = (typeof CAPTURE_UX_SHAPES_WITH_PASTORAL)[number]
