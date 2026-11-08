/**
 * Niños › Salón, voluntarios de hoy (odd/tasks/ninos-checkin-pco.md, T2c, S7,
 * S5): reading ninos_salon_voluntarios, how many volunteers the salón needs
 * and the texts of the header.
 */
import {
  asignarSalonVoluntario,
  cargarSalonesPlanilla,
  cargarSalonVoluntarios,
  leerSalonesPlanilla,
  mensajeErrorSalon,
  MESA,
  leerSalonVoluntarios,
  resumenVoluntarios,
  textoEstadoVoluntario,
  textoFaltan,
  textoRegla,
  voluntariosNecesarios,
  type SalonVoluntarios,
} from '@/lib/platform/ninos/salon-voluntarios'

const crudo = {
  salon_id: 's1',
  capacidad: 18,
  ninos_por_voluntario: 6,
  min_voluntarios: 2,
  asignados: 5,
  voluntarios: [
    { servicio_id: 'v1', nombre: 'Yelitza', apellido: 'Mujica', rol: 'Líder del salón', esperado: true, estado: 'presente', marcado_at: '2026-11-08T12:35:00Z' },
    { servicio_id: 'v2', nombre: 'Nelson', apellido: 'Aguilar', rol: null, esperado: true, estado: null, marcado_at: null },
    { servicio_id: 'v3', nombre: 'Karla', apellido: 'Montilla', rol: 'Voluntaria', esperado: false, estado: 'presente', marcado_at: '2026-11-08T12:40:00Z' },
    { servicio_id: 'v4', nombre: 'Jesús', apellido: 'Alvarado', rol: 'Voluntario', esperado: true, estado: 'ausente', marcado_at: '2026-11-08T13:00:00Z' },
  ],
}

function datos(regla: { ninosPorVoluntario: number | null; minVoluntarios: number }): SalonVoluntarios {
  return { ...(leerSalonVoluntarios(crudo) as SalonVoluntarios), ...regla }
}

describe('leerSalonVoluntarios', () => {
  it('reads the rules, the equipo and each volunteer', () => {
    const d = leerSalonVoluntarios(crudo)
    expect(d).toEqual({
      salonId: 's1',
      capacidad: 18,
      ninosPorVoluntario: 6,
      minVoluntarios: 2,
      asignados: 5,
      voluntarios: [
        { servicioId: 'v1', nombre: 'Yelitza', apellido: 'Mujica', rol: 'Líder del salón', esperado: true, estado: 'presente', marcadoAt: '2026-11-08T12:35:00Z' },
        { servicioId: 'v2', nombre: 'Nelson', apellido: 'Aguilar', rol: null, esperado: true, estado: null, marcadoAt: null },
        { servicioId: 'v3', nombre: 'Karla', apellido: 'Montilla', rol: 'Voluntaria', esperado: false, estado: 'presente', marcadoAt: '2026-11-08T12:40:00Z' },
        { servicioId: 'v4', nombre: 'Jesús', apellido: 'Alvarado', rol: 'Voluntario', esperado: true, estado: 'ausente', marcadoAt: '2026-11-08T13:00:00Z' },
      ],
    })
  })

  it('a salón without volunteers nor rules', () => {
    expect(
      leerSalonVoluntarios({ salon_id: 's3', capacidad: 20, ninos_por_voluntario: null, min_voluntarios: 0, asignados: 0, voluntarios: [] }),
    ).toEqual({ salonId: 's3', capacidad: 20, ninosPorVoluntario: null, minVoluntarios: 0, asignados: 0, voluntarios: [] })
  })

  it('drops malformed volunteers and unknown estados', () => {
    const d = leerSalonVoluntarios({
      ...crudo,
      voluntarios: [{ servicio_id: 'v9', nombre: 'Ana', apellido: 'Gil', esperado: true, estado: 'raro' }, { nombre: 'sin id' }, 3],
    })
    expect(d?.voluntarios).toEqual([
      { servicioId: 'v9', nombre: 'Ana', apellido: 'Gil', rol: null, esperado: true, estado: null, marcadoAt: null },
    ])
  })

  it('is null for something that is not the RPC object', () => {
    expect(leerSalonVoluntarios(null)).toBeNull()
    expect(leerSalonVoluntarios([])).toBeNull()
    expect(leerSalonVoluntarios({ capacidad: 3 })).toBeNull()
  })
})

describe('voluntariosNecesarios', () => {
  it('no rule (no ratio, minimum 0) → null', () => {
    expect(voluntariosNecesarios({ ninosPorVoluntario: null, minVoluntarios: 0 }, 14)).toBeNull()
  })

  it('minimum only', () => {
    expect(voluntariosNecesarios({ ninosPorVoluntario: null, minVoluntarios: 2 }, 14)).toBe(2)
    expect(voluntariosNecesarios({ ninosPorVoluntario: null, minVoluntarios: 2 }, 0)).toBe(2)
  })

  it('children per volunteer only, rounding up', () => {
    expect(voluntariosNecesarios({ ninosPorVoluntario: 6, minVoluntarios: 0 }, 14)).toBe(3)
    expect(voluntariosNecesarios({ ninosPorVoluntario: 6, minVoluntarios: 0 }, 12)).toBe(2)
    expect(voluntariosNecesarios({ ninosPorVoluntario: 6, minVoluntarios: 0 }, 1)).toBe(1)
  })

  it('both: the larger of the two', () => {
    expect(voluntariosNecesarios({ ninosPorVoluntario: 6, minVoluntarios: 2 }, 5)).toBe(2)
    expect(voluntariosNecesarios({ ninosPorVoluntario: 6, minVoluntarios: 2 }, 20)).toBe(4)
  })

  it('zero children', () => {
    expect(voluntariosNecesarios({ ninosPorVoluntario: 6, minVoluntarios: 0 }, 0)).toBe(0)
    expect(voluntariosNecesarios({ ninosPorVoluntario: 6, minVoluntarios: 3 }, 0)).toBe(3)
  })
})

describe('resumenVoluntarios', () => {
  it('counts only the ones who arrived (presente) and how many are missing', () => {
    expect(resumenVoluntarios(datos({ ninosPorVoluntario: 6, minVoluntarios: 2 }), 20)).toEqual({ llegaron: 2, necesarios: 4, faltan: 2, suficientes: false })
  })

  it('enough volunteers', () => {
    expect(resumenVoluntarios(datos({ ninosPorVoluntario: 6, minVoluntarios: 2 }), 7)).toEqual({ llegaron: 2, necesarios: 2, faltan: 0, suficientes: true })
  })

  it('no rule: no verdict', () => {
    expect(resumenVoluntarios(datos({ ninosPorVoluntario: null, minVoluntarios: 0 }), 7)).toEqual({ llegaron: 2, necesarios: null, faltan: 0, suficientes: null })
  })

  it('zero children with a ratio only: enough', () => {
    expect(resumenVoluntarios(datos({ ninosPorVoluntario: 6, minVoluntarios: 0 }), 0)).toEqual({ llegaron: 2, necesarios: 0, faltan: 0, suficientes: true })
  })
})

describe('texts', () => {
  it('estado of a volunteer: Llegó with the Caracas hour, Avisó, Faltó, Pendiente', () => {
    const [llego, pendiente, , falto] = datos({ ninosPorVoluntario: 6, minVoluntarios: 2 }).voluntarios
    expect(textoEstadoVoluntario(llego)).toBe('Llegó 08:35')
    expect(textoEstadoVoluntario(pendiente)).toBe('Pendiente')
    expect(textoEstadoVoluntario(falto)).toBe('Faltó')
    expect(textoEstadoVoluntario({ ...falto, estado: 'justificado' })).toBe('Avisó')
  })

  it('falta 1 / faltan N', () => {
    expect(textoFaltan(1)).toBe('falta 1')
    expect(textoFaltan(3)).toBe('faltan 3')
  })

  it('the rule in plain Spanish, never «proporción»', () => {
    expect(textoRegla({ ninosPorVoluntario: 6, minVoluntarios: 2 })).toBe('máximo 6 niños por voluntario, mínimo 2 voluntarios')
    expect(textoRegla({ ninosPorVoluntario: 1, minVoluntarios: 0 })).toBe('máximo 1 niño por voluntario')
    expect(textoRegla({ ninosPorVoluntario: null, minVoluntarios: 1 })).toBe('mínimo 1 voluntario')
    expect(textoRegla({ ninosPorVoluntario: null, minVoluntarios: 0 })).toBe('')
  })
})

describe('cargarSalonVoluntarios', () => {
  it('calls the RPC with the salón, turno and fecha and reads the answer', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: crudo, error: null })
    const d = await cargarSalonVoluntarios({ rpc } as never, 's1', 't9', '2026-11-08')
    expect(rpc).toHaveBeenCalledWith('ninos_salon_voluntarios', { p_salon_id: 's1', p_turno_id: 't9', p_fecha: '2026-11-08' })
    expect(d?.asignados).toBe(5)
  })

  it('an RPC error is null', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'sin_autoridad' } })
    expect(await cargarSalonVoluntarios({ rpc } as never, 's1', 't9', '2026-11-08')).toBeNull()
  })
})

// ── planilla: the salón of each volunteer (L27) ──────────────────────

const crudoPlanilla = {
  salones: [
    { id: 's1', nombre: 'Maternal' },
    { id: 's2', nombre: 'Preescolar I' },
  ],
  asignaciones: [
    { servicio_id: 'v1', salon_id: 's1', salon: 'Maternal', habitual_id: 's1', es_del_dia: false },
    { servicio_id: 'v2', salon_id: null, salon: null, habitual_id: 's2', es_del_dia: true },
    { servicio_id: 'v3', salon_id: 's2', salon: 'Preescolar I', habitual_id: null, es_del_dia: true },
  ],
}

describe('leerSalonesPlanilla', () => {
  it('reads the salones and each volunteer’s salón; mesa is null', () => {
    const d = leerSalonesPlanilla(crudoPlanilla)
    expect(d?.salones).toEqual([
      { id: 's1', nombre: 'Maternal' },
      { id: 's2', nombre: 'Preescolar I' },
    ])
    expect(d?.porServicio.get('v1')).toEqual({ salonId: 's1', habitualId: 's1', esDelDia: false })
    expect(d?.porServicio.get('v2')).toEqual({ salonId: null, habitualId: 's2', esDelDia: true })
    expect(d?.porServicio.get('v9')).toBeUndefined()
  })

  it('is null for something else (the planilla JSON, an error body)', () => {
    expect(leerSalonesPlanilla({ voluntarios: [], areas: [] })).toBeNull()
    expect(leerSalonesPlanilla(null)).toBeNull()
  })

  it('the mesa option value is the empty string', () => {
    expect(MESA).toBe('')
  })
})

describe('asignarSalonVoluntario', () => {
  it('habitual: no turno nor fecha; mesa clears it (NULL)', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { salon_id: null }, error: null })
    const r = await asignarSalonVoluntario({ rpc } as never, { servicioId: 'v1', salonId: null })
    expect(rpc).toHaveBeenCalledWith('ninos_voluntario_salon_asignar', { p_servicio_id: 'v1', p_salon_id: null, p_turno_id: null, p_fecha: null })
    expect(r).toEqual({ ok: true })
  })

  it('solo hoy: with turno and fecha', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: {}, error: null })
    await asignarSalonVoluntario({ rpc } as never, { servicioId: 'v1', salonId: 's2', turnoId: 't9', fecha: '2026-11-08' })
    expect(rpc).toHaveBeenCalledWith('ninos_voluntario_salon_asignar', { p_servicio_id: 'v1', p_salon_id: 's2', p_turno_id: 't9', p_fecha: '2026-11-08' })
  })

  it('an error returns the HINT as is', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'salon_invalido', hint: 'El salón no existe o está desactivado.' } })
    expect(await asignarSalonVoluntario({ rpc } as never, { servicioId: 'v1', salonId: 's9' })).toEqual({
      ok: false,
      message: 'El salón no existe o está desactivado.',
    })
  })
})

describe('mensajeErrorSalon', () => {
  it('the HINT, else a plain sentence', () => {
    expect(mensajeErrorSalon({ message: 'sin_autoridad', hint: 'No tienes permiso para asignar el salón de este voluntario.' })).toBe(
      'No tienes permiso para asignar el salón de este voluntario.',
    )
    expect(mensajeErrorSalon({ message: 'boom' })).toBe('No se pudo guardar el salón. Inténtalo de nuevo.')
  })
})

describe('cargarSalonesPlanilla', () => {
  it('calls the read RPC; an error is null', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: crudoPlanilla, error: null })
    const d = await cargarSalonesPlanilla({ rpc } as never, 't9', '2026-11-08')
    expect(rpc).toHaveBeenCalledWith('ninos_voluntarios_salones', { p_turno_id: 't9', p_fecha: '2026-11-08' })
    expect(d?.salones).toHaveLength(2)
    rpc.mockResolvedValue({ data: null, error: { message: 'sin_autoridad' } })
    expect(await cargarSalonesPlanilla({ rpc } as never, 't9', '2026-11-08')).toBeNull()
  })
})
