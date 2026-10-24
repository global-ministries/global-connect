/**
 * T7 (odd/tasks/uno-a-uno.md), S7.5 — the "Mis 1 a 1" menu entry: whoever
 * leads someone, supervises or takes part in a 1:1, from uno_a_uno_acceso().
 * Fails closed: any error or unexpected payload means no access.
 */

import { parsearAccesoUnoAUno, SIN_ACCESO_UNO_A_UNO, veMisUnoAUno } from '@/lib/uno-a-uno/acceso'

describe('parsearAccesoUnoAUno', () => {
  it('reads the three flags', () => {
    expect(
      parsearAccesoUnoAUno({ data: { lidera: true, supervisa: false, participa: true }, error: null }),
    ).toEqual({ lidera: true, supervisa: false, participa: true })
  })

  it.each([
    ['an error', { data: { lidera: true, supervisa: true, participa: true }, error: { message: 'boom' } }],
    ['null data', { data: null, error: null }],
    ['a string', { data: 'true', error: null }],
    ['no result', null],
  ])('fails closed on %s', (_caso, resultado) => {
    expect(parsearAccesoUnoAUno(resultado)).toEqual(SIN_ACCESO_UNO_A_UNO)
  })

  it('takes only real booleans', () => {
    expect(parsearAccesoUnoAUno({ data: { lidera: 'true', supervisa: 1, participa: true }, error: null })).toEqual({
      lidera: false,
      supervisa: false,
      participa: true,
    })
  })
})

describe('veMisUnoAUno', () => {
  it.each(['lidera', 'supervisa', 'participa'] as const)('is true when the user %s', (flag) => {
    expect(veMisUnoAUno({ ...SIN_ACCESO_UNO_A_UNO, [flag]: true })).toBe(true)
  })

  it('is false when every flag is false', () => {
    expect(veMisUnoAUno(SIN_ACCESO_UNO_A_UNO)).toBe(false)
  })
})
