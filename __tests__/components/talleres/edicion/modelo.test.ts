/**
 * R3f (odd/tasks/talleres-rediseno.md) — the pure model of the edición
 * screen: building plain rows, filters, counts, bulk eligibility and the
 * URL state.
 */

import {
  FILTROS_INICIALES,
  consultaDe,
  construirInscritas,
  contarAtencion,
  esLoteable,
  etiquetaGrupo,
  filtrarInscritas,
  leerFiltros,
  leerVista,
  type ExtraInscripcion,
  type InscritaEdicion,
} from '@/components/talleres/edicion/modelo'
import type { InscripcionAdminRow } from '@/lib/platform/talleres/inscripciones-types'

const FILA: InscripcionAdminRow = {
  id: 'i-1',
  edicion_id: 'e-1',
  edicion_nombre: 'Nov 2026',
  edicion_estado: 'abierto',
  taller_id: 'e-1',
  taller_nombre: 'Mujer de Hoy',
  taller_slug: 'mujer-de-hoy',
  cohorte_id: 'c-1',
  cohorte_edicion: null,
  persona_principal_id: 'p-1',
  persona_principal_nombre: 'Ana Pérez',
  persona_principal_email: 'ana@example.com',
  companero_id: 'p-2',
  companero_nombre: 'Luis Pérez',
  link_type: 'matrimonio',
  estado: 'pendiente',
  created_at: '2026-11-04T14:00:00Z',
  updated_at: '2026-11-04T14:00:00Z',
  grupo_id: null,
  grupo_nombre: null,
  sobre_cupo: true,
  sobre_cupo_por_nombre: 'Neida Castillo',
  sobre_cupo_en: '2026-11-05T14:00:00Z',
  unit_estado: null,
  pareja_origen: 'ficha_nueva',
  acceso_estado: 'enviada',
  acceso_ultimo_envio_fallido: true,
}

describe('construirInscritas', () => {
  it('maps every field the screen needs, with origen and por_verificar from the extras', () => {
    const extras = new Map<string, ExtraInscripcion>([['i-1', { origen: 'publico', porVerificar: true }]])
    expect(construirInscritas([FILA], extras)).toEqual([
      {
        id: 'i-1',
        nombre: 'Ana Pérez',
        correo: 'ana@example.com',
        companero: 'Luis Pérez',
        vinculo: 'matrimonio',
        estado: 'pendiente',
        origen: 'publico',
        porVerificar: true,
        grupoId: null,
        grupoNombre: null,
        solicito: '2026-11-04T14:00:00Z',
        sobreCupo: true,
        sobreCupoPor: 'Neida Castillo',
        sobreCupoEn: '2026-11-05T14:00:00Z',
        resultado: null,
        fichaNueva: true,
        accesoEstado: 'enviada',
        accesoFallido: true,
      },
    ])
  })

  it('defaults origen to null and por_verificar to false without extras, and optional fields to empty', () => {
    const { sobre_cupo: _a, sobre_cupo_por_nombre: _b, sobre_cupo_en: _c, unit_estado: _d, pareja_origen: _e, acceso_estado: _f, acceso_ultimo_envio_fallido: _g, ...minima } = FILA
    const [fila] = construirInscritas([{ ...minima, companero_id: null }], new Map())
    expect(fila).toMatchObject({
      origen: null,
      porVerificar: false,
      companero: null,
      sobreCupo: false,
      sobreCupoPor: null,
      resultado: null,
      fichaNueva: false,
      accesoEstado: null,
      accesoFallido: false,
    })
  })
})

function i(o: Partial<InscritaEdicion>): InscritaEdicion {
  return { ...construirInscritas([FILA], new Map())[0], companero: null, ...o }
}

const ITEMS = [
  i({ id: 'a', nombre: 'Ana', estado: 'pendiente', origen: 'app' }),
  i({ id: 'b', nombre: 'Beatriz Núñez', estado: 'pendiente', origen: 'publico', porVerificar: true }),
  i({ id: 'c', nombre: 'Carla', estado: 'aprobado', origen: 'admin', grupoId: null }),
  i({ id: 'd', nombre: 'Dora', estado: 'aprobado', origen: 'publico', grupoId: 'g-1' }),
  i({ id: 'e', nombre: 'Eva', estado: 'no_aprobado', origen: 'app' }),
]

describe('filters and counts', () => {
  it('counts por aprobar, sin grupo (aprobadas only) and por verificar (pendientes only)', () => {
    expect(contarAtencion([...ITEMS, i({ id: 'x', estado: 'aprobado', porVerificar: true, grupoId: 'g-1' })])).toEqual({
      aprobar: 2,
      'sin-grupo': 1,
      identidad: 1,
    })
  })

  it('filters by atención, origen and search (accents and case ignored), combined', () => {
    const ids = (f: Parameters<typeof filtrarInscritas>[1]) => filtrarInscritas(ITEMS, f).map((x) => x.id)
    expect(ids(FILTROS_INICIALES)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(ids({ ...FILTROS_INICIALES, atencion: 'aprobar' })).toEqual(['a', 'b'])
    expect(ids({ ...FILTROS_INICIALES, atencion: 'sin-grupo' })).toEqual(['c'])
    expect(ids({ ...FILTROS_INICIALES, atencion: 'identidad' })).toEqual(['b'])
    expect(ids({ ...FILTROS_INICIALES, origen: 'publico' })).toEqual(['b', 'd'])
    expect(ids({ ...FILTROS_INICIALES, q: 'nunez' })).toEqual(['b'])
    expect(ids({ atencion: 'aprobar', origen: 'app', q: '' })).toEqual(['a'])
  })

  it('only pendientes with a confirmed identity go in the bulk approval', () => {
    expect(ITEMS.filter(esLoteable).map((x) => x.id)).toEqual(['a'])
  })

  it('labels a grupo option with facilitadora and ocupación, — when unknown', () => {
    expect(etiquetaGrupo({ id: 'g', nombre: 'Grupo 1', facilitadora: 'Yelitza Rojas', ocupacion: 4, capacidad: 8 })).toBe(
      'Grupo 1 · Yelitza Rojas · 4 de 8',
    )
    expect(etiquetaGrupo({ id: 'g', nombre: 'Grupo 2', facilitadora: null, ocupacion: null, capacidad: 8 })).toBe('Grupo 2 · — de 8')
  })
})

describe('URL', () => {
  it('reads known values and drops unknown ones', () => {
    expect(leerFiltros({ atencion: 'sin-grupo', origen: 'admin', q: 'ana' })).toEqual({ atencion: 'sin-grupo', origen: 'admin', q: 'ana' })
    expect(leerFiltros({ atencion: 'retiro', origen: 'web' })).toEqual(FILTROS_INICIALES)
    expect(leerVista('grupos')).toBe('grupos')
    expect(leerVista('otra')).toBe('inscripciones')
    expect(leerVista(undefined)).toBe('inscripciones')
  })

  it('writes only what differs from the defaults', () => {
    expect(consultaDe('inscripciones', FILTROS_INICIALES, null)).toBe('')
    expect(consultaDe('grupos', { atencion: 'aprobar', origen: 'publico', q: ' ana ' }, 'i-1')).toBe(
      '?vista=grupos&atencion=aprobar&origen=publico&q=ana&item=i-1',
    )
  })
})
