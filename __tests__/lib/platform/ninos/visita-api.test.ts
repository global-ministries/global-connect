/**
 * Body of POST /api/ninos/checkout with the optional child list (T2a of
 * odd/tasks/ninos-checkin-pco.md, pickup per child) and the public error codes.
 */
import { errorPublico, parseCheckin, parseCheckout } from '@/lib/platform/ninos/visita-api'

const N1 = '11111111-1111-4111-8111-111111111111'
const N2 = '22222222-2222-4222-8222-222222222222'
const T1 = '33333333-3333-4333-8333-333333333333'
const cuerpo = { codigo: '4821', turnoId: T1, fecha: '2026-10-11', retiradoPor: ' Ana ' }

describe('parseCheckout', () => {
  it('without ninoIds (or null) it is the whole code, as before', () => {
    const antes = { codigo: '4821', turnoId: T1, fecha: '2026-10-11', retiradoPor: 'Ana', motivoOtra: null }
    expect(parseCheckout(cuerpo)).toEqual(antes)
    expect(parseCheckout({ ...cuerpo, ninoIds: null })).toEqual(antes)
  })

  it('keeps each marked child once', () => {
    expect(parseCheckout({ ...cuerpo, ninoIds: [N1, N2, N1] })).toEqual(expect.objectContaining({ ninoIds: [N1, N2] }))
  })

  it('refuses an empty list, a non-uuid, a non-list and more than 20 children', () => {
    expect(parseCheckout({ ...cuerpo, ninoIds: [] })).toBeNull()
    expect(parseCheckout({ ...cuerpo, ninoIds: ['x'] })).toBeNull()
    expect(parseCheckout({ ...cuerpo, ninoIds: N1 })).toBeNull()
    const muchos = Array.from({ length: 21 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`)
    expect(parseCheckout({ ...cuerpo, ninoIds: muchos })).toBeNull()
  })
})

describe('errorPublico', () => {
  it('passes the fixed pickup codes, never another message', () => {
    expect(errorPublico({ code: '22023', message: 'nino_no_esta_adentro' })).toEqual({ code: '22023', message: 'nino_no_esta_adentro' })
    expect(errorPublico({ code: '22023', message: 'sin_ninos' })).toEqual({ code: '22023', message: 'sin_ninos' })
    expect(errorPublico({ code: '22023', message: 'retiro_no_autorizado' })).toEqual({ code: '22023', message: 'retiro_no_autorizado' })
    expect(errorPublico({ code: '22023', message: 'room ZZ of Sofía' })).toEqual({ code: '22023' })
  })
})

describe('parseCheckin with the forced list (T2d, S9.1)', () => {
  const ingreso = { ninoIds: [N1, N2], salonIds: [T1, T1], turnoId: T1, fecha: '2026-11-08' }

  it('without forzadoIds (absent, null or empty) it is the body as before', () => {
    const antes = { ninoIds: [N1, N2], salonIds: [T1, T1], turnoId: T1, fecha: '2026-11-08' }
    expect(parseCheckin(ingreso)).toEqual(antes)
    expect(parseCheckin({ ...ingreso, forzadoIds: null })).toEqual(antes)
    expect(parseCheckin({ ...ingreso, forzadoIds: [] })).toEqual(antes)
  })

  it('keeps each forced child once', () => {
    expect(parseCheckin({ ...ingreso, forzadoIds: [N2, N2] })).toEqual({ ...ingreso, forzadoIds: [N2] })
  })

  it('refuses a forced child outside the call, a non-uuid and a non-list', () => {
    expect(parseCheckin({ ...ingreso, forzadoIds: [T1] })).toBeNull()
    expect(parseCheckin({ ...ingreso, forzadoIds: ['x'] })).toBeNull()
    expect(parseCheckin({ ...ingreso, forzadoIds: N1 })).toBeNull()
  })
})
