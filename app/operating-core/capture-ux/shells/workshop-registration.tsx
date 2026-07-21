/**
 * S20 STUB — workshop registration shell.
 * Phase 3 does NOT implement the domain UI. This is a placeholder contract.
 * Each shell is a function (NOT a React component) that returns CaptureUXOutput.
 */
import type { CaptureUXInput, CaptureUXOutput } from '@/lib/platform/operating-core/capture-ux/capture-ux-types'
import { defaultActionsForState } from './default-actions'

/**
 * STUB: Phase 3 does NOT implement the domain UI.
 * This is a placeholder contract that identifies itself via [STUB: ...] feedback.
 */
export function WorkshopRegistrationShell(props: CaptureUXInput): CaptureUXOutput {
  return {
    state: props.state,
    shape: 'registration',
    actions: defaultActionsForState(props.state),
    feedback: `[STUB: workshop registration shell, state=${props.state}]`,
  }
}
