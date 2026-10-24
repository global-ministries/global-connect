/**
 * T8 (odd/tasks/uno-a-uno.md) — the pure rules of the supervision table:
 * área and grupo from `contextos` (S8.2), accent-insensitive search, the
 * filters and their AND (S8.2), the counters (S8.1), the sorting with the
 * RPC order as default (S8.3) and the recent 1:1s filters (S8.5).
 */

import {
  FILTROS_LIDERES_VACIOS,
  FILTROS_RECIENTES_VACIOS,
  areaDeContexto,
  contadoresLideres,
  coincideTexto,
  filtrarLideres,
  filtrarRecientes,
  grupoDeContexto,
  hayFiltrosLideres,
  opcionesGrupo,
  ordenarLideres,
  siguienteOrden,
  type FiltrosLideres,
} from '@/lib/uno-a-uno/supervision'
import type { LiderSupervisado, UnoAUnoSupervisado } from '@/lib/uno-a-uno/vista'

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
})
const ana = lider({ usuarioId: 'l-1', contextos: ['GDV: Norte', 'Dream Team: Alabanza'] })
const marta = lider({
  usuarioId: 'l-4',
  nombre: 'Marta',
  apellido: null,
  contextos: ['Director de etapa: Jóvenes'],
  realizados: 4,
  agendados: 0,
  ultimoRealizado: '2026-10-22T12:00:00Z',
  dirigidos: 8,
})
// The RPC order: longest without a 1:1 first, "Nunca" first.
const LIDERES = [pedro, jose, ana, marta]

const ids = (lista: readonly LiderSupervisado[]): string[] => lista.map((l) => l.usuarioId)
const filtros = (over: Partial<FiltrosLideres>): FiltrosLideres => ({ ...FILTROS_LIDERES_VACIOS, ...over })

describe('areaDeContexto / grupoDeContexto (S8.2)', () => {
  it.each([
    ['GDV: Norte', 'gdv', 'Norte'],
    ['Director de etapa: Jóvenes', 'gdv', 'Jóvenes'],
    ['Director general: Caracas', 'gdv', 'Caracas'],
    ['Dream Team: Sonido', 'dream_team', 'Sonido'],
  ])('%s → área %s, grupo %s', (contexto, area, grupo) => {
    expect(areaDeContexto(contexto)).toBe(area)
    expect(grupoDeContexto(contexto)).toBe(grupo)
  })

  it('has no área for an unknown prefix and keeps the whole text as grupo', () => {
    expect(areaDeContexto('Otro')).toBeNull()
    expect(grupoDeContexto('Otro')).toBe('Otro')
  })
})

describe('opcionesGrupo (S8.2)', () => {
  it('lists every grupo or equipo of the loaded leaders once, without prefix, sorted', () => {
    expect(opcionesGrupo([...LIDERES, lider({ usuarioId: 'l-5', contextos: ['GDV: Norte'] })])).toEqual([
      'Alabanza',
      'Jóvenes',
      'Norte',
      'Sonido',
    ])
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

  it('filters by área, a leader with both areas showing under both', () => {
    expect(ids(filtrarLideres(LIDERES, filtros({ area: 'gdv' })))).toEqual(['l-2', 'l-1', 'l-4'])
    expect(ids(filtrarLideres(LIDERES, filtros({ area: 'dream_team' })))).toEqual(['l-3', 'l-1'])
  })

  it('filters by grupo or equipo', () => {
    expect(ids(filtrarLideres(LIDERES, filtros({ grupo: 'Norte' })))).toEqual(['l-2', 'l-1'])
    expect(ids(filtrarLideres(LIDERES, filtros({ grupo: 'Jóvenes' })))).toEqual(['l-4'])
  })

  it('filters by estado', () => {
    expect(ids(filtrarLideres(LIDERES, filtros({ estado: 'sin_uno_a_uno' })))).toEqual(['l-2', 'l-3'])
    expect(ids(filtrarLideres(LIDERES, filtros({ estado: 'al_dia' })))).toEqual(['l-1', 'l-4'])
    expect(ids(filtrarLideres(LIDERES, filtros({ estado: 'con_agendados' })))).toEqual(['l-3', 'l-1'])
  })

  it('combines the filters with AND', () => {
    expect(ids(filtrarLideres(LIDERES, filtros({ area: 'gdv', estado: 'sin_uno_a_uno' })))).toEqual(['l-2'])
    expect(ids(filtrarLideres(LIDERES, filtros({ area: 'dream_team', estado: 'con_agendados', q: 'ana' })))).toEqual([
      'l-1',
    ])
    expect(filtrarLideres(LIDERES, filtros({ grupo: 'Sonido', estado: 'al_dia' }))).toEqual([])
  })
})

describe('hayFiltrosLideres', () => {
  it('is false only when every filter is empty', () => {
    expect(hayFiltrosLideres(FILTROS_LIDERES_VACIOS)).toBe(false)
    expect(hayFiltrosLideres(filtros({ q: '  ' }))).toBe(false)
    expect(hayFiltrosLideres(filtros({ q: 'a' }))).toBe(true)
    expect(hayFiltrosLideres(filtros({ estado: 'al_dia' }))).toBe(true)
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
