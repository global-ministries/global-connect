/**
 * S7 of odd/tasks/dream-team-estructura-correcciones.md: until 2027-01-01 00:00
 * (America/Caracas, UTC-4 all year) «Quitar de este equipo» deletes the servicio
 * without a trace; from that moment on the history is kept.
 */
import { INICIO_HISTORIAL_SERVICIO, guardaHistorialServicio } from '@/lib/platform/dream-team/historial-servicio'

describe('guardaHistorialServicio', () => {
  it('starts at 2027-01-01 00:00 Caracas time', () => {
    expect(INICIO_HISTORIAL_SERVICIO.toISOString()).toBe('2027-01-01T04:00:00.000Z')
  })

  it('does not keep history on 2026-12-31 23:59 Caracas time', () => {
    expect(guardaHistorialServicio(new Date('2026-12-31T23:59:00-04:00'))).toBe(false)
    expect(guardaHistorialServicio(new Date('2026-12-31T23:59:59.999-04:00'))).toBe(false)
  })

  it('keeps history from 2027-01-01 00:00 Caracas time on', () => {
    expect(guardaHistorialServicio(new Date('2027-01-01T00:00:00-04:00'))).toBe(true)
    expect(guardaHistorialServicio(new Date('2027-06-15T12:00:00-04:00'))).toBe(true)
  })

  it('does not keep history today (before the start)', () => {
    expect(guardaHistorialServicio(new Date('2026-11-24T10:00:00-04:00'))).toBe(false)
  })

  it('reads 2027-01-01 00:00 UTC as still 2026 in Caracas', () => {
    expect(guardaHistorialServicio(new Date('2027-01-01T00:00:00Z'))).toBe(false)
    expect(guardaHistorialServicio(new Date('2027-01-01T03:59:59Z'))).toBe(false)
  })
})
