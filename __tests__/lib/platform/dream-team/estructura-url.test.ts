/**
 * Estructura keeps its state in the URL (S12): the open node, the search, the
 * problem pill, the page tab and, optionally, the open branches. Defaults are
 * left out, invalid values are dropped and the legacy `?equipo=` keeps working.
 */
import {
  FILTROS_ESTRUCTURA,
  escribirFiltrosEstructura,
  leerFiltrosEstructura,
  type FiltrosEstructura,
} from '@/lib/platform/dream-team/estructura-organigrama'

describe('Estructura URL codec', () => {
  it('writes nothing for the defaults and reads an empty query as the defaults', () => {
    expect(escribirFiltrosEstructura(FILTROS_ESTRUCTURA)).toBe('')
    expect(leerFiltrosEstructura(new URLSearchParams(''))).toEqual(FILTROS_ESTRUCTURA)
  })

  it('round-trips every field', () => {
    const filtros: FiltrosEstructura = {
      equipo: 'eq-dhah',
      q: 'maría',
      problema: 'sin_turno',
      tab: 'turnos',
      expandidos: ['dir-conexion', 'gcp'],
    }
    const query = escribirFiltrosEstructura(filtros)
    expect(query).toBe('equipo=eq-dhah&q=mar%C3%ADa&problema=sin_turno&tab=turnos&expandidos=dir-conexion%2Cgcp')
    expect(leerFiltrosEstructura(new URLSearchParams(query))).toEqual(filtros)
  })

  it('keeps the legacy ?equipo= link working, also from a page searchParams record', () => {
    expect(leerFiltrosEstructura(new URLSearchParams('equipo=abc'))).toEqual({ ...FILTROS_ESTRUCTURA, equipo: 'abc' })
    expect(leerFiltrosEstructura({ equipo: ['abc', 'def'] })).toEqual({ ...FILTROS_ESTRUCTURA, equipo: 'abc' })
  })

  it('drops invalid values', () => {
    expect(leerFiltrosEstructura(new URLSearchParams('equipo=%20&problema=otro&tab=nada&q=%20'))).toEqual(FILTROS_ESTRUCTURA)
  })

  it('tells "everything folded" apart from "the default branches"', () => {
    const plegado = { ...FILTROS_ESTRUCTURA, expandidos: [] }
    expect(escribirFiltrosEstructura(plegado)).toBe('expandidos=')
    expect(leerFiltrosEstructura(new URLSearchParams('expandidos='))).toEqual(plegado)
    expect(leerFiltrosEstructura(new URLSearchParams('expandidos=a,,b,a'))).toEqual({ ...FILTROS_ESTRUCTURA, expandidos: ['a', 'b'] })
  })
})
