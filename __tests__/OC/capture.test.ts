/**
 * S02 TDD RED — capture-states module
 * Verifies the Capture UX state machine and explicit transition table.
 */
import {
  CAPTURE_STATES,
  canTransitionCapture,
  CAPTURE_TRANSITIONS,
  type CaptureState,
} from '@/lib/platform/operating-core/capture-states'

describe('CAPTURE_STATES', () => {
  it('should contain exactly 7 states', () => {
    expect(CAPTURE_STATES).toHaveLength(7)
  })

  it('should contain all canonical capture states', () => {
    const canonical = [
      'idle', 'in_progress', 'awaiting_resolution', 'resolved',
      'ambiguous', 'no_match', 'error',
    ] as const
    for (const s of canonical) {
      expect(CAPTURE_STATES).toContain(s)
    }
  })

  it('should have no duplicates', () => {
    const unique = new Set(CAPTURE_STATES)
    expect(unique.size).toBe(CAPTURE_STATES.length)
  })
})

describe('canTransitionCapture(from, to)', () => {
  // idle → in_progress
  it('allows idle → in_progress', () => {
    expect(canTransitionCapture('idle', 'in_progress')).toBe(true)
  })
  it('rejects idle → any other state', () => {
    const others = ['awaiting_resolution', 'resolved', 'ambiguous', 'no_match', 'error'] as const
    for (const to of others) {
      expect(canTransitionCapture('idle', to)).toBe(false)
    }
  })

  // in_progress → resolved | ambiguous | no_match | error
  it('allows in_progress → resolved', () => {
    expect(canTransitionCapture('in_progress', 'resolved')).toBe(true)
  })
  it('allows in_progress → ambiguous', () => {
    expect(canTransitionCapture('in_progress', 'ambiguous')).toBe(true)
  })
  it('allows in_progress → no_match', () => {
    expect(canTransitionCapture('in_progress', 'no_match')).toBe(true)
  })
  it('allows in_progress → error', () => {
    expect(canTransitionCapture('in_progress', 'error')).toBe(true)
  })
  it('rejects in_progress → idle', () => {
    expect(canTransitionCapture('in_progress', 'idle')).toBe(false)
  })
  it('rejects in_progress → awaiting_resolution', () => {
    expect(canTransitionCapture('in_progress', 'awaiting_resolution')).toBe(false)
  })

  // awaiting_resolution → resolved | ambiguous | error
  it('allows awaiting_resolution → resolved', () => {
    expect(canTransitionCapture('awaiting_resolution', 'resolved')).toBe(true)
  })
  it('allows awaiting_resolution → ambiguous', () => {
    expect(canTransitionCapture('awaiting_resolution', 'ambiguous')).toBe(true)
  })
  it('allows awaiting_resolution → error', () => {
    expect(canTransitionCapture('awaiting_resolution', 'error')).toBe(true)
  })
  it('rejects awaiting_resolution → no_match', () => {
    expect(canTransitionCapture('awaiting_resolution', 'no_match')).toBe(false)
  })
  it('rejects awaiting_resolution → idle', () => {
    expect(canTransitionCapture('awaiting_resolution', 'idle')).toBe(false)
  })

  // ambiguous → in_progress (operator retry) | resolved (operator) | error
  it('allows ambiguous → in_progress', () => {
    expect(canTransitionCapture('ambiguous', 'in_progress')).toBe(true)
  })
  it('allows ambiguous → resolved', () => {
    expect(canTransitionCapture('ambiguous', 'resolved')).toBe(true)
  })
  it('allows ambiguous → error', () => {
    expect(canTransitionCapture('ambiguous', 'error')).toBe(true)
  })
  it('rejects ambiguous → no_match', () => {
    expect(canTransitionCapture('ambiguous', 'no_match')).toBe(false)
  })

  // no_match → in_progress (retry) | resolved (operator override)
  it('allows no_match → in_progress', () => {
    expect(canTransitionCapture('no_match', 'in_progress')).toBe(true)
  })
  it('allows no_match → resolved', () => {
    expect(canTransitionCapture('no_match', 'resolved')).toBe(true)
  })
  it('rejects no_match → ambiguous', () => {
    expect(canTransitionCapture('no_match', 'ambiguous')).toBe(false)
  })

  // resolved → idle (terminal) | in_progress (new capture)
  it('allows resolved → idle', () => {
    expect(canTransitionCapture('resolved', 'idle')).toBe(true)
  })
  it('allows resolved → in_progress', () => {
    expect(canTransitionCapture('resolved', 'in_progress')).toBe(true)
  })
  it('rejects resolved → awaiting_resolution', () => {
    expect(canTransitionCapture('resolved', 'awaiting_resolution')).toBe(false)
  })

  // error → idle (reset) | in_progress (retry)
  it('allows error → idle', () => {
    expect(canTransitionCapture('error', 'idle')).toBe(true)
  })
  it('allows error → in_progress', () => {
    expect(canTransitionCapture('error', 'in_progress')).toBe(true)
  })
  it('rejects error → awaiting_resolution', () => {
    expect(canTransitionCapture('error', 'awaiting_resolution')).toBe(false)
  })

  // Self-transitions always invalid
  it('rejects all self-transitions', () => {
    for (const from of CAPTURE_STATES) {
      expect(canTransitionCapture(from, from)).toBe(false)
    }
  })
})

describe('CAPTURE_TRANSITIONS', () => {
  it('maps idle to exactly 1 target', () => {
    expect(CAPTURE_TRANSITIONS['idle'].size).toBe(1)
  })

  it('maps resolved and error to 2 targets each (idle + in_progress)', () => {
    expect(CAPTURE_TRANSITIONS['resolved'].size).toBe(2)
    expect(CAPTURE_TRANSITIONS['error'].size).toBe(2)
  })

  it('maps terminal-ish states ambiguous and no_match correctly', () => {
    expect(CAPTURE_TRANSITIONS['ambiguous'].size).toBe(3) // in_progress, resolved, error
    expect(CAPTURE_TRANSITIONS['no_match'].size).toBe(2)  // in_progress, resolved
  })
})

describe('CaptureState type', () => {
  it('should accept every canonical state', () => {
    const acceptAll = (_: CaptureState) => { void _ }
    acceptAll('idle')
    acceptAll('in_progress')
    acceptAll('awaiting_resolution')
    acceptAll('resolved')
    acceptAll('ambiguous')
    acceptAll('no_match')
    acceptAll('error')
  })

  it('should reject invalid state names', () => {
    const acceptAll = (_: CaptureState) => { void _ }
    // @ts-expect-error — not a valid CaptureState
    acceptAll('loading')
    // @ts-expect-error — not a valid CaptureState
    acceptAll('confirmed')
  })
})
