/**
 * @jest-environment node
 *
 * T10 (odd/tasks/talleres-reserva-publica.md, S6; L30) — the shared rule for
 * an edición's «Lugar» (≤ 200) and «Indicaciones para los participantes»
 * (≤ 500): trimmed, blank → null, longer → the exact message.
 */

import {
  INDICACIONES_MAX,
  LUGAR_MAX,
  MENSAJE_INDICACIONES_LARGAS,
  MENSAJE_LUGAR_LARGO,
  tieneDatosPracticos,
  validarDatosPracticos,
} from '@/lib/platform/talleres/datos-practicos'

describe('validarDatosPracticos', () => {
  it('trims both fields', () => {
    expect(validarDatosPracticos({ lugar: '  Salón 2 ', indicaciones: '\nTrae tu Biblia\n' })).toEqual({
      ok: true,
      lugar: 'Salón 2',
      indicaciones: 'Trae tu Biblia',
    })
  })

  it('turns blank, missing and non-text values into null', () => {
    expect(validarDatosPracticos({ lugar: '   ', indicaciones: undefined })).toEqual({
      ok: true,
      lugar: null,
      indicaciones: null,
    })
    expect(validarDatosPracticos({ lugar: null, indicaciones: 42 })).toEqual({ ok: true, lugar: null, indicaciones: null })
  })

  it('keeps the line breaks inside the indicaciones', () => {
    const r = validarDatosPracticos({ indicaciones: 'Trae tu Biblia\nEntra por la puerta lateral' })
    expect(r).toEqual({ ok: true, lugar: null, indicaciones: 'Trae tu Biblia\nEntra por la puerta lateral' })
  })

  it('accepts exactly the limits', () => {
    const r = validarDatosPracticos({ lugar: 'l'.repeat(LUGAR_MAX), indicaciones: 'i'.repeat(INDICACIONES_MAX) })
    expect(r.ok).toBe(true)
  })

  it('refuses a lugar over 200 characters (after trimming)', () => {
    expect(validarDatosPracticos({ lugar: ` ${'l'.repeat(LUGAR_MAX + 1)} ` })).toEqual({
      ok: false,
      message: 'El lugar no puede superar los 200 caracteres.',
    })
    expect(MENSAJE_LUGAR_LARGO).toBe('El lugar no puede superar los 200 caracteres.')
  })

  it('refuses indicaciones over 500 characters', () => {
    expect(validarDatosPracticos({ indicaciones: 'i'.repeat(INDICACIONES_MAX + 1) })).toEqual({
      ok: false,
      message: 'Las indicaciones no pueden superar los 500 caracteres.',
    })
    expect(MENSAJE_INDICACIONES_LARGAS).toBe('Las indicaciones no pueden superar los 500 caracteres.')
  })
})

describe('tieneDatosPracticos', () => {
  it('is true when either field is set', () => {
    expect(tieneDatosPracticos({ lugar: 'Salón 2', indicaciones: null })).toBe(true)
    expect(tieneDatosPracticos({ lugar: null, indicaciones: 'Trae tu Biblia' })).toBe(true)
    expect(tieneDatosPracticos({ lugar: null, indicaciones: null })).toBe(false)
  })
})
