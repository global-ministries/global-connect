import {
  alertasDeHijo,
  armarCheckin,
  avisosDeCapacidad,
  fechaServicioPorDefecto,
  mensajeDeErrorCheckin,
  preferidosAGuardar,
  resolverServicio,
  type TurnoFila,
} from '@/lib/platform/ninos/checkin'

const turnos: TurnoFila[] = [
  { id: 't11', nombre: 'Domingo 11:00', hora: '11:00:00', orden: 2 },
  { id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1 },
]

describe('fechaServicioPorDefecto', () => {
  it('is today on a Sunday', () => {
    expect(fechaServicioPorDefecto('2026-10-11')).toBe('2026-10-11')
  })
  it('is the coming Sunday otherwise', () => {
    expect(fechaServicioPorDefecto('2026-10-08')).toBe('2026-10-11')
    expect(fechaServicioPorDefecto('2026-10-12')).toBe('2026-10-18')
  })
})

describe('resolverServicio', () => {
  it('uses the query when valid', () => {
    expect(resolverServicio({ turno: 't11', fecha: '2026-10-18' }, turnos, '2026-10-08')).toEqual({ turnoId: 't11', fecha: '2026-10-18' })
  })
  it('falls back to the first turno by orden and the default date', () => {
    expect(resolverServicio({ turno: 'nope', fecha: '2026-13-40' }, turnos, '2026-10-08')).toEqual({ turnoId: 't9', fecha: '2026-10-11' })
  })
  it('has no turno when the campus has none', () => {
    expect(resolverServicio({}, [], '2026-10-08')).toEqual({ turnoId: null, fecha: '2026-10-11' })
  })
})

describe('armarCheckin', () => {
  it('aligns the children with their rooms', () => {
    expect(armarCheckin([{ ninoId: 'a', salonId: 's1' }, { ninoId: 'b', salonId: 's2' }])).toEqual({
      ok: true,
      ninoIds: ['a', 'b'],
      salonIds: ['s1', 's2'],
    })
  })
  it('refuses an empty selection', () => {
    expect(armarCheckin([])).toEqual({ ok: false, error: 'Elige al menos un niño.' })
  })
  it('refuses a child without a room (D4)', () => {
    expect(armarCheckin([{ ninoId: 'a', salonId: null, nombre: 'Luis' }])).toEqual({
      ok: false,
      error: 'Luis no tiene salón: asígnalo antes de registrar.',
    })
  })
})

describe('avisosDeCapacidad', () => {
  it('lists every room over capacity once', () => {
    expect(
      avisosDeCapacidad(
        [
          { salon_id: 's1', ocupacion: 21, capacidad: 20, sobre_capacidad: true },
          { salon_id: 's1', ocupacion: 21, capacidad: 20, sobre_capacidad: true },
          { salon_id: 's2', ocupacion: 3, capacidad: 20, sobre_capacidad: false },
        ],
        { s1: 'Maternal' },
      ),
    ).toEqual(['Salón lleno: Maternal 21/20'])
  })
})

describe('mensajeDeErrorCheckin', () => {
  it('maps the duplicate check-in', () => {
    expect(mensajeDeErrorCheckin({ code: '23505', message: 'x' })).toBe('Uno de los niños ya ingresó en este servicio.')
  })
  it('maps missing authority', () => {
    expect(mensajeDeErrorCheckin({ code: '42501', message: 'x' })).toBe('No tienes permiso para registrar ingresos en ese salón.')
  })
})

describe('alertasDeHijo', () => {
  it('lists what the room must know', () => {
    expect(
      alertasDeHijo({
        alergias: 'maní',
        necesidades_especiales: 'TEA',
        cambio_panal: true,
        puede_comer: false,
        autoriza_imagen: false,
      }),
    ).toEqual(['Alergias: maní', 'Necesidades especiales: TEA', 'Cambio de pañal', 'No puede comer merienda', 'Sin fotos'])
  })
  it('is empty when nothing applies', () => {
    expect(alertasDeHijo({ alergias: null, necesidades_especiales: null, cambio_panal: null, puede_comer: true, autoriza_imagen: null })).toEqual([])
  })
})

describe('preferidosAGuardar', () => {
  it('keeps only the rooms that differ from the suggestion', () => {
    expect(
      preferidosAGuardar([
        { ninoId: 'h1', salonId: 's1', sugeridoId: 's1' },
        { ninoId: 'h2', salonId: 's2', sugeridoId: 's1' },
        { ninoId: 'h3', salonId: 's3', sugeridoId: null },
      ]),
    ).toEqual([
      { ninoId: 'h2', salonId: 's2' },
      { ninoId: 'h3', salonId: 's3' },
    ])
  })
})
