/**
 * T2 (odd/tasks/talleres-consolidar-pantallas.md) — talleres' own estado
 * label + badge-variant map, mirroring the exact shape of
 * components/dream-team/labels.ts (docs/talleres-de-punta-a-punta.md §9,
 * "Color y estado": "nunca renderizar al usuario una clave cruda del
 * catálogo — siempre pasar por estos helpers").
 */

import {
  EDICION_ESTADO_LABELS,
  EDICION_ESTADO_BADGE_VARIANTE,
  edicionEstadoLabel,
  edicionEstadoBadgeVariante,
  TALLER_ESTADO_LABELS,
  TALLER_ESTADO_BADGE_VARIANTE,
  tallerEstadoLabel,
  tallerEstadoBadgeVariante,
  REPORTE_ESTADO_LABELS,
  REPORTE_ESTADO_BADGE_VARIANTE,
  reporteEstadoLabel,
  reporteEstadoBadgeVariante,
} from '@/components/talleres/labels'

describe('edición estado labels', () => {
  it('has a Spanish label for every known estado', () => {
    expect(EDICION_ESTADO_LABELS).toEqual({
      borrador: 'Borrador',
      abierto: 'Abierta',
      en_curso: 'En curso',
      cerrado: 'Cerrada',
      cancelado: 'Cancelada',
    })
  })

  it('maps every estado to a valid BadgeSistema variante', () => {
    const validVariantes = new Set(['default', 'success', 'warning', 'error', 'info'])
    for (const variante of Object.values(EDICION_ESTADO_BADGE_VARIANTE)) {
      expect(validVariantes.has(variante)).toBe(true)
    }
  })

  it('abierto and en_curso read as positive/active variants', () => {
    expect(EDICION_ESTADO_BADGE_VARIANTE.abierto).toBe('success')
    expect(EDICION_ESTADO_BADGE_VARIANTE.en_curso).toBe('info')
  })

  it('cancelado reads as error', () => {
    expect(EDICION_ESTADO_BADGE_VARIANTE.cancelado).toBe('error')
  })

  it('edicionEstadoLabel resolves a known key and falls back to the raw key otherwise', () => {
    expect(edicionEstadoLabel('abierto')).toBe('Abierta')
    expect(edicionEstadoLabel('algo-desconocido')).toBe('algo-desconocido')
  })

  it('edicionEstadoBadgeVariante resolves a known key and falls back to default otherwise', () => {
    expect(edicionEstadoBadgeVariante('cerrado')).toBe('default')
    expect(edicionEstadoBadgeVariante('algo-desconocido')).toBe('default')
  })
})

describe('taller estado labels', () => {
  it('has a Spanish label for both known estados', () => {
    expect(TALLER_ESTADO_LABELS).toEqual({ active: 'Activo', archived: 'Archivado' })
  })

  it('active reads as success, archived as default', () => {
    expect(TALLER_ESTADO_BADGE_VARIANTE.active).toBe('success')
    expect(TALLER_ESTADO_BADGE_VARIANTE.archived).toBe('default')
  })

  it('tallerEstadoLabel resolves a known key and falls back to the raw key otherwise', () => {
    expect(tallerEstadoLabel('active')).toBe('Activo')
    expect(tallerEstadoLabel('algo-desconocido')).toBe('algo-desconocido')
  })

  it('tallerEstadoBadgeVariante resolves a known key and falls back to default otherwise', () => {
    expect(tallerEstadoBadgeVariante('archived')).toBe('default')
    expect(tallerEstadoBadgeVariante('algo-desconocido')).toBe('default')
  })
})

// T7 (odd/tasks/talleres-consolidar-pantallas.md) — taller_reportes.estado
// gets the same treatment: the old coordinacion/reportes + direccion/reportes
// pages rendered `r.estado` raw, with no label or variante mapping at all.
describe('reporte estado labels', () => {
  it('has a Spanish label for every known estado', () => {
    expect(REPORTE_ESTADO_LABELS).toEqual({
      borrador: 'Borrador',
      enviado: 'Enviado',
      reabierto: 'Reabierto',
      cerrado: 'Cerrado',
    })
  })

  it('maps every estado to a valid BadgeSistema variante', () => {
    const validVariantes = new Set(['default', 'success', 'warning', 'error', 'info'])
    for (const variante of Object.values(REPORTE_ESTADO_BADGE_VARIANTE)) {
      expect(validVariantes.has(variante)).toBe(true)
    }
  })

  it('reporteEstadoLabel resolves a known key and falls back to the raw key otherwise', () => {
    expect(reporteEstadoLabel('enviado')).toBe('Enviado')
    expect(reporteEstadoLabel('algo-desconocido')).toBe('algo-desconocido')
  })

  it('reporteEstadoBadgeVariante resolves a known key and falls back to default otherwise', () => {
    expect(reporteEstadoBadgeVariante('enviado')).toBe('success')
    expect(reporteEstadoBadgeVariante('algo-desconocido')).toBe('default')
  })
})
