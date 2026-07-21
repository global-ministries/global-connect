/**
 * S20 TDD RED — capture-ux STUB shells
 * Each shell takes CaptureUXInput props and returns CaptureUXOutput (NOT JSX).
 * Tests verify:
 * - Each shell returns the correct state and shape
 * - Each shell returns the correct actions for the given state
 * - Each shell includes [STUB: ...] feedback
 */
import type { CaptureUXInput, CaptureUXOutput } from '@/lib/platform/operating-core/capture-ux/capture-ux-types'
import { GdvLeaderListShell } from '@/app/operating-core/capture-ux/shells/gdv-leader-list'
import { NinosCheckinShell } from '@/app/operating-core/capture-ux/shells/ninos-checkin'
import { EstudiantesTlrListShell } from '@/app/operating-core/capture-ux/shells/estudiantes-tlr-list'
import { DpsCoordinatorShell } from '@/app/operating-core/capture-ux/shells/dps-coordinator'
import { WorkshopRegistrationShell } from '@/app/operating-core/capture-ux/shells/workshop-registration'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<CaptureUXInput> = {}): CaptureUXInput {
  return {
    shape: 'visitor_resolution',
    context: {
      eventId: 'event-1',
      personaId: 'persona-1',
      groupId: 'group-1',
      operatorPersonaId: 'operator-1',
      nowIso: '2026-07-20T12:00:00.000Z',
    },
    state: 'idle',
    ...overrides,
  }
}

function expectShellOutput(
  output: CaptureUXOutput,
  expectedState: CaptureUXOutput['state'],
  expectedShape: CaptureUXOutput['shape'],
  shellName: string,
): void {
  expect(output.state).toBe(expectedState)
  expect(output.shape).toBe(expectedShape)
  expect(output.feedback).toMatch(/^\[STUB: .+\]$/)
  expect(output.feedback).toContain(shellName)
  expect(output.feedback).toContain(`state=${expectedState}`)
}

// ---------------------------------------------------------------------------
// GdvLeaderListShell
// ---------------------------------------------------------------------------

describe('GdvLeaderListShell', () => {
  it('returns idle output with start action', () => {
    const input = makeInput({ shape: 'visitor_resolution', state: 'idle' })
    const output = GdvLeaderListShell(input)
    expectShellOutput(output, 'idle', 'visitor_resolution', 'GDV leader list shell')
    expect(output.actions).toHaveLength(1)
    expect(output.actions[0].type).toBe('start')
  })

  it('returns in_progress output with pause/confirm/override/reject actions', () => {
    const input = makeInput({ shape: 'visitor_resolution', state: 'in_progress' })
    const output = GdvLeaderListShell(input)
    expectShellOutput(output, 'in_progress', 'visitor_resolution', 'GDV leader list shell')
    expect(output.actions.map(a => a.type).sort()).toEqual(['confirm', 'override', 'pause', 'reject'].sort())
  })

  it('returns awaiting_resolution output with resume/confirm/override/reject actions', () => {
    const input = makeInput({ shape: 'visitor_resolution', state: 'awaiting_resolution' })
    const output = GdvLeaderListShell(input)
    expectShellOutput(output, 'awaiting_resolution', 'visitor_resolution', 'GDV leader list shell')
    expect(output.actions.map(a => a.type).sort()).toEqual(['confirm', 'override', 'resume', 'reject'].sort())
  })

  it('returns confirmed output with override/reject actions', () => {
    const input = makeInput({ shape: 'visitor_resolution', state: 'confirmed' })
    const output = GdvLeaderListShell(input)
    expectShellOutput(output, 'confirmed', 'visitor_resolution', 'GDV leader list shell')
    expect(output.actions.map(a => a.type).sort()).toEqual(['override', 'reject'].sort())
  })

  it('returns overridden output with no actions (terminal)', () => {
    const input = makeInput({ shape: 'visitor_resolution', state: 'overridden' })
    const output = GdvLeaderListShell(input)
    expectShellOutput(output, 'overridden', 'visitor_resolution', 'GDV leader list shell')
    expect(output.actions).toHaveLength(0)
  })

  it('returns rejected output with no actions (terminal)', () => {
    const input = makeInput({ shape: 'visitor_resolution', state: 'rejected' })
    const output = GdvLeaderListShell(input)
    expectShellOutput(output, 'rejected', 'visitor_resolution', 'GDV leader list shell')
    expect(output.actions).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// NinosCheckinShell
// ---------------------------------------------------------------------------

describe('NinosCheckinShell', () => {
  it('returns idle output with start action', () => {
    const input = makeInput({ shape: 'attendance', state: 'idle' })
    const output = NinosCheckinShell(input)
    expectShellOutput(output, 'idle', 'attendance', 'niños check-in/out shell')
    expect(output.actions).toHaveLength(1)
    expect(output.actions[0].type).toBe('start')
  })

  it('returns in_progress output with pause/confirm/override/reject actions', () => {
    const input = makeInput({ shape: 'attendance', state: 'in_progress' })
    const output = NinosCheckinShell(input)
    expectShellOutput(output, 'in_progress', 'attendance', 'niños check-in/out shell')
    expect(output.actions.map(a => a.type).sort()).toEqual(['confirm', 'override', 'pause', 'reject'].sort())
  })

  it('returns awaiting_resolution output with resume/confirm/override/reject actions', () => {
    const input = makeInput({ shape: 'attendance', state: 'awaiting_resolution' })
    const output = NinosCheckinShell(input)
    expectShellOutput(output, 'awaiting_resolution', 'attendance', 'niños check-in/out shell')
    expect(output.actions.map(a => a.type).sort()).toEqual(['confirm', 'override', 'resume', 'reject'].sort())
  })

  it('returns confirmed output with override/reject actions', () => {
    const input = makeInput({ shape: 'attendance', state: 'confirmed' })
    const output = NinosCheckinShell(input)
    expectShellOutput(output, 'confirmed', 'attendance', 'niños check-in/out shell')
    expect(output.actions.map(a => a.type).sort()).toEqual(['override', 'reject'].sort())
  })

  it('returns overridden output with no actions (terminal)', () => {
    const input = makeInput({ shape: 'attendance', state: 'overridden' })
    const output = NinosCheckinShell(input)
    expectShellOutput(output, 'overridden', 'attendance', 'niños check-in/out shell')
    expect(output.actions).toHaveLength(0)
  })

  it('returns rejected output with no actions (terminal)', () => {
    const input = makeInput({ shape: 'attendance', state: 'rejected' })
    const output = NinosCheckinShell(input)
    expectShellOutput(output, 'rejected', 'attendance', 'niños check-in/out shell')
    expect(output.actions).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// EstudiantesTlrListShell
// ---------------------------------------------------------------------------

describe('EstudiantesTlrListShell', () => {
  it('returns idle output with start action', () => {
    const input = makeInput({ shape: 'attendance', state: 'idle' })
    const output = EstudiantesTlrListShell(input)
    expectShellOutput(output, 'idle', 'attendance', 'estudiantes/TLR list shell')
    expect(output.actions).toHaveLength(1)
    expect(output.actions[0].type).toBe('start')
  })

  it('returns in_progress output with pause/confirm/override/reject actions', () => {
    const input = makeInput({ shape: 'attendance', state: 'in_progress' })
    const output = EstudiantesTlrListShell(input)
    expectShellOutput(output, 'in_progress', 'attendance', 'estudiantes/TLR list shell')
    expect(output.actions.map(a => a.type).sort()).toEqual(['confirm', 'override', 'pause', 'reject'].sort())
  })

  it('returns awaiting_resolution output with resume/confirm/override/reject actions', () => {
    const input = makeInput({ shape: 'attendance', state: 'awaiting_resolution' })
    const output = EstudiantesTlrListShell(input)
    expectShellOutput(output, 'awaiting_resolution', 'attendance', 'estudiantes/TLR list shell')
    expect(output.actions.map(a => a.type).sort()).toEqual(['confirm', 'override', 'resume', 'reject'].sort())
  })

  it('returns confirmed output with override/reject actions', () => {
    const input = makeInput({ shape: 'attendance', state: 'confirmed' })
    const output = EstudiantesTlrListShell(input)
    expectShellOutput(output, 'confirmed', 'attendance', 'estudiantes/TLR list shell')
    expect(output.actions.map(a => a.type).sort()).toEqual(['override', 'reject'].sort())
  })

  it('returns overridden output with no actions (terminal)', () => {
    const input = makeInput({ shape: 'attendance', state: 'overridden' })
    const output = EstudiantesTlrListShell(input)
    expectShellOutput(output, 'overridden', 'attendance', 'estudiantes/TLR list shell')
    expect(output.actions).toHaveLength(0)
  })

  it('returns rejected output with no actions (terminal)', () => {
    const input = makeInput({ shape: 'attendance', state: 'rejected' })
    const output = EstudiantesTlrListShell(input)
    expectShellOutput(output, 'rejected', 'attendance', 'estudiantes/TLR list shell')
    expect(output.actions).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// DpsCoordinatorShell
// ---------------------------------------------------------------------------

describe('DpsCoordinatorShell', () => {
  it('returns idle output with start action', () => {
    const input = makeInput({ shape: 'registration', state: 'idle' })
    const output = DpsCoordinatorShell(input)
    expectShellOutput(output, 'idle', 'registration', 'DPS coordinator shell')
    expect(output.actions).toHaveLength(1)
    expect(output.actions[0].type).toBe('start')
  })

  it('returns in_progress output with pause/confirm/override/reject actions', () => {
    const input = makeInput({ shape: 'registration', state: 'in_progress' })
    const output = DpsCoordinatorShell(input)
    expectShellOutput(output, 'in_progress', 'registration', 'DPS coordinator shell')
    expect(output.actions.map(a => a.type).sort()).toEqual(['confirm', 'override', 'pause', 'reject'].sort())
  })

  it('returns awaiting_resolution output with resume/confirm/override/reject actions', () => {
    const input = makeInput({ shape: 'registration', state: 'awaiting_resolution' })
    const output = DpsCoordinatorShell(input)
    expectShellOutput(output, 'awaiting_resolution', 'registration', 'DPS coordinator shell')
    expect(output.actions.map(a => a.type).sort()).toEqual(['confirm', 'override', 'resume', 'reject'].sort())
  })

  it('returns confirmed output with override/reject actions', () => {
    const input = makeInput({ shape: 'registration', state: 'confirmed' })
    const output = DpsCoordinatorShell(input)
    expectShellOutput(output, 'confirmed', 'registration', 'DPS coordinator shell')
    expect(output.actions.map(a => a.type).sort()).toEqual(['override', 'reject'].sort())
  })

  it('returns overridden output with no actions (terminal)', () => {
    const input = makeInput({ shape: 'registration', state: 'overridden' })
    const output = DpsCoordinatorShell(input)
    expectShellOutput(output, 'overridden', 'registration', 'DPS coordinator shell')
    expect(output.actions).toHaveLength(0)
  })

  it('returns rejected output with no actions (terminal)', () => {
    const input = makeInput({ shape: 'registration', state: 'rejected' })
    const output = DpsCoordinatorShell(input)
    expectShellOutput(output, 'rejected', 'registration', 'DPS coordinator shell')
    expect(output.actions).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// WorkshopRegistrationShell
// ---------------------------------------------------------------------------

describe('WorkshopRegistrationShell', () => {
  it('returns idle output with start action', () => {
    const input = makeInput({ shape: 'registration', state: 'idle' })
    const output = WorkshopRegistrationShell(input)
    expectShellOutput(output, 'idle', 'registration', 'workshop registration shell')
    expect(output.actions).toHaveLength(1)
    expect(output.actions[0].type).toBe('start')
  })

  it('returns in_progress output with pause/confirm/override/reject actions', () => {
    const input = makeInput({ shape: 'registration', state: 'in_progress' })
    const output = WorkshopRegistrationShell(input)
    expectShellOutput(output, 'in_progress', 'registration', 'workshop registration shell')
    expect(output.actions.map(a => a.type).sort()).toEqual(['confirm', 'override', 'pause', 'reject'].sort())
  })

  it('returns awaiting_resolution output with resume/confirm/override/reject actions', () => {
    const input = makeInput({ shape: 'registration', state: 'awaiting_resolution' })
    const output = WorkshopRegistrationShell(input)
    expectShellOutput(output, 'awaiting_resolution', 'registration', 'workshop registration shell')
    expect(output.actions.map(a => a.type).sort()).toEqual(['confirm', 'override', 'resume', 'reject'].sort())
  })

  it('returns confirmed output with override/reject actions', () => {
    const input = makeInput({ shape: 'registration', state: 'confirmed' })
    const output = WorkshopRegistrationShell(input)
    expectShellOutput(output, 'confirmed', 'registration', 'workshop registration shell')
    expect(output.actions.map(a => a.type).sort()).toEqual(['override', 'reject'].sort())
  })

  it('returns overridden output with no actions (terminal)', () => {
    const input = makeInput({ shape: 'registration', state: 'overridden' })
    const output = WorkshopRegistrationShell(input)
    expectShellOutput(output, 'overridden', 'registration', 'workshop registration shell')
    expect(output.actions).toHaveLength(0)
  })

  it('returns rejected output with no actions (terminal)', () => {
    const input = makeInput({ shape: 'registration', state: 'rejected' })
    const output = WorkshopRegistrationShell(input)
    expectShellOutput(output, 'rejected', 'registration', 'workshop registration shell')
    expect(output.actions).toHaveLength(0)
  })
})
