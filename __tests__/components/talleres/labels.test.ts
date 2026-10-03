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
  unitEstadoConteoLabel,
  ASISTENCIA_ESTADO_LABELS,
  ASISTENCIA_ESTADO_BADGE_VARIANTE,
  asistenciaEstadoLabel,
  asistenciaEstadoBadgeVariante,
  GRUPO_ESTADO_LABELS,
  GRUPO_ESTADO_BADGE_VARIANTE,
  grupoEstadoLabel,
  grupoEstadoBadgeVariante,
  CLASE_ESTADO_LABELS,
  CLASE_ESTADO_BADGE_VARIANTE,
  claseEstadoLabel,
  claseEstadoBadgeVariante,
  TALLER_TIPO_LABELS,
  tipoTallerLabel,
  TALLER_REGIMEN_LABELS,
  regimenLabel,
  vinculoLabel,
  cierreRelativoLabel,
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

  // T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the
  // temporadas-por-dirección list's own spec: "borrador default / abierto
  // success / cerrado default / cancelado error" — borrador moves from the
  // old 'info' to 'default' (matching EDICION_ESTADO_BADGE_VARIANTE's own
  // borrador, above, for consistency across both domains).
  it('borrador and cerrado read as default, abierto as success, cancelado as error', () => {
    expect(TEMPORADA_ESTADO_BADGE_VARIANTE.borrador).toBe('default')
    expect(TEMPORADA_ESTADO_BADGE_VARIANTE.cerrado).toBe('default')
    expect(TEMPORADA_ESTADO_BADGE_VARIANTE.abierto).toBe('success')
    expect(TEMPORADA_ESTADO_BADGE_VARIANTE.cancelado).toBe('error')
  })

  it('temporadaEstadoLabel resolves a known key and falls back to the raw key otherwise', () => {
    expect(temporadaEstadoLabel('abierto')).toBe('Abierta')
    expect(temporadaEstadoLabel('algo-desconocido')).toBe('algo-desconocido')
  })

  it('temporadaEstadoBadgeVariante resolves a known key and falls back to default otherwise', () => {
    expect(temporadaEstadoBadgeVariante('abierto')).toBe('success')
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

  // Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md T2) — the
  // close preview/summary counts ("5 completados", "1 abandono").
  it('unitEstadoConteoLabel pluralizes every resultado', () => {
    expect(unitEstadoConteoLabel('completado', 1)).toBe('1 completado')
    expect(unitEstadoConteoLabel('completado', 5)).toBe('5 completados')
    expect(unitEstadoConteoLabel('no_completado', 0)).toBe('0 no completados')
    expect(unitEstadoConteoLabel('no_completado', 1)).toBe('1 no completado')
    expect(unitEstadoConteoLabel('abandono', 1)).toBe('1 abandono')
    expect(unitEstadoConteoLabel('abandono', 3)).toBe('3 abandonos')
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

// T10 (odd/tasks/talleres-configuracion-del-taller.md) — taller_grupos.estado
// (activo/completado/cancelado). The [grupo] and taller screens rendered
// `grupo.estado` raw inside a bare BadgeSistema — this is the shared map.
describe('grupo estado labels', () => {
  it('has a Spanish label for every known estado', () => {
    expect(GRUPO_ESTADO_LABELS).toEqual({
      activo: 'Activo',
      completado: 'Completado',
      cancelado: 'Cancelado',
    })
  })

  it('maps every estado to a valid BadgeSistema variante', () => {
    const validVariantes = new Set(['default', 'success', 'warning', 'error', 'info'])
    for (const variante of Object.values(GRUPO_ESTADO_BADGE_VARIANTE)) {
      expect(validVariantes.has(variante)).toBe(true)
    }
  })

  it('activo reads as success, cancelado as error', () => {
    expect(GRUPO_ESTADO_BADGE_VARIANTE.activo).toBe('success')
    expect(GRUPO_ESTADO_BADGE_VARIANTE.cancelado).toBe('error')
  })

  it('grupoEstadoLabel resolves a known key and falls back to the raw key otherwise', () => {
    expect(grupoEstadoLabel('activo')).toBe('Activo')
    expect(grupoEstadoLabel('algo-desconocido')).toBe('algo-desconocido')
  })

  it('grupoEstadoBadgeVariante resolves a known key and falls back to default otherwise', () => {
    expect(grupoEstadoBadgeVariante('completado')).toBe('info')
    expect(grupoEstadoBadgeVariante('algo-desconocido')).toBe('default')
  })
})

// T10 — taller_sesiones.estado (programada/en_curso/cerrada/cancelada), the
// clase's own estado. The [grupo] screen rendered `s.estado` raw inside a
// bare BadgeSistema — this is the shared map.
describe('clase estado labels', () => {
  it('has a Spanish label for every known estado', () => {
    expect(CLASE_ESTADO_LABELS).toEqual({
      programada: 'Programada',
      en_curso: 'En curso',
      cerrada: 'Cerrada',
      cancelada: 'Cancelada',
    })
  })

  it('maps every estado to a valid BadgeSistema variante', () => {
    const validVariantes = new Set(['default', 'success', 'warning', 'error', 'info'])
    for (const variante of Object.values(CLASE_ESTADO_BADGE_VARIANTE)) {
      expect(validVariantes.has(variante)).toBe(true)
    }
  })

  it('cerrada reads as success, cancelada as error', () => {
    expect(CLASE_ESTADO_BADGE_VARIANTE.cerrada).toBe('success')
    expect(CLASE_ESTADO_BADGE_VARIANTE.cancelada).toBe('error')
  })

  it('claseEstadoLabel resolves a known key and falls back to the raw key otherwise', () => {
    expect(claseEstadoLabel('en_curso')).toBe('En curso')
    expect(claseEstadoLabel('algo-desconocido')).toBe('algo-desconocido')
  })

  it('claseEstadoBadgeVariante resolves a known key and falls back to default otherwise', () => {
    expect(claseEstadoBadgeVariante('programada')).toBe('default')
    expect(claseEstadoBadgeVariante('algo-desconocido')).toBe('default')
  })
})

// T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the taller's
// own configuration fields (Configuración section of /talleres/[taller]).
describe('taller tipo labels', () => {
  it('has a Spanish label for both known tipos', () => {
    expect(TALLER_TIPO_LABELS).toEqual({ individual: 'Individual', pareja: 'Parejas' })
  })

  it('tipoTallerLabel resolves a known key and falls back to the raw key otherwise', () => {
    expect(tipoTallerLabel('pareja')).toBe('Parejas')
    expect(tipoTallerLabel('algo-desconocido')).toBe('algo-desconocido')
  })
})

describe('taller regimen labels', () => {
  it('has a Spanish label for both known regimenes', () => {
    expect(TALLER_REGIMEN_LABELS).toEqual({
      temporada: 'Por temporada de la dirección',
      cadencia: 'Por cadencia propia',
    })
  })

  it('regimenLabel resolves a known key and falls back to the raw key otherwise', () => {
    expect(regimenLabel('cadencia')).toBe('Por cadencia propia')
    expect(regimenLabel('algo-desconocido')).toBe('algo-desconocido')
  })
})

describe('vinculoLabel', () => {
  it('labels matrimonio and novios', () => {
    expect(vinculoLabel('matrimonio')).toBe('Matrimonios')
    expect(vinculoLabel('novios')).toBe('Novios')
  })

  it('labels null as Cualquiera (no vínculo restriction)', () => {
    expect(vinculoLabel(null)).toBe('Cualquiera')
  })

  it('labels an unknown value as Cualquiera (never a raw key)', () => {
    expect(vinculoLabel('algo-desconocido')).toBe('Cualquiera')
  })
})

describe('cierreRelativoLabel', () => {
  it('describes a negative offset as closing before the first clase', () => {
    expect(cierreRelativoLabel(-3)).toBe('Cierra 3 días antes de la primera clase')
  })

  it('describes a zero offset as closing when the first clase starts', () => {
    expect(cierreRelativoLabel(0)).toBe('Cierra al empezar')
  })

  it('describes a positive offset as staying open past the first clase', () => {
    expect(cierreRelativoLabel(7)).toBe('Permite entrar hasta 7 días después')
  })
})
