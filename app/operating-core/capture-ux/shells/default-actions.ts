/**
 * S20 — Shared default actions helper for all 5 STUB shells.
 * Maps CaptureUXState to the available actions an operator can take.
 * This is a pure function — no side effects, no JSX.
 * Note: shape does not affect available actions; only state determines them.
 */
import type { CaptureUXAction, CaptureUXState } from '@/lib/platform/operating-core/capture-ux/capture-ux-types'

export function defaultActionsForState(state: CaptureUXState): CaptureUXAction[] {
  switch (state) {
    case 'idle':
      return [{ type: 'start' }]
    case 'in_progress':
      return [{ type: 'pause' }, { type: 'confirm' }, { type: 'override' }, { type: 'reject' }]
    case 'awaiting_resolution':
      return [{ type: 'resume' }, { type: 'confirm' }, { type: 'override' }, { type: 'reject' }]
    case 'confirmed':
      return [{ type: 'override' }, { type: 'reject' }]
    case 'overridden':
    case 'rejected':
      return [] // terminal; no outbound actions
  }
}
