/**
 * T8 (odd/tasks/uno-a-uno.md) — the pure rules of the supervision table:
 * accent-insensitive search, the filters and their AND (S8.2), the counters
 * (S8.1), the sorting with the RPC order as default (S8.3) and the recent
 * 1:1s filters (S8.5). T9: the Dirección → Área → Equipo o grupo filters
 * over each leader's places, their options and their cascade (S9.1, S9.2).
 */

import {
  FILTROS_LIDERES_VACIOS,
  FILTROS_RECIENTES_VACIOS,
  contadoresLideres,
  coincideTexto,
  filtrarLideres,
  filtrarRecientes,
  hayFiltrosLideres,
  opcionesUbicacion,
  ordenarLideres,
  parcheElegirArea,
  parcheElegirDireccion,
  parcheElegirEquipo,
  siguienteOrden,
  type FiltrosLideres,
} from '@/lib/uno-a-uno/supervision'
import type { LiderSupervisado, UbicacionLider, UnoAUnoSupervisado } from '@/lib/uno-a-uno/vista'

const GDV = { direccionId: 'd-gdv', direccion: 'Dirección de Grupos de Vida' }
const EXPERIENCIA = { direccionId: 'd-exp', direccion: 'Dirección de Experiencia' }
const NORTE: UbicacionLider = { ...GDV, areaId: 'a-adu', area: 'Adultos', equipoId: 'g-norte', equipo: 'Norte' }
const JOVENES: UbicacionLider = { ...GDV, areaId: 'a-jov', area: 'Jóvenes', equipoId: null, equipo: null }
const SONIDO: UbicacionLider = { ...EXPERIENCIA, areaId: 'a-prod', area: 'Producción', equipoId: 'e-sonido', equipo: 'Sonido' }
const ALABANZA: UbicacionLider = { ...EXPERIENCIA, areaId: 'a-alab', area: 'Alabanza', equipoId: null, equipo: null }

function lider(over: Partial<LiderSupervisado>): LiderSupervisado {
  return {
    usuarioId: 'l-1',
    nombre: 'Ana',
    apellido: 'Pérez',
    contextos: ['GDV: Norte'],
    dirigidos: 3,
    realizados: 2,
    agendados: 1,
    ultimoRealizado: '2026-10-20T19:30:00Z',
    ubicaciones: [NORTE],
    ...over,
  }
}

const pedro = lider({ usuarioId: 'l-2', nombre: 'Pedro', apellido: 'Ruiz', realizados: 0, agendados: 0, ultimoRealizado: null, dirigidos: 5 })
const jose = lider({
  usuarioId: 'l-3',
  nombre: 'José',
  apellido: 'Álvarez',
  contextos: ['Dream Team: Sonido'],
  realizados: 0,
  agendados: 2,
  ultimoRealizado: '2026-08-01T12:00:00Z',
  dirigidos: 1,
  ubicaciones: [SONIDO],
})
// Two places in two direcciones: she shows under both.
const ana = lider({ usuarioId: 'l-1', contextos: ['GDV: Norte', 'Dream Team: Alabanza'], ubicaciones: [NORTE, ALABANZA] })
const marta = lider({
  usuarioId: 'l-4',
  nombre: 'Marta',
  apellido: null,
  contextos: ['Director de etapa: Jóvenes'],
  realizados: 4,
  agendados: 0,
  ultimoRealizado: '2026-10-22T12:00:00Z',
  dirigidos: 8,
  ubicaciones: [JOVENES],
})
// The RPC order: longest without a 1:1 first, "Nunca" first.
const LIDERES = [pedro, jose, ana, marta]

const ids = (lista: readonly LiderSupervisado[]): string[] => lista.map((l) => l.usuarioId)
const filtros = (over: Partial<FiltrosLideres>): FiltrosLideres => ({ ...FILTROS_LIDERES_VACIOS, ...over })
const idsDeOpciones = (opciones: readonly { id: string }[]): string[] => opciones.map((o) => o.id)

describe('opcionesUbicacion (S9.1)', () => {
  it('offers every dirección of the loaded places once, sorted by label', () => {
    expect(opcionesUbicacion(LIDERES, FILTROS_LIDERES_VACIOS).direcciones).toEqual([
      { id: 'd-exp', label: 'Dirección de Experiencia' },
      { id: 'd-gdv', label: 'Dirección de Grupos de Vida' },
    ])
  })

  it('offers no área until a dirección is chosen, then only that dirección\'s áreas, sorted', () => {
    expect(opcionesUbicacion(LIDERES, FILTROS_LIDERES_VACIOS).areas).toEqual([])
    expect(opcionesUbicacion(LIDERES, filtros({ direccion: 'd-exp' })).areas).toEqual([
      { id: 'a-alab', label: 'Alabanza', direccionId: 'd-exp' },
      { id: 'a-prod', label: 'Producción', direccionId: 'd-exp' },
    ])
    expect(idsDeOpciones(opcionesUbicacion(LIDERES, filtros({ direccion: 'd-gdv' })).areas)).toEqual(['a-adu', 'a-jov'])
  })

  it('offers every equipo without a dirección, and narrows them to the dirección and then the área', () => {
    expect(opcionesUbicacion(LIDERES, FILTROS_LIDERES_VACIOS).equipos).toEqual([
      { id: 'g-norte', label: 'Norte', direccionId: 'd-gdv', areaId: 'a-adu' },
      { id: 'e-sonido', label: 'Sonido', direccionId: 'd-exp', areaId: 'a-prod' },
    ])
    expect(idsDeOpciones(opcionesUbicacion(LIDERES, filtros({ direccion: 'd-gdv' })).equipos)).toEqual(['g-norte'])
    expect(idsDeOpciones(opcionesUbicacion(LIDERES, filtros({ direccion: 'd-exp', area: 'a-alab' })).equipos)).toEqual([])
    expect(idsDeOpciones(opcionesUbicacion(LIDERES, filtros({ direccion: 'd-exp', area: 'a-prod' })).equipos)).toEqual([
      'e-sonido',
    ])
  })

  it('has no options for leaders without places', () => {
    expect(opcionesUbicacion([lider({ ubicaciones: [] })], FILTROS_LIDERES_VACIOS)).toEqual({
      direcciones: [],
      areas: [],
      equipos: [],
    })
  })
})

describe('cascade of the place filters (S9.1)', () => {
  const opciones = opcionesUbicacion(LIDERES, FILTROS_LIDERES_VACIOS)
  const areasExperiencia = opcionesUbicacion(LIDERES, filtros({ direccion: 'd-exp' })).areas

  it('choosing a dirección clears the área and the equipo', () => {
    expect(parcheElegirDireccion('d-gdv')).toEqual({ direccion: 'd-gdv', area: null, equipo: null })
    expect(parcheElegirDireccion(null)).toEqual({ direccion: null, area: null, equipo: null })
  })

  it('choosing an área clears the equipo and sets its dirección', () => {
    expect(parcheElegirArea('a-prod', areasExperiencia)).toEqual({ area: 'a-prod', equipo: null, direccion: 'd-exp' })
    expect(parcheElegirArea(null, areasExperiencia)).toEqual({ area: null, equipo: null })
  })

  it('choosing an equipo sets its área and its dirección', () => {
    expect(parcheElegirEquipo('g-norte', opciones.equipos)).toEqual({ equipo: 'g-norte', area: 'a-adu', direccion: 'd-gdv' })
    expect(parcheElegirEquipo(null, opciones.equipos)).toEqual({ equipo: null })
  })
})

describe('coincideTexto', () => {
  it('ignores case and accents on both sides', () => {
    expect(coincideTexto('José Álvarez', 'jose alv')).toBe(true)
    expect(coincideTexto('Jose Alvarez', 'JOSÉ')).toBe(true)
    expect(coincideTexto('Ana Pérez', 'ruiz')).toBe(false)
  })

  it('matches everything with an empty or blank query', () => {
    expect(coincideTexto('Ana', '   ')).toBe(true)
  })
})

describe('filtrarLideres (S8.2)', () => {
  it('returns every leader in the same order without filters', () => {
    expect(ids(filtrarLideres(LIDERES, FILTROS_LIDERES_VACIOS))).toEqual(['l-2', 'l-3', 'l-1', 'l-4'])
  })

  it('searches the full name ignoring case and accents', () => {
    expect(ids(filtrarLideres(LIDERES, filtros({ q: 'jose alvarez' })))).toEqual(['l-3'])
    expect(ids(filtrarLideres(LIDERES, filtros({ q: 'PEREZ' })))).toEqual(['l-1'])
  })

  it('filters by dirección, a leader with places in two direcciones showing under both', () => {
    expect(ids(filtrarLideres(LIDERES, filtros({ direccion: 'd-gdv' })))).toEqual(['l-2', 'l-1', 'l-4'])
    expect(ids(filtrarLideres(LIDERES, filtros({ direccion: 'd-exp' })))).toEqual(['l-3', 'l-1'])
  })

  it('filters by área and by equipo o grupo', () => {
    expect(ids(filtrarLideres(LIDERES, filtros({ direccion: 'd-exp', area: 'a-alab' })))).toEqual(['l-1'])
    expect(ids(filtrarLideres(LIDERES, filtros({ direccion: 'd-gdv', area: 'a-jov' })))).toEqual(['l-4'])
    expect(ids(filtrarLideres(LIDERES, filtros({ direccion: 'd-gdv', area: 'a-adu', equipo: 'g-norte' })))).toEqual([
      'l-2',
      'l-1',
    ])
  })

  it('needs one single place to match the dirección, the área and the equipo together', () => {
    expect(filtrarLideres([ana], filtros({ direccion: 'd-gdv', area: 'a-alab' }))).toEqual([])
  })

  it('leaves out a leader without places once a place filter is on', () => {
    const sinLugar = lider({ usuarioId: 'l-9', ubicaciones: [] })
    expect(ids(filtrarLideres([sinLugar], FILTROS_LIDERES_VACIOS))).toEqual(['l-9'])
    expect(filtrarLideres([sinLugar], filtros({ direccion: 'd-gdv' }))).toEqual([])
  })

  it('filters by estado', () => {
    expect(ids(filtrarLideres(LIDERES, filtros({ estado: 'sin_uno_a_uno' })))).toEqual(['l-2', 'l-3'])
    expect(ids(filtrarLideres(LIDERES, filtros({ estado: 'al_dia' })))).toEqual(['l-1', 'l-4'])
    expect(ids(filtrarLideres(LIDERES, filtros({ estado: 'con_agendados' })))).toEqual(['l-3', 'l-1'])
  })

  it('combines the filters with AND', () => {
    expect(ids(filtrarLideres(LIDERES, filtros({ direccion: 'd-gdv', estado: 'sin_uno_a_uno' })))).toEqual(['l-2'])
    expect(ids(filtrarLideres(LIDERES, filtros({ direccion: 'd-exp', estado: 'con_agendados', q: 'ana' })))).toEqual([
      'l-1',
    ])
    expect(filtrarLideres(LIDERES, filtros({ equipo: 'e-sonido', estado: 'al_dia' }))).toEqual([])
  })
})

describe('hayFiltrosLideres', () => {
  it('is false only when every filter is empty', () => {
    expect(hayFiltrosLideres(FILTROS_LIDERES_VACIOS)).toBe(false)
    expect(hayFiltrosLideres(filtros({ q: '  ' }))).toBe(false)
    expect(hayFiltrosLideres(filtros({ q: 'a' }))).toBe(true)
    expect(hayFiltrosLideres(filtros({ estado: 'al_dia' }))).toBe(true)
    expect(hayFiltrosLideres(filtros({ direccion: 'd-gdv' }))).toBe(true)
    expect(hayFiltrosLideres(filtros({ area: 'a-adu' }))).toBe(true)
    expect(hayFiltrosLideres(filtros({ equipo: 'g-norte' }))).toBe(true)
  })
})

describe('contadoresLideres (S8.1)', () => {
  it('counts every leader, those without realizados and those with some', () => {
    expect(contadoresLideres(LIDERES)).toEqual({ total: 4, sinUnoAUno: 2, alDia: 2 })
    expect(contadoresLideres([])).toEqual({ total: 0, sinUnoAUno: 0, alDia: 0 })
  })
})

describe('ordenarLideres (S8.3)', () => {
  it('keeps the RPC order without a chosen column', () => {
    expect(ids(ordenarLideres(LIDERES, null))).toEqual(['l-2', 'l-3', 'l-1', 'l-4'])
  })

  it.each([
    ['lider', ['l-1', 'l-3', 'l-4', 'l-2']],
    ['contextos', ['l-4', 'l-3', 'l-2', 'l-1']],
    ['dirigidos', ['l-3', 'l-1', 'l-2', 'l-4']],
    ['realizados', ['l-2', 'l-3', 'l-1', 'l-4']],
    ['agendados', ['l-2', 'l-4', 'l-1', 'l-3']],
    ['ultimo', ['l-2', 'l-3', 'l-1', 'l-4']],
  ] as const)('sorts by %s ascending and descending', (columna, ascendente) => {
    expect(ids(ordenarLideres(LIDERES, { columna, sentido: 'asc' }))).toEqual(ascendente)
    const descendente = ids(ordenarLideres(LIDERES, { columna, sentido: 'desc' }))
    if (columna === 'realizados' || columna === 'agendados') {
      // Ties keep the RPC order in both directions.
      expect(descendente).toEqual(columna === 'realizados' ? ['l-4', 'l-1', 'l-2', 'l-3'] : ['l-3', 'l-1', 'l-2', 'l-4'])
    } else {
      expect(descendente).toEqual([...ascendente].reverse())
    }
  })

  it('keeps the RPC order between leaders who never had a 1:1', () => {
    const nunca = [pedro, lider({ usuarioId: 'l-6', ultimoRealizado: null }), lider({ usuarioId: 'l-7', ultimoRealizado: null })]
    expect(ids(ordenarLideres([...nunca, ana], { columna: 'ultimo', sentido: 'asc' }))).toEqual(['l-2', 'l-6', 'l-7', 'l-1'])
    expect(ids(ordenarLideres([ana, ...nunca], { columna: 'ultimo', sentido: 'desc' }))).toEqual(['l-1', 'l-2', 'l-6', 'l-7'])
  })

  it('does not change the list it receives', () => {
    const copia = [...LIDERES]
    ordenarLideres(LIDERES, { columna: 'lider', sentido: 'asc' })
    expect(LIDERES).toEqual(copia)
  })
})

describe('siguienteOrden (S8.3)', () => {
  it('sorts a new column ascending and toggles the same column', () => {
    expect(siguienteOrden(null, 'dirigidos')).toEqual({ columna: 'dirigidos', sentido: 'asc' })
    expect(siguienteOrden({ columna: 'dirigidos', sentido: 'asc' }, 'dirigidos')).toEqual({
      columna: 'dirigidos',
      sentido: 'desc',
    })
    expect(siguienteOrden({ columna: 'dirigidos', sentido: 'desc' }, 'dirigidos')).toEqual({
      columna: 'dirigidos',
      sentido: 'asc',
    })
    expect(siguienteOrden({ columna: 'dirigidos', sentido: 'desc' }, 'lider')).toEqual({ columna: 'lider', sentido: 'asc' })
  })
})

describe('filtrarRecientes (S8.5)', () => {
  const persona = (id: string, nombre: string, apellido: string) => ({ id, nombre, apellido })
  function reciente(over: Partial<UnoAUnoSupervisado>): UnoAUnoSupervisado {
    return {
      id: 's-1',
      estado: 'realizado',
      fechaHora: '2026-10-20T19:30:00Z',
      lugar: null,
      lideres: [persona('l-1', 'Ana', 'Pérez')],
      dirigidos: [persona('d-1', 'Luis', 'Gómez')],
      resumen: null,
      celebracion: null,
      motivoCancelacion: null,
      ...over,
    }
  }
  const RECIENTES = [
    reciente({ id: 's-1' }),
    reciente({ id: 's-2', estado: 'agendado', dirigidos: [persona('d-2', 'Íñigo', 'Núñez')] }),
    reciente({ id: 's-3', estado: 'cancelado', lideres: [persona('l-2', 'Pedro', 'Ruiz')] }),
  ]
  const idsDe = (lista: readonly UnoAUnoSupervisado[]) => lista.map((u) => u.id)

  it('returns every 1:1 in the same order without filters', () => {
    expect(idsDe(filtrarRecientes(RECIENTES, FILTROS_RECIENTES_VACIOS))).toEqual(['s-1', 's-2', 's-3'])
  })

  it('filters by estado', () => {
    expect(idsDe(filtrarRecientes(RECIENTES, { q: '', estado: 'agendado' }))).toEqual(['s-2'])
    expect(idsDe(filtrarRecientes(RECIENTES, { q: '', estado: 'cancelado' }))).toEqual(['s-3'])
  })

  it('searches the leaders and the dirigidos ignoring accents, combined with the estado', () => {
    expect(idsDe(filtrarRecientes(RECIENTES, { q: 'inigo nunez', estado: null }))).toEqual(['s-2'])
    expect(idsDe(filtrarRecientes(RECIENTES, { q: 'pedro', estado: null }))).toEqual(['s-3'])
    expect(idsDe(filtrarRecientes(RECIENTES, { q: 'perez', estado: 'realizado' }))).toEqual(['s-1'])
  })
})
