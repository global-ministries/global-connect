/**
 * Pendientes — the pure view model of /dream-team/pendientes
 * (odd/tasks/dream-team-pendientes-director.md, T4, S4, S6): which groups each
 * metric filter leaves, the URL value of the filter, the ficha list per tipo
 * (one row per person with everything their ficha lacks) and the labels.
 */
import { mapFilasPendientes } from '@/lib/platform/dream-team/pendientes'
import {
  etiquetaFalta,
  fichasDeTipo,
  leerGrupoPendientes,
  subtituloEquipo,
  tipoVisible,
} from '@/lib/platform/dream-team/pendientes-vista'

const fila = (tipo: string, persona: string | null, extra: Record<string, unknown> = {}) => ({
  tipo,
  persona_id: persona,
  persona_nombre: persona ? `Nombre ${persona}` : null,
  equipo_id: 'eq-1',
  equipo_ruta: 'DPS › Atención al Invitado › Anfitriones',
  ficha_editable: true,
  ...extra,
})

const FILAS = mapFilasPendientes([
  fila('area_sin_servidores', null, { detalle: { por_activar: 1 } }),
  fila('sin_cedula', 'p1'),
  fila('sin_cedula', 'p2', { ficha_editable: false }),
  fila('fecha_nacimiento', 'p1', { detalle: { motivo: 'marcador_1900' } }),
  fila('sin_telefono', 'p3'),
  fila('genero_estado_civil', 'p1', { detalle: { campos: ['estado_civil'] } }),
  fila('sin_turno', 'p1', { servicio_id: 's1', servicio_estado: 'activo', servicio_version: 2 }),
])

describe('leerGrupoPendientes', () => {
  it('reads the four metric filters from the URL and nothing else', () => {
    expect(leerGrupoPendientes('puestos')).toBe('puestos')
    expect(leerGrupoPendientes('fichas')).toBe('fichas')
    expect(leerGrupoPendientes('cuenta')).toBe('cuenta')
    expect(leerGrupoPendientes(['turno'])).toBe('turno')
    expect(leerGrupoPendientes('sin_cedula')).toBeNull()
    expect(leerGrupoPendientes(undefined)).toBeNull()
  })
})

describe('tipoVisible', () => {
  it('shows every tipo without a filter', () => {
    expect(tipoVisible('solicitud_cambio_area', null)).toBe(true)
    expect(tipoVisible('por_activar', null)).toBe(true)
  })

  it('leaves only the tipos of the pressed metric', () => {
    expect(tipoVisible('area_sin_servidores', 'puestos')).toBe(true)
    expect(tipoVisible('sin_cedula', 'puestos')).toBe(false)
    expect(tipoVisible('sin_cedula', 'fichas')).toBe(true)
    expect(tipoVisible('genero_estado_civil', 'fichas')).toBe(true)
    expect(tipoVisible('sin_cuenta', 'cuenta')).toBe(true)
    expect(tipoVisible('invitacion_vencida', 'cuenta')).toBe(true)
    expect(tipoVisible('sin_turno', 'turno')).toBe(true)
    expect(tipoVisible('solicitud_cambio_area', 'turno')).toBe(false)
    expect(tipoVisible('por_activar', 'fichas')).toBe(false)
  })
})

describe('fichasDeTipo', () => {
  it('lists the people of one ficha tipo with every ficha gap they have, that tipo first', () => {
    expect(fichasDeTipo(FILAS, 'sin_cedula')).toEqual([
      {
        personaId: 'p1',
        nombre: 'Nombre p1',
        equipoRuta: ['DPS', 'Atención al Invitado', 'Anfitriones'],
        editable: true,
        faltas: ['Sin cédula', 'Nació en 1900', 'Estado civil sin especificar'],
      },
      {
        personaId: 'p2',
        nombre: 'Nombre p2',
        equipoRuta: ['DPS', 'Atención al Invitado', 'Anfitriones'],
        editable: false,
        faltas: ['Sin cédula'],
      },
    ])
    expect(fichasDeTipo(FILAS, 'fecha_nacimiento').map((p) => p.faltas)).toEqual([
      ['Nació en 1900', 'Sin cédula', 'Estado civil sin especificar'],
    ])
    expect(fichasDeTipo(FILAS, 'sin_telefono').map((p) => p.personaId)).toEqual(['p3'])
  })
})

describe('labels', () => {
  it('names each birth-date reason and the unspecified fields', () => {
    const [f1900] = FILAS.filter((f) => f.tipo === 'fecha_nacimiento')
    expect(etiquetaFalta(f1900)).toBe('Nació en 1900')
    const otras = mapFilasPendientes([
      fila('fecha_nacimiento', 'a', { detalle: { motivo: 'falta' } }),
      fila('fecha_nacimiento', 'b', { detalle: { motivo: 'futura' } }),
      fila('fecha_nacimiento', 'c', { detalle: { motivo: 'anterior_1910' } }),
      fila('genero_estado_civil', 'd', { detalle: { campos: ['genero', 'estado_civil'] } }),
      fila('genero_estado_civil', 'e', { detalle: { campos: ['genero'] } }),
      fila('sin_telefono', 'f'),
    ])
    expect(otras.map(etiquetaFalta)).toEqual([
      'Sin fecha de nacimiento',
      'Fecha de nacimiento futura',
      'Fecha anterior a 1910',
      'Género y estado civil sin especificar',
      'Género sin especificar',
      'Sin teléfono',
    ])
  })

  it('reads the equipo first, then its área, as the artboard', () => {
    expect(subtituloEquipo(['DPS', 'Atención al Invitado', 'Anfitriones'])).toBe('Anfitriones · Atención al Invitado')
    expect(subtituloEquipo(['DPS'])).toBe('DPS')
    expect(subtituloEquipo([])).toBe('')
  })
})
