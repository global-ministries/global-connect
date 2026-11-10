/**
 * T1 (odd/tasks/proximo-paso.md, S1) — the client-side mirror of
 * talleres_crear_edicion's anchored branch, used by the "Crear edición"
 * preview: a first-Sunday check and the first Sundays of the following
 * months. The DB stays the authority; these only shape what the form shows.
 */

import {
  esPrimerDomingoDelMes,
  fechasEdicionesAncladas,
} from '@/lib/platform/talleres/ancla-ediciones'

describe('esPrimerDomingoDelMes', () => {
  it.each(['2026-10-04', '2026-11-01', '2026-12-06', '2027-01-03', '2027-02-07'])('accepts %s', (fecha) => {
    expect(esPrimerDomingoDelMes(fecha)).toBe(true)
  })

  it.each([
    ['2026-10-11', 'a second Sunday'],
    ['2026-10-03', 'a Saturday in the first week'],
    ['2026-11-29', 'a fifth Sunday'],
    ['2026-10-05', 'a Monday'],
  ])('refuses %s (%s)', (fecha) => {
    expect(esPrimerDomingoDelMes(fecha)).toBe(false)
  })

  it('refuses an empty or malformed value', () => {
    expect(esPrimerDomingoDelMes('')).toBe(false)
    expect(esPrimerDomingoDelMes('no-es-fecha')).toBe(false)
  })
})

describe('fechasEdicionesAncladas', () => {
  it('returns one first Sunday per month, starting with the chosen one', () => {
    expect(fechasEdicionesAncladas('2026-10-04', 3)).toEqual([
      '2026-10-04',
      '2026-11-01',
      '2026-12-06',
      '2027-01-03',
    ])
  })

  it('returns only the chosen date with adelantar 0', () => {
    expect(fechasEdicionesAncladas('2026-12-06', 0)).toEqual(['2026-12-06'])
  })

  it('crosses the year boundary', () => {
    expect(fechasEdicionesAncladas('2026-12-06', 2)).toEqual(['2026-12-06', '2027-01-03', '2027-02-07'])
  })
})
