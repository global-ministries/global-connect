import {
  SIN_TURNO,
  cambiosDeTurnos,
  coincideTurno,
  detalleTurno,
  fetchTurnos,
  fetchTurnosDeServicios,
  fetchTurnosDisponibles,
  guardarTurnosDeServicio,
  ordenarTurnos,
  validarDatosTurno,
  validarTurnoIds,
  type Turno,
} from '@/lib/platform/dream-team/turnos'

const T1 = '00000000-0000-4000-8000-000000000001'
const T2 = '00000000-0000-4000-8000-000000000002'
const T3 = '00000000-0000-4000-8000-000000000003'

function turno(parcial: Partial<Turno> & { id: string }): Turno {
  return { campusId: 'c1', nombre: 'Domingo 9:00', diaSemana: 0, hora: '09:00', orden: 0, activo: true, ...parcial }
}

describe('coincideTurno', () => {
  it('lets everything through without a filter', () => {
    expect(coincideTurno(undefined, null)).toBe(true)
    expect(coincideTurno([T1], null)).toBe(true)
  })

  it('matches a servicio assigned to the shift, among several', () => {
    expect(coincideTurno([T2, T1], T1)).toBe(true)
    expect(coincideTurno([T2], T1)).toBe(false)
    expect(coincideTurno(undefined, T1)).toBe(false)
  })

  it('"sin turno" matches only servicios with no shift', () => {
    expect(coincideTurno([], SIN_TURNO)).toBe(true)
    expect(coincideTurno(undefined, SIN_TURNO)).toBe(true)
    expect(coincideTurno([T1], SIN_TURNO)).toBe(false)
  })
})

describe('validarTurnoIds', () => {
  it('accepts a deduplicated list of uuids', () => {
    expect(validarTurnoIds([T1, T2, T1])).toEqual({ ok: true, turnoIds: [T1, T2] })
    expect(validarTurnoIds([])).toEqual({ ok: true, turnoIds: [] })
  })

  it('rejects anything that is not a list of uuids', () => {
    expect(validarTurnoIds('x').ok).toBe(false)
    expect(validarTurnoIds([T1, 'nope']).ok).toBe(false)
    expect(validarTurnoIds(undefined).ok).toBe(false)
  })
})

describe('validarDatosTurno', () => {
  it('normalizes a valid shift', () => {
    expect(validarDatosTurno({ nombre: '  Domingo 9:00 ', diaSemana: 0, hora: '9:00', orden: 2 })).toEqual({
      ok: true,
      datos: { nombre: 'Domingo 9:00', diaSemana: 0, hora: '09:00', orden: 2 },
    })
  })

  it('defaults the order to 0', () => {
    const resultado = validarDatosTurno({ nombre: 'Sábado', diaSemana: 6, hora: '17:30' })
    expect(resultado.ok && resultado.datos.orden).toBe(0)
  })

  it('rejects an empty name, a day out of range or a bad hour', () => {
    expect(validarDatosTurno({ nombre: ' ', diaSemana: 0, hora: '09:00' }).ok).toBe(false)
    expect(validarDatosTurno({ nombre: 'X', diaSemana: 7, hora: '09:00' }).ok).toBe(false)
    expect(validarDatosTurno({ nombre: 'X', diaSemana: 1.5, hora: '09:00' }).ok).toBe(false)
    expect(validarDatosTurno({ nombre: 'X', diaSemana: 0, hora: '25:00' }).ok).toBe(false)
    expect(validarDatosTurno({ nombre: 'X', diaSemana: 0, hora: 'mañana' }).ok).toBe(false)
  })
})

describe('cambiosDeTurnos', () => {
  it('computes what to add and what to remove', () => {
    expect(cambiosDeTurnos([T1, T2], [T2, T3])).toEqual({ agregar: [T3], quitar: [T1] })
    expect(cambiosDeTurnos([], [])).toEqual({ agregar: [], quitar: [] })
  })
})

describe('ordenarTurnos and detalleTurno', () => {
  it('sorts by campus order, then hour', () => {
    const a = turno({ id: T1, orden: 2, hora: '11:00' })
    const b = turno({ id: T2, orden: 1, hora: '09:00' })
    const c = turno({ id: T3, orden: 1, hora: '08:00' })
    expect(ordenarTurnos([a, b, c]).map((t) => t.id)).toEqual([T3, T2, T1])
  })

  it('describes the day and hour in Spanish', () => {
    expect(detalleTurno(turno({ id: T1, diaSemana: 6, hora: '17:30' }))).toBe('Sábado · 17:30')
  })
})

// ── I/O against a minimal fake client ────────────────────────────────────

type Respuesta = { data: unknown; error: unknown }

function cliente(respuestas: Record<string, Respuesta>) {
  const llamadas: { tabla: string; op: string; args: unknown[] }[] = []
  function builder(tabla: string) {
    const b: Record<string, unknown> = {}
    const registrar = (op: string) => (...args: unknown[]) => {
      llamadas.push({ tabla, op, args })
      return b
    }
    for (const op of ['select', 'in', 'eq', 'order', 'insert', 'delete']) b[op] = registrar(op)
    b.then = (resolver: (r: Respuesta) => unknown) => resolver(respuestas[tabla] ?? { data: [], error: null })
    return b
  }
  return {
    llamadas,
    from: jest.fn((tabla: string) => builder(tabla)),
    rpc: jest.fn((nombre: string, args: { p_campus_id: string }) =>
      Promise.resolve(respuestas[`${nombre}:${args.p_campus_id}`] ?? { data: [], error: null }),
    ),
  }
}

describe('fetchTurnos', () => {
  it('maps rows and trims the seconds of the hour', async () => {
    const c = cliente({
      dream_team_turnos: {
        data: [{ id: T1, campus_id: 'c1', nombre: 'Domingo 9:00', dia_semana: 0, hora: '09:00:00', orden: 1, activo: true }],
        error: null,
      },
    })
    expect(await fetchTurnos(c as never)).toEqual([
      { id: T1, campusId: 'c1', nombre: 'Domingo 9:00', diaSemana: 0, hora: '09:00', orden: 1, activo: true },
    ])
  })

  it('throws on a database error', async () => {
    const c = cliente({ dream_team_turnos: { data: null, error: { message: 'boom' } } })
    await expect(fetchTurnos(c as never)).rejects.toThrow('boom')
  })
})

describe('fetchTurnosDeServicios', () => {
  it('groups the shift ids by servicio and skips the query when there is nothing to ask', async () => {
    const c = cliente({
      dream_team_servicio_turnos: {
        data: [
          { servicio_id: 's1', turno_id: T1 },
          { servicio_id: 's1', turno_id: T2 },
          { servicio_id: 's2', turno_id: T2 },
        ],
        error: null,
      },
    })
    const mapa = await fetchTurnosDeServicios(c as never, ['s1', 's2', 's1'])
    expect(mapa.get('s1')).toEqual([T1, T2])
    expect(mapa.get('s2')).toEqual([T2])

    const vacio = cliente({})
    expect((await fetchTurnosDeServicios(vacio as never, [])).size).toBe(0)
    expect(vacio.from).not.toHaveBeenCalled()
  })
})

describe('fetchTurnosDisponibles', () => {
  it('asks the database once per campus and joins the answers', async () => {
    const c = cliente({
      'dream_team_turnos_del_equipo:c1': { data: [T1], error: null },
      'dream_team_turnos_del_equipo:c2': { data: [T3], error: null },
    })
    const turnos = [turno({ id: T1, campusId: 'c1' }), turno({ id: T2, campusId: 'c1' }), turno({ id: T3, campusId: 'c2' })]
    expect(await fetchTurnosDisponibles(c as never, 'e1', turnos)).toEqual([T1, T3])
    expect(c.rpc).toHaveBeenCalledTimes(2)
    expect(c.rpc).toHaveBeenCalledWith('dream_team_turnos_del_equipo', { p_equipo_id: 'e1', p_campus_id: 'c1' })
  })
})

describe('guardarTurnosDeServicio', () => {
  it('inserts the new shifts and deletes the dropped ones', async () => {
    const c = cliente({ dream_team_servicio_turnos: { data: [{ turno_id: T1 }, { turno_id: T2 }], error: null } })
    await guardarTurnosDeServicio(c as never, 's1', [T2, T3])
    const inserts = c.llamadas.filter((l) => l.op === 'insert')
    const deletes = c.llamadas.filter((l) => l.op === 'delete')
    expect(inserts).toHaveLength(1)
    expect(inserts[0].args[0]).toEqual([{ servicio_id: 's1', turno_id: T3 }])
    expect(deletes).toHaveLength(1)
    expect(c.llamadas.some((l) => l.op === 'in' && JSON.stringify(l.args) === JSON.stringify(['turno_id', [T1]]))).toBe(true)
  })

  it('does nothing when the shifts did not change', async () => {
    const c = cliente({ dream_team_servicio_turnos: { data: [{ turno_id: T1 }], error: null } })
    await guardarTurnosDeServicio(c as never, 's1', [T1])
    expect(c.llamadas.some((l) => l.op === 'insert' || l.op === 'delete')).toBe(false)
  })
})
