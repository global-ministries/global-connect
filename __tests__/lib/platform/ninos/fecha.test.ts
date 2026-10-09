import { fechaServicioCaracas, horaEnCaracas, hoyEnCaracas } from '@/lib/platform/ninos/fecha'

describe('hoyEnCaracas', () => {
  it('is still Saturday in Caracas at 02:00 UTC on Sunday', () => {
    expect(hoyEnCaracas(new Date('2026-10-11T02:00:00Z'))).toBe('2026-10-10')
  })
  it('is the same day at noon UTC', () => {
    expect(hoyEnCaracas(new Date('2026-10-11T12:00:00Z'))).toBe('2026-10-11')
  })
  it('turns at 04:00 UTC (midnight in Caracas)', () => {
    expect(hoyEnCaracas(new Date('2026-10-12T03:59:00Z'))).toBe('2026-10-11')
    expect(hoyEnCaracas(new Date('2026-10-12T04:00:00Z'))).toBe('2026-10-12')
  })
})

describe('fechaServicioCaracas', () => {
  it('keeps Sunday evening in Caracas on that Sunday (UTC is already Monday)', () => {
    expect(fechaServicioCaracas(new Date('2026-10-12T01:30:00Z'))).toBe('2026-10-11')
  })
  it('is the coming Sunday on a weekday', () => {
    expect(fechaServicioCaracas(new Date('2026-10-08T15:00:00Z'))).toBe('2026-10-11')
  })
})

describe('horaEnCaracas', () => {
  it('formats a UTC instant as Caracas HH:mm', () => {
    expect(horaEnCaracas('2026-10-11T14:42:00Z')).toBe('10:42')
  })
  it('is empty for null', () => {
    expect(horaEnCaracas(null)).toBe('')
  })
})
