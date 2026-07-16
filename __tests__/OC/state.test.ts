/**
 * S02 TDD RED — state module
 * Verifies the 6-state registration state machine and explicit transition table.
 */
import {
  REGISTRATION_STATES,
  canTransition,
  REGISTRATION_TRANSITIONS,
  type RegistrationState,
} from '@/lib/platform/operating-core/state'

describe('REGISTRATION_STATES', () => {
  it('should contain exactly 6 states', () => {
    expect(REGISTRATION_STATES).toHaveLength(6)
  })

  it('should contain all canonical states', () => {
    const canonical = ['pendiente', 'confirmada', 'asistida', 'no_asistio', 'cancelada', 'rechazada'] as const
    for (const s of canonical) {
      expect(REGISTRATION_STATES).toContain(s)
    }
  })

  it('should NOT contain terminal duplicate names', () => {
    const unique = new Set(REGISTRATION_STATES)
    expect(unique.size).toBe(REGISTRATION_STATES.length)
  })
})

describe('canTransition(from, to)', () => {
  // pendiente → confirmada | cancelada | rechazada
  it('allows pendiente → confirmada', () => {
    expect(canTransition('pendiente', 'confirmada')).toBe(true)
  })
  it('allows pendiente → cancelada', () => {
    expect(canTransition('pendiente', 'cancelada')).toBe(true)
  })
  it('allows pendiente → rechazada', () => {
    expect(canTransition('pendiente', 'rechazada')).toBe(true)
  })
  it('rejects pendiente → asistida (skip)', () => {
    expect(canTransition('pendiente', 'asistida')).toBe(false)
  })
  it('rejects pendiente → no_asistio (skip)', () => {
    expect(canTransition('pendiente', 'no_asistio')).toBe(false)
  })

  // confirmada → asistida | no_asistio | cancelada
  it('allows confirmada → asistida', () => {
    expect(canTransition('confirmada', 'asistida')).toBe(true)
  })
  it('allows confirmada → no_asistio', () => {
    expect(canTransition('confirmada', 'no_asistio')).toBe(true)
  })
  it('allows confirmada → cancelada', () => {
    expect(canTransition('confirmada', 'cancelada')).toBe(true)
  })
  it('rejects confirmada → rechazada', () => {
    expect(canTransition('confirmada', 'rechazada')).toBe(false)
  })
  it('rejects confirmada → pendiente (backwards)', () => {
    expect(canTransition('confirmada', 'pendiente')).toBe(false)
  })

  // Terminal states: asistida, no_asistio, cancelada, rechazada → nothing
  it('rejects asistida → any state (terminal)', () => {
    for (const to of REGISTRATION_STATES) {
      if (to !== 'asistida') {
        expect(canTransition('asistida', to)).toBe(false)
      }
    }
  })
  it('rejects no_asistio → any state (terminal)', () => {
    for (const to of REGISTRATION_STATES) {
      if (to !== 'no_asistio') {
        expect(canTransition('no_asistio', to)).toBe(false)
      }
    }
  })
  it('rejects cancelada → any state (terminal)', () => {
    for (const to of REGISTRATION_STATES) {
      if (to !== 'cancelada') {
        expect(canTransition('cancelada', to)).toBe(false)
      }
    }
  })
  it('rejects rechazada → any state (terminal)', () => {
    for (const to of REGISTRATION_STATES) {
      if (to !== 'rechazada') {
        expect(canTransition('rechazada', to)).toBe(false)
      }
    }
  })

  // Self-transitions are invalid
  it('rejects all self-transitions', () => {
    for (const from of REGISTRATION_STATES) {
      expect(canTransition(from, from)).toBe(false)
    }
  })
})

describe('REGISTRATION_TRANSITIONS', () => {
  it('maps non-terminal states (pendiente, confirmada) to non-empty sets', () => {
    expect(REGISTRATION_TRANSITIONS['pendiente'].size).toBeGreaterThan(0)
    expect(REGISTRATION_TRANSITIONS['confirmada'].size).toBeGreaterThan(0)
  })

  it('maps terminal states to empty sets', () => {
    expect(REGISTRATION_TRANSITIONS['asistida'].size).toBe(0)
    expect(REGISTRATION_TRANSITIONS['no_asistio'].size).toBe(0)
    expect(REGISTRATION_TRANSITIONS['cancelada'].size).toBe(0)
    expect(REGISTRATION_TRANSITIONS['rechazada'].size).toBe(0)
  })

  it('maps pendiente to exactly 3 targets', () => {
    expect(REGISTRATION_TRANSITIONS['pendiente'].size).toBe(3)
  })

  it('maps confirmada to exactly 3 targets', () => {
    expect(REGISTRATION_TRANSITIONS['confirmada'].size).toBe(3)
  })

  it('includes all expected targets for pendiente', () => {
    expect(REGISTRATION_TRANSITIONS['pendiente'].has('confirmada')).toBe(true)
    expect(REGISTRATION_TRANSITIONS['pendiente'].has('cancelada')).toBe(true)
    expect(REGISTRATION_TRANSITIONS['pendiente'].has('rechazada')).toBe(true)
  })

  it('includes all expected targets for confirmada', () => {
    expect(REGISTRATION_TRANSITIONS['confirmada'].has('asistida')).toBe(true)
    expect(REGISTRATION_TRANSITIONS['confirmada'].has('no_asistio')).toBe(true)
    expect(REGISTRATION_TRANSITIONS['confirmada'].has('cancelada')).toBe(true)
  })
})

describe('RegistrationState type', () => {
  it('should accept every canonical state', () => {
    const acceptAll = (_: RegistrationState) => { void _ }
    acceptAll('pendiente')
    acceptAll('confirmada')
    acceptAll('asistida')
    acceptAll('no_asistio')
    acceptAll('cancelada')
    acceptAll('rechazada')
  })

  it('should reject invalid state names', () => {
    const acceptAll = (_: RegistrationState) => { void _ }
    // @ts-expect-error — not a valid RegistrationState
    acceptAll('pending')
    // @ts-expect-error — not a valid RegistrationState
    acceptAll('confirmed')
  })
})
