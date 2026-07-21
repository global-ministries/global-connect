/**
 * S20 STUB — GDV leader list shell.
 * Phase 3 does NOT implement the domain UI. This is a placeholder contract.
 * Each shell is a function (NOT a React component) that returns CaptureUXOutput.
 */
import type { CaptureUXInput, CaptureUXOutput } from '@/lib/platform/operating-core/capture-ux/capture-ux-types'
import { defaultActionsForState } from './default-actions'

/**
 * STUB: Phase 3 does NOT implement the domain UI.
 * This is a placeholder contract that identifies itself via [STUB: ...] feedback.
 */
export function GdvLeaderListShell(props: CaptureUXInput): CaptureUXOutput {
  return {
    state: props.state,
    shape: 'visitor_resolution',
    actions: defaultActionsForState(props.state),
    feedback: `[STUB: GDV leader list shell, state=${props.state}]`,
  }
}
