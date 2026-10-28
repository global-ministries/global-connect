/**
 * turnos — dated shifts in the data layer (T2 of odd/tasks/tlr-calendario-servicios.md, S3/S4):
 * the turno's tipo, its planned dates with who serves on each, and the write
 * path through the database functions of 20261026140000.
 */
import {
  borrarFechaDeTurno,
  detalleTurno,
  fetchFechasDeTurnos,
  fetchTurnos,
  fijarServidoresDeFecha,
  guardarFechaDeTurno,
  puedeGestionarTurno,
  validarDatosTurno,
  type Turno,
} from '@/lib/platform/dream-team/turnos'

const T1 = '00000000-0000-4000-8000-000000000001'
const F1 = '00000000-0000-4000-8000-0000000000f1'
const F2 = '00000000-0000-4000-8000-0000000000f2'

type Respuesta = { data: unknown; error: unknown }

function cliente(tablas: Record<string, Respuesta>, rpcs: Record<string, Respuesta> = {}) {
  const llamadas: { tabla: string; op: string; args: unknown[] }[] = []
  function builder(tabla: string) {
    const b: Record<string, unknown> = {}
    const registrar = (op: string) => (...args: unknown[]) => {
      llamadas.push({ tabla, op, args })
      return b
    }
    for (const op of ['select', 'in', 'eq', 'order']) b[op] = registrar(op)
    b.then = (resolver: (r: Respuesta) => unknown) => resolver(tablas[tabla] ?? { data: [], error: null })
    return b
  }
  return {
    llamadas,
    from: jest.fn((tabla: string) => builder(tabla)),
    rpc: jest.fn((nombre: string) => Promise.resolve(rpcs[nombre] ?? { data: null, error: null })),
  }
}

describe('tipo of a turno', () => {
  it('fetchTurnos reads the tipo; a row without one is weekly', async () => {
    const c = cliente({
      dream_team_turnos: {
        data: [
          { id: T1, campus_id: 'c1', nombre: 'The Living Room', dia_semana: 0, hora: '10:00:00', orden: 3, activo: true, tipo: 'fechas' },
          { id: 'x', campus_id: 'c1', nombre: 'Domingo 9:00', dia_semana: 0, hora: '09:00:00', orden: 1, activo: true },
        ],
        error: null,
      },
    })
    const turnos = await fetchTurnos(c as never)
    expect(turnos.map((t) => [t.nombre, t.tipo])).toEqual([
      ['Domingo 9:00', 'semanal'],
      ['The Living Room', 'fechas'],
    ])
    expect(c.llamadas.find((l) => l.op === 'select')?.args[0]).toContain('tipo')
  })

  it('a dated turno reads "Por fechas" instead of a weekday', () => {
    const turno: Turno = { id: T1, campusId: 'c1', nombre: 'TLR', diaSemana: 0, hora: '10:00', orden: 1, activo: true, tipo: 'fechas' }
    expect(detalleTurno(turno)).toBe('Por fechas · 10:00')
    expect(detalleTurno({ ...turno, tipo: 'semanal' })).toBe('Domingo · 10:00')
  })

  it('validarDatosTurno takes the tipo; a dated turno needs no weekday', () => {
    expect(validarDatosTurno({ nombre: 'TLR', hora: '10:00', tipo: 'fechas' })).toEqual({
      ok: true,
      datos: { nombre: 'TLR', diaSemana: 0, hora: '10:00', orden: 0, tipo: 'fechas' },
    })
    expect(validarDatosTurno({ nombre: 'X', diaSemana: 0, hora: '10:00', tipo: 'mensual' })).toEqual({
      ok: false,
      message: 'El tipo de turno debe ser semanal o por fechas.',
    })
    expect(validarDatosTurno({ nombre: 'X', hora: '10:00' }).ok).toBe(false)
  })
})

describe('fetchFechasDeTurnos', () => {
  it('returns the planned dates of the shifts with who serves on each', async () => {
    const c = cliente({
      dream_team_turno_fechas: {
        data: [
          { id: F1, turno_id: T1, fecha: '2026-11-08', hora: null, nota: null },
          { id: F2, turno_id: T1, fecha: '2026-11-22', hora: '11:00:00', nota: 'Bautizos' },
        ],
        error: null,
      },
      dream_team_turno_fecha_servidores: {
        data: [
          { turno_fecha_id: F1, servicio_id: 's1' },
          { turno_fecha_id: F1, servicio_id: 's2' },
        ],
        error: null,
      },
    })
    expect(await fetchFechasDeTurnos(c as never, [T1])).toEqual([
      { id: F1, turnoId: T1, fecha: '2026-11-08', hora: null, nota: null, servidores: ['s1', 's2'] },
      { id: F2, turnoId: T1, fecha: '2026-11-22', hora: '11:00', nota: 'Bautizos', servidores: [] },
    ])
    expect(c.llamadas).toEqual(
      expect.arrayContaining([
        { tabla: 'dream_team_turno_fechas', op: 'in', args: ['turno_id', [T1]] },
        { tabla: 'dream_team_turno_fecha_servidores', op: 'in', args: ['turno_id', [T1]] },
      ]),
    )
  })

  it('asks nothing without shifts and throws on a database error', async () => {
    const vacio = cliente({})
    expect(await fetchFechasDeTurnos(vacio as never, [])).toEqual([])
    expect(vacio.from).not.toHaveBeenCalled()
    const roto = cliente({ dream_team_turno_fechas: { data: null, error: { message: 'boom' } } })
    await expect(fetchFechasDeTurnos(roto as never, [T1])).rejects.toThrow('boom')
  })
})

describe('write path', () => {
  it('guardarFechaDeTurno adds or edits a date through dream_team_turno_fecha_guardar', async () => {
    const c = cliente({}, { dream_team_turno_fecha_guardar: { data: F1, error: null } })
    expect(await guardarFechaDeTurno(c as never, T1, { fecha: '2026-11-08', hora: null, nota: null })).toBe(F1)
    expect(c.rpc).toHaveBeenLastCalledWith('dream_team_turno_fecha_guardar', {
      p_turno_id: T1,
      p_fecha: '2026-11-08',
      p_hora: null,
      p_nota: null,
      p_turno_fecha_id: null,
    })
    await guardarFechaDeTurno(c as never, T1, { fecha: '2026-11-15', hora: '10:30', nota: 'Cena' }, F1)
    expect(c.rpc).toHaveBeenLastCalledWith('dream_team_turno_fecha_guardar', {
      p_turno_id: T1,
      p_fecha: '2026-11-15',
      p_hora: '10:30',
      p_nota: 'Cena',
      p_turno_fecha_id: F1,
    })
  })

  it('keeps the code and message of a refusal', async () => {
    const c = cliente({}, { dream_team_turno_fecha_guardar: { data: null, error: { code: '42501', message: 'sin_autoridad' } } })
    await expect(guardarFechaDeTurno(c as never, T1, { fecha: '2026-11-08', hora: null, nota: null })).rejects.toMatchObject({
      code: '42501',
      message: 'sin_autoridad',
    })
  })

  it('borrarFechaDeTurno and fijarServidoresDeFecha call their functions', async () => {
    const c = cliente(
      {},
      {
        dream_team_turno_fecha_borrar: { data: true, error: null },
        dream_team_turno_fecha_servidores_fijar: { data: 2, error: null },
      },
    )
    await borrarFechaDeTurno(c as never, F1)
    expect(c.rpc).toHaveBeenLastCalledWith('dream_team_turno_fecha_borrar', { p_turno_fecha_id: F1 })
    expect(await fijarServidoresDeFecha(c as never, F1, ['s1', 's2'])).toBe(2)
    expect(c.rpc).toHaveBeenLastCalledWith('dream_team_turno_fecha_servidores_fijar', {
      p_turno_fecha_id: F1,
      p_servicio_ids: ['s1', 's2'],
    })
  })

  it('puedeGestionarTurno asks dream_team_puede_gestionar_turno and fails closed', async () => {
    const si = cliente({}, { dream_team_puede_gestionar_turno: { data: true, error: null } })
    expect(await puedeGestionarTurno(si as never, T1)).toBe(true)
    expect(si.rpc).toHaveBeenCalledWith('dream_team_puede_gestionar_turno', { p_turno_id: T1 })
    const roto = cliente({}, { dream_team_puede_gestionar_turno: { data: null, error: { message: 'boom' } } })
    expect(await puedeGestionarTurno(roto as never, T1)).toBe(false)
  })
})
