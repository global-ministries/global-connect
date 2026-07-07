import { transition, TRANSICIONES_VALIDAS } from '@/lib/platform/dream-team/state-machine'
import { personaId } from '@/lib/platform/dream-team/types'
import type { DreamTeamServicio, DreamTeamTransicionInput } from '@/lib/platform/dream-team/types'

function makeServicio(estado: DreamTeamServicio['estado']): DreamTeamServicio {
  return {
    id: 'servicio-1',
    personaId: personaId('persona-ana'),
    equipoId: 'equipo-dps-camara',
    rolId: 'rol-voluntario',
    estado,
    fechaInicio: '2026-01-01',
    motivoActual: 'admin_asignacion',
    version: 1,
  }
}

function makeInput(
  estado: DreamTeamServicio['estado'],
  estadoNuevo: DreamTeamServicio['estado'],
  motivo: string = 'admin_promocion',
  version: number = 1,
): DreamTeamTransicionInput {
  return {
    servicio: { ...makeServicio(estado), version },
    estadoNuevo,
    motivo: motivo as DreamTeamTransicionInput['motivo'],
    fecha: '2026-07-07',
  }
}

describe('Dream Team state machine', () => {
  it('allows valid transitions and returns the updated service', () => {
    const result = transition(makeInput('postulado', 'en_orientacion', 'admin_promocion'))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.servicioNuevo.estado).toBe('en_orientacion')
    expect(result.servicioNuevo.motivoActual).toBe('admin_promocion')
    expect(result.servicioNuevo.version).toBe(2)
    expect(result.servicioNuevo.fechaFin).toBeUndefined()
  })

  it('rejects invalid transitions with INVALID_STATE_TRANSITION', () => {
    const result = transition(makeInput('postulado', 'activo', 'admin_promocion'))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error.code).toBe('INVALID_STATE_TRANSITION')
  })

  it('rejects self transitions with SELF_TRANSITION', () => {
    const result = transition(makeInput('activo', 'activo', 'admin_pausa'))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error.code).toBe('SELF_TRANSITION')
  })

  it('rejects every transition from retirado with TERMINAL_STATE', () => {
    expect(transition(makeInput('retirado', 'activo', 'admin_reactivacion'))).toMatchObject({
      ok: false,
      error: { code: 'TERMINAL_STATE' },
    })
    expect(transition(makeInput('retirado', 'retirado', 'admin_retiro'))).toMatchObject({
      ok: false,
      error: { code: 'TERMINAL_STATE' },
    })
  })

  it('rejects empty or whitespace-only motivo with MISSING_MOTIVO', () => {
    expect(transition(makeInput('postulado', 'en_orientacion', ''))).toMatchObject({
      ok: false,
      error: { code: 'MISSING_MOTIVO' },
    })
    expect(transition(makeInput('postulado', 'en_orientacion', '   '))).toMatchObject({
      ok: false,
      error: { code: 'MISSING_MOTIVO' },
    })
  })

  it('rejects motivo outside DREAM_TEAM_MOTIVOS with INVALID_MOTIVO_FOR_TRANSITION', () => {
    const result = transition(makeInput('postulado', 'en_orientacion', 'not-valid' as DreamTeamTransicionInput['motivo']))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error.code).toBe('INVALID_MOTIVO_FOR_TRANSITION')
  })

  it('increments version by one on successful transition', () => {
    const result = transition(makeInput('en_orientacion', 'activo', 'admin_promocion', 5))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.servicioNuevo.version).toBe(6)
  })

  it('sets fechaFin when the new state is retirado', () => {
    const result = transition(makeInput('activo', 'retirado', 'admin_retiro'))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.servicioNuevo.estado).toBe('retirado')
    expect(result.servicioNuevo.fechaFin).toBe('2026-07-07')
  })

  it('keeps independent services isolated (caso Ana)', () => {
    const servicioDps: DreamTeamServicio = {
      id: 'servicio-dps',
      personaId: personaId('persona-ana'),
      equipoId: 'equipo-dps-camara',
      rolId: 'rol-voluntario',
      estado: 'activo',
      fechaInicio: '2026-01-15',
      motivoActual: 'admin_promocion',
      version: 2,
    }
    const servicioEstudiantes: DreamTeamServicio = {
      id: 'servicio-estudiantes',
      personaId: personaId('persona-ana'),
      equipoId: 'equipo-estudiantes-transit',
      rolId: 'rol-lider',
      estado: 'activo',
      fechaInicio: '2026-02-01',
      motivoActual: 'admin_promocion',
      version: 3,
    }

    const dpsResult = transition({ servicio: servicioDps, estadoNuevo: 'en_pausa', motivo: 'admin_pausa', fecha: '2026-07-07' })
    const estudiantesResult = transition({ servicio: servicioEstudiantes, estadoNuevo: 'en_pausa', motivo: 'admin_pausa', fecha: '2026-07-07' })

    expect(dpsResult.ok).toBe(true)
    expect(estudiantesResult.ok).toBe(true)
    if (!dpsResult.ok || !estudiantesResult.ok) throw new Error('expected ok')

    expect(dpsResult.servicioNuevo.estado).toBe('en_pausa')
    expect(dpsResult.servicioNuevo.version).toBe(3)
    expect(estudiantesResult.servicioNuevo.estado).toBe('en_pausa')
    expect(estudiantesResult.servicioNuevo.version).toBe(4)
    expect(servicioDps.estado).toBe('activo')
    expect(servicioEstudiantes.estado).toBe('activo')
  })

  it('exposes the expected transition matrix', () => {
    expect(
      Object.fromEntries(
        Object.entries(TRANSICIONES_VALIDAS).map(([from, set]) => [from, [...set].sort()]),
      ),
    ).toEqual({
      postulado: ['en_orientacion', 'retirado'],
      en_orientacion: ['activo', 'inactivo', 'retirado'],
      activo: ['en_pausa', 'inactivo', 'retirado'],
      en_pausa: ['activo', 'inactivo', 'retirado'],
      inactivo: ['postulado', 'retirado'],
      retirado: [],
    })
  })
})
