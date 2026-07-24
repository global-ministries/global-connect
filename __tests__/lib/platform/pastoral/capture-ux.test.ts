/**
 * W13 — Tests for pastoral-capture-ux.ts pure functions.
 */

import {
  PASTORAL_CAPTURE_UX_SHAPE,
  PastoralCaptureContext,
  extractPastoralCaptureContext,
  buildPastoralCaptureOutput,
  canTransitionUX,
  isTerminal,
} from '@/lib/platform/pastoral/capture-ux/pastoral-capture-ux'

// ─── CAPTURE_UX shape ─────────────────────────────────────────────────────────

describe('PASTORAL_CAPTURE_UX_SHAPE', () => {
  it('should equal pastoral_one_on_one', () => {
    expect(PASTORAL_CAPTURE_UX_SHAPE).toBe('pastoral_one_on_one')
  })
})

// ─── extractPastoralCaptureContext ────────────────────────────────────────────

describe('extractPastoralCaptureContext', () => {
  it('returns null when shape is not pastoral_one_on_one', () => {
    const input = { shape: 'visitor_resolution', context: { oneOnOneId: '123', mentorPersonaId: '456', assistedPersonaId: '789' } }
    expect(extractPastoralCaptureContext(input)).toBeNull()
  })

  it('returns null when oneOnOneId is missing', () => {
    const input = { shape: 'pastoral_one_on_one', context: { mentorPersonaId: '456', assistedPersonaId: '789' } }
    expect(extractPastoralCaptureContext(input)).toBeNull()
  })

  it('returns null when mentorPersonaId is missing', () => {
    const input = { shape: 'pastoral_one_on_one', context: { oneOnOneId: '123', assistedPersonaId: '789' } }
    expect(extractPastoralCaptureContext(input)).toBeNull()
  })

  it('returns null when assistedPersonaId is missing', () => {
    const input = { shape: 'pastoral_one_on_one', context: { oneOnOneId: '123', mentorPersonaId: '456' } }
    expect(extractPastoralCaptureContext(input)).toBeNull()
  })

  it('returns context with all required fields', () => {
    const input = {
      shape: 'pastoral_one_on_one',
      context: { oneOnOneId: '123', mentorPersonaId: '456', assistedPersonaId: '789', stepId: 'step1' },
    }
    const result = extractPastoralCaptureContext(input)
    expect(result).not.toBeNull()
    expect(result!.oneOnOneId).toBe('123')
    expect(result!.mentorPersonaId).toBe('456')
    expect(result!.assistedPersonaId).toBe('789')
    expect(result!.stepId).toBe('step1')
  })

  it('returns context with optional sessionAtIso', () => {
    const input = {
      shape: 'pastoral_one_on_one',
      context: { oneOnOneId: '123', mentorPersonaId: '456', assistedPersonaId: '789', sessionAtIso: '2025-01-01T10:00:00Z' },
    }
    const result = extractPastoralCaptureContext(input)
    expect(result!.sessionAtIso).toBe('2025-01-01T10:00:00Z')
  })

  it('omits stepId when not provided', () => {
    const input = {
      shape: 'pastoral_one_on_one',
      context: { oneOnOneId: '123', mentorPersonaId: '456', assistedPersonaId: '789' },
    }
    const result = extractPastoralCaptureContext(input)
    expect(result!.stepId).toBeUndefined()
  })
})

// ─── buildPastoralCaptureOutput ───────────────────────────────────────────────

describe('buildPastoralCaptureOutput', () => {
  it('builds output with confirmed state', () => {
    const output = buildPastoralCaptureOutput('confirmed', ['start', 'confirm'], 'All good')
    expect(output.state).toBe('confirmed')
    expect(output.shape).toBe('pastoral_one_on_one')
    expect(output.actions).toEqual(['start', 'confirm'])
    expect(output.feedback).toBe('All good')
    expect(output.capturedAtIso).toBeTruthy()
  })

  it('builds output without feedback', () => {
    const output = buildPastoralCaptureOutput('rejected', ['start', 'reject'])
    expect(output.state).toBe('rejected')
    expect(output.feedback).toBeUndefined()
  })

  it('includes iso timestamp', () => {
    const before = new Date().toISOString()
    const output = buildPastoralCaptureOutput('in_progress', ['start'])
    const after = new Date().toISOString()
    expect(output.capturedAtIso >= before).toBe(true)
    expect(output.capturedAtIso <= after).toBe(true)
  })
})

// ─── canTransitionUX ─────────────────────────────────────────────────────────

describe('canTransitionUX (from operating-core state machine)', () => {
  it('allows idle → in_progress', () => {
    expect(canTransitionUX('idle', 'in_progress')).toBe(true)
  })

  it('does not allow idle → confirmed', () => {
    expect(canTransitionUX('idle', 'confirmed')).toBe(false)
  })

  it('allows in_progress → awaiting_resolution', () => {
    expect(canTransitionUX('in_progress', 'awaiting_resolution')).toBe(true)
  })

  it('allows in_progress → confirmed', () => {
    expect(canTransitionUX('in_progress', 'confirmed')).toBe(true)
  })

  it('allows in_progress → rejected', () => {
    expect(canTransitionUX('in_progress', 'rejected')).toBe(true)
  })

  it('does not allow self-transitions', () => {
    expect(canTransitionUX('in_progress', 'in_progress')).toBe(false)
  })

  it('does not allow terminal → any', () => {
    expect(canTransitionUX('overridden', 'idle')).toBe(false)
    expect(canTransitionUX('rejected', 'idle')).toBe(false)
  })
})

// ─── isTerminal ───────────────────────────────────────────────────────────────

describe('isTerminal', () => {
  it('returns true for overridden', () => {
    expect(isTerminal('overridden')).toBe(true)
  })

  it('returns true for rejected', () => {
    expect(isTerminal('rejected')).toBe(true)
  })

  it('returns false for in_progress', () => {
    expect(isTerminal('in_progress')).toBe(false)
  })

  it('returns false for confirmed', () => {
    expect(isTerminal('confirmed')).toBe(false)
  })
})
