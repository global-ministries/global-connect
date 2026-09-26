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
  TEMPORADA_ESTADO_LABELS,
  TEMPORADA_ESTADO_BADGE_VARIANTE,
  temporadaEstadoLabel,
  temporadaEstadoBadgeVariante,
  INSCRIPCION_ESTADO_LABELS,
  INSCRIPCION_ESTADO_BADGE_VARIANTE,
  inscripcionEstadoLabel,
  inscripcionEstadoBadgeVariante,
  UNIT_ESTADO_LABELS,
  UNIT_ESTADO_BADGE_VARIANTE,
  unitEstadoLabel,
  unitEstadoBadgeVariante,
  ASISTENCIA_ESTADO_LABELS,
  ASISTENCIA_ESTADO_BADGE_VARIANTE,
  asistenciaEstadoLabel,
  asistenciaEstadoBadgeVariante,
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

// T8 (odd/tasks/talleres-consolidar-pantallas.md) — talleres_temporadas.estado
// gets the same treatment as every other domain in this file: the old
// admin/talleres/temporadas screens rendered `t.estado` raw, no label map.
describe('temporada estado labels', () => {
  it('has a Spanish label for every known estado', () => {
    expect(TEMPORADA_ESTADO_LABELS).toEqual({
      borrador: 'Borrador',
      abierto: 'Abierta',
      cerrado: 'Cerrada',
      cancelado: 'Cancelada',
    })
  })

  it('maps every estado to a valid BadgeSistema variante', () => {
    const validVariantes = new Set(['default', 'success', 'warning', 'error', 'info'])
    for (const variante of Object.values(TEMPORADA_ESTADO_BADGE_VARIANTE)) {
      expect(validVariantes.has(variante)).toBe(true)
    }
  })

  it('abierto reads as success, cancelado as error', () => {
    expect(TEMPORADA_ESTADO_BADGE_VARIANTE.abierto).toBe('success')
    expect(TEMPORADA_ESTADO_BADGE_VARIANTE.cancelado).toBe('error')
  })

  it('temporadaEstadoLabel resolves a known key and falls back to the raw key otherwise', () => {
    expect(temporadaEstadoLabel('abierto')).toBe('Abierta')
    expect(temporadaEstadoLabel('algo-desconocido')).toBe('algo-desconocido')
  })

  it('temporadaEstadoBadgeVariante resolves a known key and falls back to default otherwise', () => {
    expect(temporadaEstadoBadgeVariante('borrador')).toBe('info')
    expect(temporadaEstadoBadgeVariante('algo-desconocido')).toBe('default')
  })
})

// T9 (odd/tasks/talleres-consolidar-pantallas.md) — taller_inscripciones.estado
// (participant-facing) gets the same treatment: the old mis-talleres page
// rendered aprobado as success/pendiente as default, while historial
// rendered completado as success/no_aprobado as error/else default — two
// different colors for the same `aprobado` value depending on which old
// screen rendered it. This is the single shared map the merged
// /talleres/mi-recorrido screen uses for both its "en curso" and
// "historial" tabs.
describe('inscripcion estado labels', () => {
  it('has a Spanish label for every known estado', () => {
    expect(INSCRIPCION_ESTADO_LABELS).toEqual({
      pendiente: 'Pendiente',
      aprobado: 'Aprobado',
      no_aprobado: 'No aprobado',
      completado: 'Completado',
    })
  })

  it('maps every estado to a valid BadgeSistema variante', () => {
    const validVariantes = new Set(['default', 'success', 'warning', 'error', 'info'])
    for (const variante of Object.values(INSCRIPCION_ESTADO_BADGE_VARIANTE)) {
      expect(validVariantes.has(variante)).toBe(true)
    }
  })

  it('no_aprobado reads as error, aprobado as success', () => {
    expect(INSCRIPCION_ESTADO_BADGE_VARIANTE.no_aprobado).toBe('error')
    expect(INSCRIPCION_ESTADO_BADGE_VARIANTE.aprobado).toBe('success')
  })

  it('inscripcionEstadoLabel resolves a known key and falls back to the raw key otherwise', () => {
    expect(inscripcionEstadoLabel('aprobado')).toBe('Aprobado')
    expect(inscripcionEstadoLabel('algo-desconocido')).toBe('algo-desconocido')
  })

  it('inscripcionEstadoBadgeVariante resolves a known key and falls back to default otherwise', () => {
    expect(inscripcionEstadoBadgeVariante('pendiente')).toBe('warning')
    expect(inscripcionEstadoBadgeVariante('algo-desconocido')).toBe('default')
  })
})

// T9 — taller_inscripciones.unit_estado (the per-unit completion outcome,
// distinct from the inscripcion's own estado above).
describe('unit estado labels', () => {
  it('has a Spanish label for every known estado', () => {
    expect(UNIT_ESTADO_LABELS).toEqual({
      completado: 'Completado',
      no_completado: 'No completado',
      abandono: 'Abandonó',
    })
  })

  it('maps every estado to a valid BadgeSistema variante', () => {
    const validVariantes = new Set(['default', 'success', 'warning', 'error', 'info'])
    for (const variante of Object.values(UNIT_ESTADO_BADGE_VARIANTE)) {
      expect(validVariantes.has(variante)).toBe(true)
    }
  })

  it('completado reads as success, abandono as error', () => {
    expect(UNIT_ESTADO_BADGE_VARIANTE.completado).toBe('success')
    expect(UNIT_ESTADO_BADGE_VARIANTE.abandono).toBe('error')
  })

  it('unitEstadoLabel resolves a known key and falls back to the raw key otherwise', () => {
    expect(unitEstadoLabel('abandono')).toBe('Abandonó')
    expect(unitEstadoLabel('algo-desconocido')).toBe('algo-desconocido')
  })

  it('unitEstadoBadgeVariante resolves a known key and falls back to default otherwise', () => {
    expect(unitEstadoBadgeVariante('no_completado')).toBe('default')
    expect(unitEstadoBadgeVariante('algo-desconocido')).toBe('default')
  })
})

// T2 (odd/tasks/talleres-asistencia-lider.md) — taller_asistencias.estado,
// the third domain of this file: the read view of a clase never renders the
// raw key, always this map (docs §9, "Color y estado").
describe('asistencia estado labels', () => {
  it('has a Spanish label for every known estado', () => {
    expect(ASISTENCIA_ESTADO_LABELS).toEqual({
      presente: 'Presente',
      ausente: 'Ausente',
      no_aplica: 'No aplica',
    })
  })

  it('maps every estado to a valid BadgeSistema variante', () => {
    const validVariantes = new Set(['default', 'success', 'warning', 'error', 'info'])
    for (const variante of Object.values(ASISTENCIA_ESTADO_BADGE_VARIANTE)) {
      expect(validVariantes.has(variante)).toBe(true)
    }
  })

  it('presente reads as success, ausente as error, no_aplica as default', () => {
    expect(ASISTENCIA_ESTADO_BADGE_VARIANTE.presente).toBe('success')
    expect(ASISTENCIA_ESTADO_BADGE_VARIANTE.ausente).toBe('error')
    expect(ASISTENCIA_ESTADO_BADGE_VARIANTE.no_aplica).toBe('default')
  })

  it('asistenciaEstadoLabel resolves a known key and falls back to the raw key otherwise', () => {
    expect(asistenciaEstadoLabel('ausente')).toBe('Ausente')
    expect(asistenciaEstadoLabel('algo-desconocido')).toBe('algo-desconocido')
  })

  it('asistenciaEstadoBadgeVariante resolves a known key and falls back to default otherwise', () => {
    expect(asistenciaEstadoBadgeVariante('presente')).toBe('success')
    expect(asistenciaEstadoBadgeVariante('algo-desconocido')).toBe('default')
  })
})
