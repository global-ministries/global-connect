/**
 * @jest-environment node
 *
 * R3c (odd/tasks/talleres-rediseno.md, S1, S4) — the pure rules of the v2
 * /talleres catálogo: dirección of each taller, its próxima edición, the
 * attention metrics computed only from the loaded data, the filters and their
 * URL form.
 */

import {
  FILTROS_INICIALES,
  consultaDe,
  construirFilas,
  contarAtencion,
  direccionDe,
  estadoProxima,
  filtrarFilas,
  formatearDia,
  leerFiltros,
  resumenCatalogo,
} from '@/components/talleres/catalogo/vista-catalogo'
import type { CatalogoEdicionPanel, CatalogoTallerPanel, GruposEdicion } from '@/lib/platform/talleres/catalogo'

function edicion(o: Partial<CatalogoEdicionPanel> = {}): CatalogoEdicionPanel {
  return {
    id: 'e-1',
    nombre_snapshot: 'Edición nov 2026',
    tipo: 'individual',
    estado: 'abierto',
    total_inscripciones: 0,
    temporada_id: null,
    fecha_inicio: '2026-11-24',
    fecha_fin: '2026-12-29',
    pendientes: 0,
    aprobados: 0,
    ocupados: 0,
    cierre_inscripcion: '2026-11-20',
    ...o,
  }
}

function taller(o: Partial<CatalogoTallerPanel> = {}): CatalogoTallerPanel {
  return {
    id: 't-1',
    slug: 'mujer-de-hoy',
    nombre: 'Mujer de Hoy',
    estado: 'active',
    dream_team_equipo_id: 'eq-1',
    minimo_inscritos: null,
    ediciones: [edicion()],
    ...o,
  }
}

const MUJER = taller({
  ediciones: [edicion({ id: 'e-m', pendientes: 5, aprobados: 9, ocupados: 14 })],
  minimo_inscritos: 10,
})
const PAREJAS = taller({
  id: 't-p',
  slug: 'parejas',
  nombre: 'Parejas',
  minimo_inscritos: 8,
  ediciones: [edicion({ id: 'e-p', tipo: 'pareja', pendientes: 2, aprobados: 4, ocupados: 6 })],
})
const PP = taller({
  id: 't-pp',
  slug: 'proximo-paso',
  nombre: 'Próximo Paso',
  ediciones: [edicion({ id: 'e-pp', ocupados: 40, aprobados: 40 })],
})
const CERRADO = taller({
  id: 't-c',
  slug: 'discipulado',
  nombre: 'Discipulado',
  ediciones: [edicion({ id: 'e-c', estado: 'cerrado' })],
})

const GRUPOS = new Map<string, GruposEdicion>([
  ['e-m', { cupo: 30, gruposSinFacilitador: 0 }],
  ['e-p', { cupo: 15, gruposSinFacilitador: 1 }],
  ['e-pp', { cupo: 40, gruposSinFacilitador: 0 }],
])

describe('direccionDe', () => {
  it('puts Próximo Paso (slug proximo-paso) under DPS and every other taller under Conexión', () => {
    expect(direccionDe(PP)).toBe('dps')
    expect(direccionDe(MUJER)).toBe('conexion')
  })
})

describe('construirFilas', () => {
  const filas = construirFilas([MUJER, PAREJAS, PP, CERRADO], GRUPOS, [
    { id: 't-1', slug: 'mujer-de-hoy', nombre: 'Mujer de Hoy', puedeAbrirEdicion: true },
  ])
  const porId = new Map(filas.map((f) => [f.taller.id, f]))

  it('takes the próxima edición (abierta first), its cupo and the attention flags', () => {
    const mujer = porId.get('t-1')
    expect(mujer?.proxima?.id).toBe('e-m')
    expect(mujer?.cupo).toBe(30)
    expect(mujer?.pendientes).toBe(5)
    expect(mujer?.faltanParaMinimo).toBe(1)
    expect(mujer?.gruposSinFacilitador).toBe(0)
    expect(mujer?.puedeEditar).toBe(true)
    expect(mujer?.puedeAbrirEdicion).toBe(true)
    expect(porId.get('t-p')?.gruposSinFacilitador).toBe(1)
    expect(porId.get('t-p')?.puedeEditar).toBe(false)
  })

  it('prefers an abierta over a borrador or an en curso, and ignores cerradas and canceladas', () => {
    const [fila] = construirFilas(
      [
        taller({
          ediciones: [
            edicion({ id: 'b', estado: 'borrador', fecha_inicio: '2026-01-01' }),
            edicion({ id: 'c', estado: 'en_curso', fecha_inicio: '2026-01-01' }),
            edicion({ id: 'a2', estado: 'abierto', fecha_inicio: '2027-03-01' }),
            edicion({ id: 'a1', estado: 'abierto', fecha_inicio: '2027-02-01' }),
          ],
        }),
      ],
      null,
      [],
    )
    expect(fila?.proxima?.id).toBe('a1')
    expect(construirFilas([CERRADO], null, [])[0]?.proxima).toBeNull()
  })

  it('leaves cupo and sin facilitador unknown (null) when the grupos could not be read', () => {
    const [fila] = construirFilas([PAREJAS], null, [])
    expect(fila?.cupo).toBeNull()
    expect(fila?.gruposSinFacilitador).toBeNull()
  })

  it('marks Próximo Paso as managed elsewhere', () => {
    expect(porId.get('t-pp')?.externo).toBe(true)
    expect(porId.get('t-1')?.externo).toBe(false)
  })

  it('orders what needs attention first, then by name', () => {
    expect(filas.map((f) => f.taller.nombre)).toEqual(['Parejas', 'Mujer de Hoy', 'Discipulado', 'Próximo Paso'])
  })
})

describe('contarAtencion', () => {
  const filas = construirFilas([MUJER, PAREJAS, PP, CERRADO], GRUPOS, [])

  it('counts por aprobar, ediciones abiertas, ediciones bajo el mínimo and grupos sin facilitador', () => {
    expect(contarAtencion(filas, true)).toEqual({ pendientes: 7, abiertas: 3, minimo: 2, sinFacilitador: 1 })
  })

  it('omits Sin facilitador (null) when the grupos could not be read', () => {
    expect(contarAtencion(construirFilas([MUJER], null, []), false).sinFacilitador).toBeNull()
  })
})

describe('filtrarFilas', () => {
  const filas = construirFilas([MUJER, PAREJAS, PP, CERRADO], GRUPOS, [])
  const nombres = (f: typeof FILTROS_INICIALES) => filtrarFilas(filas, f).map((x) => x.taller.nombre)

  it('filters by each attention metric', () => {
    expect(nombres({ ...FILTROS_INICIALES, atencion: 'pendientes' })).toEqual(['Parejas', 'Mujer de Hoy'])
    expect(nombres({ ...FILTROS_INICIALES, atencion: 'minimo' })).toEqual(['Parejas', 'Mujer de Hoy'])
    expect(nombres({ ...FILTROS_INICIALES, atencion: 'sin-facilitador' })).toEqual(['Parejas'])
    expect(nombres({ ...FILTROS_INICIALES, atencion: 'abiertas' })).toEqual(['Parejas', 'Mujer de Hoy', 'Próximo Paso'])
  })

  it('filters by dirección and by name, ignoring accents and case', () => {
    expect(nombres({ ...FILTROS_INICIALES, direccion: 'dps' })).toEqual(['Próximo Paso'])
    expect(nombres({ ...FILTROS_INICIALES, q: 'proximo' })).toEqual(['Próximo Paso'])
    expect(nombres({ ...FILTROS_INICIALES, q: 'MUJER' })).toEqual(['Mujer de Hoy'])
  })
})

describe('leerFiltros / consultaDe', () => {
  it('reads only known values from the URL', () => {
    expect(leerFiltros({ atencion: 'minimo', direccion: 'dps', q: 'pa' })).toEqual({ atencion: 'minimo', direccion: 'dps', q: 'pa' })
    expect(leerFiltros({ atencion: 'otra', direccion: 'x' })).toEqual(FILTROS_INICIALES)
  })

  it('writes the filters, the open taller and «nuevo» as a query, empty when there is nothing', () => {
    expect(consultaDe(FILTROS_INICIALES, { taller: null, nuevo: false })).toBe('')
    expect(consultaDe({ atencion: 'pendientes', direccion: 'conexion', q: 'mu' }, { taller: 'parejas', nuevo: false })).toBe(
      '?atencion=pendientes&direccion=conexion&q=mu&taller=parejas',
    )
    expect(consultaDe(FILTROS_INICIALES, { taller: null, nuevo: true })).toBe('?nuevo=1')
  })
})

describe('resumenCatalogo / estadoProxima / formatearDia', () => {
  const filas = construirFilas([MUJER, PAREJAS, PP, CERRADO], GRUPOS, [])

  it('summarises talleres, ediciones abiertas and por aprobar', () => {
    expect(resumenCatalogo(filas)).toEqual({ talleres: 4, abiertas: 3, pendientes: 7 })
  })

  it('says «Cupo lleno» when an abierta reaches its cupo, and names every other state', () => {
    const porId = new Map(filas.map((f) => [f.taller.id, f]))
    expect(estadoProxima(porId.get('t-pp')!)).toEqual({ tono: 'warning', etiqueta: 'Cupo lleno' })
    expect(estadoProxima(porId.get('t-1')!)).toEqual({ tono: 'success', etiqueta: 'Inscripción abierta' })
    expect(estadoProxima(porId.get('t-c')!)).toEqual({ tono: 'muted', etiqueta: 'Sin edición vigente' })
  })

  it('formats a date as «mar 24 nov» without depending on the time zone', () => {
    expect(formatearDia('2026-11-24')).toBe('mar 24 nov')
    expect(formatearDia('2026-11-24T23:30:00Z')).toBe('mar 24 nov')
    expect(formatearDia(null)).toBeNull()
  })
})
