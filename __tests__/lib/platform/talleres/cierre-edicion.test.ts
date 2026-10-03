/**
 * Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md T2) — typed
 * parsers for the two jsonb answers of talleres_previsualizar_cierre and
 * talleres_cerrar_edicion ("Contrato entre la base y la app"). The app
 * never casts those answers blindly: a payload that drifts from the
 * contract parses to null and the caller degrades explicitly.
 */

import {
  contarPorResultado,
  parseResumenCierre,
  parseVistaPreviaCierre,
} from '@/lib/platform/talleres/cierre-edicion'

const FILA = {
  inscripcion_id: 'i-1',
  persona_nombre: 'Ana Gómez',
  companero_nombre: 'Luis Pérez',
  grupo_nombre: 'Grupo Alfa',
  clases_presente: 6,
  clases_total: 8,
  minimo: 6,
  resultado: 'completado',
}

const VISTA = {
  clases_sin_dictar: 2,
  reportes_sin_enviar: 1,
  clases_minimas: 6,
  filas: [FILA],
}

describe('parseVistaPreviaCierre', () => {
  it('maps the contract shape to camelCase', () => {
    expect(parseVistaPreviaCierre(VISTA)).toEqual({
      clasesSinDictar: 2,
      reportesSinEnviar: 1,
      clasesMinimas: 6,
      filas: [
        {
          inscripcionId: 'i-1',
          personaNombre: 'Ana Gómez',
          companeroNombre: 'Luis Pérez',
          grupoNombre: 'Grupo Alfa',
          clasesPresente: 6,
          clasesTotal: 8,
          minimo: 6,
          resultado: 'completado',
        },
      ],
    })
  })

  it('accepts null clases_minimas (todas las clases dictadas) and null/absent pareja and grupo', () => {
    const sinCompanero: Record<string, unknown> = { ...FILA, grupo_nombre: null }
    delete sinCompanero.companero_nombre
    const result = parseVistaPreviaCierre({ ...VISTA, clases_minimas: null, filas: [sinCompanero] })
    expect(result?.clasesMinimas).toBeNull()
    expect(result?.filas[0]?.companeroNombre).toBeNull()
    expect(result?.filas[0]?.grupoNombre).toBeNull()
  })

  it('degrades a missing persona name to — instead of dropping the row', () => {
    const result = parseVistaPreviaCierre({ ...VISTA, filas: [{ ...FILA, persona_nombre: null }] })
    expect(result?.filas[0]?.personaNombre).toBe('—')
  })

  it('accepts an empty filas list', () => {
    expect(parseVistaPreviaCierre({ ...VISTA, filas: [] })?.filas).toEqual([])
  })

  it.each([
    ['null', null],
    ['a string', 'ok'],
    ['an array', []],
    ['a missing counter', { ...VISTA, clases_sin_dictar: undefined }],
    ['a negative counter', { ...VISTA, reportes_sin_enviar: -1 }],
    ['a non-integer clases_minimas', { ...VISTA, clases_minimas: 2.5 }],
    ['filas that is not an array', { ...VISTA, filas: {} }],
    ['an unknown resultado', { ...VISTA, filas: [{ ...FILA, resultado: 'aprobado' }] }],
    ['a row without inscripcion_id', { ...VISTA, filas: [{ ...FILA, inscripcion_id: undefined }] }],
    ['a row with a string counter', { ...VISTA, filas: [{ ...FILA, clases_presente: '6' }] }],
  ])('returns null for %s', (_label, raw) => {
    expect(parseVistaPreviaCierre(raw)).toBeNull()
  })
})

const RESUMEN = {
  ok: true,
  completados: 5,
  no_completados: 2,
  abandonos: 1,
  certificados_emitidos: 5,
  clases_cerradas: 6,
  clases_canceladas: 2,
  grupos_completados: 2,
  reportes_cerrados: 1,
  reportes_sin_enviar: 1,
}

describe('parseResumenCierre', () => {
  it('maps the contract shape to camelCase', () => {
    expect(parseResumenCierre(RESUMEN)).toEqual({
      completados: 5,
      noCompletados: 2,
      abandonos: 1,
      certificadosEmitidos: 5,
      clasesCerradas: 6,
      clasesCanceladas: 2,
      gruposCompletados: 2,
      reportesCerrados: 1,
      reportesSinEnviar: 1,
    })
  })

  it.each([
    ['null', null],
    ['a missing counter', { ...RESUMEN, certificados_emitidos: undefined }],
    ['a non-numeric counter', { ...RESUMEN, completados: 'cinco' }],
  ])('returns null for %s', (_label, raw) => {
    expect(parseResumenCierre(raw)).toBeNull()
  })
})

describe('contarPorResultado', () => {
  it('counts every resultado, including the ones with no rows', () => {
    const vista = parseVistaPreviaCierre({
      ...VISTA,
      filas: [
        FILA,
        { ...FILA, inscripcion_id: 'i-2', resultado: 'completado' },
        { ...FILA, inscripcion_id: 'i-3', resultado: 'abandono', clases_presente: 0 },
      ],
    })
    expect(vista).not.toBeNull()
    if (!vista) return
    expect(contarPorResultado(vista.filas)).toEqual({ completado: 2, no_completado: 0, abandono: 1 })
  })
})
