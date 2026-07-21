/**
 * S20 TDD RED — capture-ux state machine
 * Verifies the 6-state CaptureUX state machine and explicit transition table.
 * NOTE: This is DIFFERENT from S02's CAPTURE_STATES (7-element capture process).
 * S20 CAPTURE_UX_STATES is a 6-element UX experience state machine.
 */
import {
  CAPTURE_UX_STATES,
  CAPTURE_UX_SHAPES,
  CAPTURE_UX_TRANSITIONS,
  canTransitionUX,
  isTerminal,
  type CaptureUXState,
  type CaptureUXShape,
} from '@/lib/platform/operating-core/capture-ux/capture-ux-state'

// ---------------------------------------------------------------------------
// CAPTURE_UX_STATES — must be exactly 6 values
// ---------------------------------------------------------------------------

describe('CAPTURE_UX_STATES', () => {
  it('should contain exactly 6 states', () => {
    expect(CAPTURE_UX_STATES).toHaveLength(6)
  })

  it('should contain all canonical UX states', () => {
    const canonical = ['idle', 'in_progress', 'awaiting_resolution', 'confirmed', 'overridden', 'rejected'] as const
    for (const s of canonical) {
      expect(CAPTURE_UX_STATES).toContain(s)
    }
  })

  it('should NOT contain duplicate names', () => {
    const unique = new Set(CAPTURE_UX_STATES)
    expect(unique.size).toBe(CAPTURE_UX_STATES.length)
  })
})

// ---------------------------------------------------------------------------
// CAPTURE_UX_SHAPES — must be exactly 3 values
// ---------------------------------------------------------------------------

describe('CAPTURE_UX_SHAPES', () => {
  it('should contain exactly 3 shapes', () => {
    expect(CAPTURE_UX_SHAPES).toHaveLength(3)
  })

  it('should contain visitor_resolution, registration, attendance', () => {
    expect(CAPTURE_UX_SHAPES).toContain('visitor_resolution')
    expect(CAPTURE_UX_SHAPES).toContain('registration')
    expect(CAPTURE_UX_SHAPES).toContain('attendance')
  })

  it('should NOT contain duplicate names', () => {
    const unique = new Set(CAPTURE_UX_SHAPES)
    expect(unique.size).toBe(CAPTURE_UX_SHAPES.length)
  })
})

// ---------------------------------------------------------------------------
// canTransitionUX(from, to)
// ---------------------------------------------------------------------------

describe('canTransitionUX(from, to)', () => {
  // idle → in_progress
  it('allows idle → in_progress', () => {
    expect(canTransitionUX('idle', 'in_progress')).toBe(true)
  })

  it('rejects idle → confirmed (skip)', () => {
    expect(canTransitionUX('idle', 'confirmed')).toBe(false)
  })

  it('rejects idle → awaiting_resolution (skip)', () => {
    expect(canTransitionUX('idle', 'awaiting_resolution')).toBe(false)
  })

  // in_progress → awaiting_resolution | confirmed | overridden | rejected
  it('allows in_progress → awaiting_resolution', () => {
    expect(canTransitionUX('in_progress', 'awaiting_resolution')).toBe(true)
  })

  it('allows in_progress → confirmed', () => {
    expect(canTransitionUX('in_progress', 'confirmed')).toBe(true)
  })

  it('allows in_progress → overridden', () => {
    expect(canTransitionUX('in_progress', 'overridden')).toBe(true)
  })

  it('allows in_progress → rejected', () => {
    expect(canTransitionUX('in_progress', 'rejected')).toBe(true)
  })

  it('rejects in_progress → idle (backwards)', () => {
    expect(canTransitionUX('in_progress', 'idle')).toBe(false)
  })

  // awaiting_resolution → in_progress (resume) | confirmed | overridden | rejected
  it('allows awaiting_resolution → in_progress (resume)', () => {
    expect(canTransitionUX('awaiting_resolution', 'in_progress')).toBe(true)
  })

  it('allows awaiting_resolution → confirmed', () => {
    expect(canTransitionUX('awaiting_resolution', 'confirmed')).toBe(true)
  })

  it('allows awaiting_resolution → overridden', () => {
    expect(canTransitionUX('awaiting_resolution', 'overridden')).toBe(true)
  })

  it('allows awaiting_resolution → rejected', () => {
    expect(canTransitionUX('awaiting_resolution', 'rejected')).toBe(true)
  })

  it('rejects awaiting_resolution → idle (skip)', () => {
    expect(canTransitionUX('awaiting_resolution', 'idle')).toBe(false)
  })

  // confirmed → overridden | rejected (operator can still override/reject)
  it('allows confirmed → overridden', () => {
    expect(canTransitionUX('confirmed', 'overridden')).toBe(true)
  })

  it('allows confirmed → rejected', () => {
    expect(canTransitionUX('confirmed', 'rejected')).toBe(true)
  })

  it('rejects confirmed → idle (backwards)', () => {
    expect(canTransitionUX('confirmed', 'idle')).toBe(false)
  })

  it('rejects confirmed → in_progress (backwards)', () => {
    expect(canTransitionUX('confirmed', 'in_progress')).toBe(false)
  })

  // Terminal states: overridden, rejected → nothing
  it('rejects overridden → any state (terminal)', () => {
    for (const to of CAPTURE_UX_STATES) {
      if (to !== 'overridden') {
        expect(canTransitionUX('overridden', to)).toBe(false)
      }
    }
  })

  it('rejects rejected → any state (terminal)', () => {
    for (const to of CAPTURE_UX_STATES) {
      if (to !== 'rejected') {
        expect(canTransitionUX('rejected', to)).toBe(false)
      }
    }
  })

  // Self-transitions are always invalid
  it('rejects all self-transitions', () => {
    for (const from of CAPTURE_UX_STATES) {
      expect(canTransitionUX(from, from)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// CAPTURE_UX_TRANSITIONS table
// ---------------------------------------------------------------------------

describe('CAPTURE_UX_TRANSITIONS', () => {
  it('maps idle to exactly 1 target', () => {
    expect(CAPTURE_UX_TRANSITIONS['idle'].size).toBe(1)
  })

  it('maps idle to in_progress', () => {
    expect(CAPTURE_UX_TRANSITIONS['idle'].has('in_progress')).toBe(true)
  })

  it('maps in_progress to exactly 4 targets', () => {
    expect(CAPTURE_UX_TRANSITIONS['in_progress'].size).toBe(4)
  })

  it('maps awaiting_resolution to exactly 4 targets (can resume)', () => {
    expect(CAPTURE_UX_TRANSITIONS['awaiting_resolution'].size).toBe(4)
  })

  it('maps confirmed to exactly 2 targets', () => {
    expect(CAPTURE_UX_TRANSITIONS['confirmed'].size).toBe(2)
  })

  it('maps terminal states to empty sets', () => {
    expect(CAPTURE_UX_TRANSITIONS['overridden'].size).toBe(0)
    expect(CAPTURE_UX_TRANSITIONS['rejected'].size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// isTerminal
// ---------------------------------------------------------------------------

describe('isTerminal(state)', () => {
  it('returns true for overridden (terminal)', () => {
    expect(isTerminal('overridden')).toBe(true)
  })

  it('returns true for rejected (terminal)', () => {
    expect(isTerminal('rejected')).toBe(true)
  })

  it('returns false for idle', () => {
    expect(isTerminal('idle')).toBe(false)
  })

  it('returns false for in_progress', () => {
    expect(isTerminal('in_progress')).toBe(false)
  })

  it('returns false for awaiting_resolution', () => {
    expect(isTerminal('awaiting_resolution')).toBe(false)
  })

  it('returns false for confirmed', () => {
    expect(isTerminal('confirmed')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CaptureUXState type
// ---------------------------------------------------------------------------

describe('CaptureUXState type', () => {
  it('should accept every canonical state', () => {
    const acceptAll = (_: CaptureUXState) => { void _ }
    acceptAll('idle')
    acceptAll('in_progress')
    acceptAll('awaiting_resolution')
    acceptAll('confirmed')
    acceptAll('overridden')
    acceptAll('rejected')
  })

  it('should reject invalid state names', () => {
    const acceptAll = (_: CaptureUXState) => { void _ }
    // @ts-expect-error — not a valid CaptureUXState
    acceptAll('pending')
    // @ts-expect-error — not a valid CaptureUXState
    acceptAll('resolved')
  })
})

// ---------------------------------------------------------------------------
// CaptureUXShape type
// ---------------------------------------------------------------------------

describe('CaptureUXShape type', () => {
  it('should accept every canonical shape', () => {
    const acceptAll = (_: CaptureUXShape) => { void _ }
    acceptAll('visitor_resolution')
    acceptAll('registration')
    acceptAll('attendance')
  })

  it('should reject invalid shape names', () => {
    const acceptAll = (_: CaptureUXShape) => { void _ }
    // @ts-expect-error — not a valid CaptureUXShape
    acceptAll('checkin')
    // @ts-expect-error — not a valid CaptureUXShape
    acceptAll('visitor')
  })
})
