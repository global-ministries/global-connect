/**
 * T4 (odd/tasks/uno-a-uno.md) — date helpers for the 1:1 screens. The user
 * picks a date and a time that mean Caracas time (UTC-04:00 all year, no
 * DST), whatever the browser's or the server's own timezone.
 */

import {
  desdeHaceDias,
  fechaHoraCaracasAIso,
  formatearFecha,
  formatearFechaHora,
  hoyEnCaracas,
  partesEnCaracas,
} from '@/lib/uno-a-uno/fecha'

describe('fechaHoraCaracasAIso', () => {
  it('builds an ISO timestamptz with the -04:00 offset', () => {
    expect(fechaHoraCaracasAIso('2026-10-16', '15:30')).toBe('2026-10-16T15:30:00-04:00')
  })

  it('points at the right instant in UTC', () => {
    const iso = fechaHoraCaracasAIso('2026-10-16', '21:15')
    expect(new Date(iso!).toISOString()).toBe('2026-10-17T01:15:00.000Z')
  })

  it('accepts a time with seconds from the browser and drops them', () => {
    expect(fechaHoraCaracasAIso('2026-10-16', '08:05:00')).toBe('2026-10-16T08:05:00-04:00')
  })

  it.each([
    ['', '10:00'],
    ['2026-10-16', ''],
    ['16/10/2026', '10:00'],
    ['2026-02-30', '10:00'],
    ['2026-13-01', '10:00'],
    ['2026-10-16', '24:00'],
    ['2026-10-16', '10:60'],
    ['2026-10-16', '10am'],
  ])('returns null for invalid input (%s, %s)', (fecha, hora) => {
    expect(fechaHoraCaracasAIso(fecha, hora)).toBeNull()
  })
})

describe('formatearFechaHora', () => {
  it('formats an instant in Caracas time, in Spanish', () => {
    expect(formatearFechaHora('2026-10-16T19:30:00Z')).toBe('viernes 16 de octubre de 2026, 15:30')
  })

  it('keeps the Caracas date when UTC is already the next day', () => {
    expect(formatearFechaHora('2026-10-17T01:15:00Z')).toBe('viernes 16 de octubre de 2026, 21:15')
  })

  it('returns an empty string for null or an unparseable value', () => {
    expect(formatearFechaHora(null)).toBe('')
    expect(formatearFechaHora('not-a-date')).toBe('')
  })
})

describe('partesEnCaracas', () => {
  it('splits an instant into the Caracas date and time inputs', () => {
    expect(partesEnCaracas('2026-10-17T01:15:00Z')).toEqual({ fecha: '2026-10-16', hora: '21:15' })
  })

  it('returns empty parts for an unparseable value', () => {
    expect(partesEnCaracas('nope')).toEqual({ fecha: '', hora: '' })
  })
})

describe('hoyEnCaracas', () => {
  it('gives the Caracas date, not the UTC one', () => {
    expect(hoyEnCaracas(new Date('2026-10-17T02:00:00Z'))).toBe('2026-10-16')
  })
})

describe('desdeHaceDias', () => {
  it('is the instant that many days before now', () => {
    expect(desdeHaceDias(90, new Date('2026-10-24T12:00:00Z'))).toBe('2026-07-26T12:00:00.000Z')
  })
})

describe('formatearFecha (T8)', () => {
  it('shows the short Caracas date of an instant', () => {
    expect(formatearFecha('2026-10-20T19:30:00Z')).toBe('20 oct 2026')
  })

  it('uses the Caracas day near midnight UTC', () => {
    expect(formatearFecha('2026-10-21T02:00:00Z')).toBe('20 oct 2026')
  })

  it('is empty for null or garbage', () => {
    expect(formatearFecha(null)).toBe('')
    expect(formatearFecha('no')).toBe('')
  })
})
