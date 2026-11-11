/**
 * R3g (odd/tasks/talleres-rediseno.md, S1/S2/S4) — the pure rules of
 * /talleres/reportes (artboard design/talleres-interior/25): quick ranges,
 * which ediciones fall in a range, the per-taller roll-up, the attention
 * pills and the URL.
 */
import {
  calcularReportesTalleres,
  fechasRango,
  filasVisibles,
  parseConsultaReportes,
  rangosReportesTalleres,
  urlReportesTalleres,
  type EdicionReporte,
  type ReporteGrupo,
} from '@/lib/platform/talleres/reportes-vista'

const HOY = '2026-11-11'

function edicion(over: Partial<EdicionReporte> = {}): EdicionReporte {
  return {
    id: 'ed-1',
    tallerId: 't-1',
    tallerNombre: 'Mujer de Hoy',
    tallerSlug: 'mujer-de-hoy',
    nombre: 'Edición oct 2026',
    estado: 'en_curso',
    fechaInicio: '2026-10-01',
    fechaFin: '2026-11-30',
    cerradaEn: null,
    inscripciones: 10,
    certificados: 0,
    completaron: null,
    conResultado: 0,
    ...over,
  }
}

function grupo(over: Partial<ReporteGrupo> = {}): ReporteGrupo {
  return {
    id: 'rep-1',
    grupoId: 'g-1',
    grupoNombre: 'Grupo 1',
    estado: 'enviado',
    firmaLiderFecha: '2026-08-18T00:00:00Z',
    reabiertoMotivo: null,
    tallerNombre: 'Mujer de Hoy',
    edicionId: 'ed-1',
    ...over,
  }
}

describe('rangosReportesTalleres', () => {
  it('offers Este año, Últimos 6 meses and the previous year, in that order', () => {
    expect(rangosReportesTalleres(HOY)).toEqual([
      { clave: 'anio', etiqueta: 'Este año', desde: '2026-01-01', hasta: '2026-11-11' },
      { clave: '6m', etiqueta: 'Últimos 6 meses', desde: '2026-05-11', hasta: '2026-11-11' },
      { clave: 'anterior', etiqueta: '2025', desde: '2025-01-01', hasta: '2025-12-31' },
    ])
  })

  it('clamps the 6-month start to the last day of a shorter month', () => {
    expect(rangosReportesTalleres('2026-08-31')[1].desde).toBe('2026-02-28')
  })
})

describe('fechasRango', () => {
  it('drops the first year when both dates share it', () => {
    expect(fechasRango('2026-01-01', '2026-11-11')).toBe('1 ene – 11 nov 2026')
  })
  it('keeps both years when they differ', () => {
    expect(fechasRango('2025-12-01', '2026-01-31')).toBe('1 dic 2025 – 31 ene 2026')
  })
})

describe('calcularReportesTalleres', () => {
  const rango = rangosReportesTalleres(HOY)[0]

  it('keeps the ediciones that overlap the range and counts the undated ones apart', () => {
    const datos = calcularReportesTalleres({
      ediciones: [
        edicion({ id: 'dentro' }),
        edicion({ id: 'antes', fechaInicio: '2025-03-01', fechaFin: '2025-04-30' }),
        edicion({ id: 'cruza', fechaInicio: '2025-12-01', fechaFin: '2026-01-15' }),
        edicion({ id: 'sin-fechas', fechaInicio: null, fechaFin: null }),
      ],
      grupos: [],
      rango,
    })
    expect(datos.ediciones.map((e) => e.id).sort()).toEqual(['cruza', 'dentro'])
    expect(datos.sinFechas).toBe(1)
  })

  it('treats an edición without fecha_fin as a one-day edición', () => {
    const datos = calcularReportesTalleres({
      ediciones: [edicion({ id: 'x', fechaInicio: '2025-12-31', fechaFin: null })],
      grupos: [],
      rango,
    })
    expect(datos.ediciones).toHaveLength(0)
  })

  it('rolls ediciones up per taller and sums inscripciones, completaron and certificados', () => {
    const datos = calcularReportesTalleres({
      ediciones: [
        edicion({ id: 'a', inscripciones: 30, completaron: 28, conResultado: 30, certificados: 26, estado: 'cerrado', cerradaEn: '2026-02-01' }),
        edicion({ id: 'b', inscripciones: 12 }),
        edicion({ id: 'c', tallerId: 't-2', tallerNombre: 'Parejas', tallerSlug: 'parejas', inscripciones: 26 }),
      ],
      grupos: [],
      rango,
    })
    const mdh = datos.talleres.find((t) => t.clave === 't-1')
    expect(mdh).toMatchObject({ nombre: 'Mujer de Hoy', inscripciones: 42, completaron: 28, certificados: 26 })
    expect(mdh?.ediciones.map((e) => e.id)).toEqual(['a', 'b'])
    // No edición of Parejas has results yet: completaron stays unknown, not 0.
    expect(datos.talleres.find((t) => t.clave === 't-2')?.completaron).toBeNull()
    expect(datos.totales).toEqual({ talleres: 2, ediciones: 3, inscripciones: 68, completaron: 28, certificados: 26 })
  })

  it('sorts talleres by inscripciones (most first) and ediciones by start date (newest first)', () => {
    const datos = calcularReportesTalleres({
      ediciones: [
        edicion({ id: 'viejo', fechaInicio: '2026-01-10', fechaFin: '2026-02-20', inscripciones: 5 }),
        edicion({ id: 'nuevo', fechaInicio: '2026-09-01', fechaFin: '2026-10-20', inscripciones: 5 }),
        edicion({ id: 'grande', tallerId: 't-2', tallerNombre: 'Punto de Partida', inscripciones: 40 }),
      ],
      grupos: [],
      rango,
    })
    expect(datos.talleres.map((t) => t.clave)).toEqual(['t-2', 't-1'])
    expect(datos.ediciones.map((e) => e.id)).toEqual(['grande', 'nuevo', 'viejo'])
  })

  it('keeps a grupo report whose edición is in range or unknown, drops one whose edición is out of range', () => {
    const datos = calcularReportesTalleres({
      ediciones: [edicion({ id: 'ed-in' }), edicion({ id: 'ed-out', fechaInicio: '2025-01-10', fechaFin: '2025-02-10' })],
      grupos: [
        grupo({ id: 'r-in', edicionId: 'ed-in' }),
        grupo({ id: 'r-out', edicionId: 'ed-out' }),
        grupo({ id: 'r-huerfano', edicionId: null }),
      ],
      rango,
    })
    expect(datos.grupos.map((g) => g.id)).toEqual(['r-in', 'r-huerfano'])
  })
})

describe('filasVisibles — attention pills', () => {
  const rango = rangosReportesTalleres(HOY)[0]
  const datos = calcularReportesTalleres({
    ediciones: [
      edicion({ id: 'abierta' }),
      edicion({ id: 'sin-cerrar', estado: 'cerrado', cerradaEn: null }),
      edicion({ id: 'cerrada', estado: 'cerrado', cerradaEn: '2026-03-01T00:00:00Z' }),
    ],
    grupos: [
      grupo({ id: 'env' }),
      grupo({ id: 'bor', estado: 'borrador', firmaLiderFecha: null }),
      grupo({ id: 'rea', estado: 'reabierto', reabiertoMotivo: 'Faltaba una recuperación' }),
      grupo({ id: 'rea2', estado: 'enviado', reabiertoMotivo: 'Se corrigió' }),
    ],
    rango,
  })

  it('counts and filters «Terminadas sin cerrar» in Por edición', () => {
    const r = filasVisibles(datos, 'ediciones', 'sin-cerrar')
    expect(r.pastillas).toEqual([{ id: 'sin-cerrar', etiqueta: 'Terminadas sin cerrar', cantidad: 1 }])
    expect(r.filas.map((e) => (e as EdicionReporte).id)).toEqual(['sin-cerrar'])
  })

  it('counts and filters «Sin enviar» and «Reabiertos» in Reportes de grupos', () => {
    expect(filasVisibles(datos, 'grupos', null).pastillas).toEqual([
      { id: 'sin-enviar', etiqueta: 'Sin enviar', cantidad: 1 },
      { id: 'reabiertos', etiqueta: 'Reabiertos', cantidad: 2 },
    ])
    expect(filasVisibles(datos, 'grupos', 'reabiertos').filas.map((g) => (g as ReporteGrupo).id)).toEqual(['rea', 'rea2'])
  })

  it('has no pills in Por taller and ignores a pill of another tab', () => {
    const r = filasVisibles(datos, 'talleres', 'reabiertos')
    expect(r.pastillas).toEqual([])
    expect(r.filas).toHaveLength(1)
  })
})

describe('URL', () => {
  it('reads vista, rango and filtro, falling back to the defaults on unknown values', () => {
    expect(parseConsultaReportes({ vista: 'grupos', rango: '6m', filtro: 'reabiertos' })).toEqual({
      vista: 'grupos',
      rango: '6m',
      filtro: 'reabiertos',
    })
    expect(parseConsultaReportes({ vista: 'x', rango: ['anterior'], filtro: 'nada' })).toEqual({
      vista: 'talleres',
      rango: 'anterior',
      filtro: null,
    })
    expect(parseConsultaReportes(undefined)).toEqual({ vista: 'talleres', rango: 'anio', filtro: null })
  })

  it('writes only what differs from the defaults', () => {
    expect(urlReportesTalleres({ vista: 'talleres', rango: 'anio', filtro: null })).toBe('/talleres/reportes')
    expect(urlReportesTalleres({ vista: 'ediciones', rango: '6m', filtro: 'sin-cerrar' })).toBe(
      '/talleres/reportes?vista=ediciones&rango=6m&filtro=sin-cerrar',
    )
  })
})
