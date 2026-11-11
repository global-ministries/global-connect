/**
 * R3e (odd/tasks/talleres-rediseno.md, S1, S4) — the pure model of
 * /talleres/pendientes v2: building items from the loaders, attention
 * filters, scope by taller, order, bulk eligibility, days waiting and the
 * URL params.
 */

import {
  FILTROS_INICIALES,
  alcanceTalleres,
  consultaDe,
  construirItems,
  contarAtencion,
  diasEsperando,
  esLoteable,
  filtrarPendientes,
  leerFiltros,
  resumenPendientes,
  textoEspera,
  type ItemPendiente,
} from '@/components/talleres/pendientes/vista-pendientes'
import type { InscripcionAdminRow } from '@/lib/platform/talleres/inscripciones-types'
import type { PendienteSolicitudRow, PendientesInscripcionesResult } from '@/lib/platform/talleres/pendientes'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'

function row(o: Partial<InscripcionAdminRow> = {}): InscripcionAdminRow {
  return {
    id: 'insc-1',
    edicion_id: 'ed-1',
    edicion_nombre: 'Edición nov 2026',
    edicion_estado: 'abierto',
    taller_id: 't-1',
    taller_nombre: 'Mujer de Hoy',
    taller_slug: 'mujer-de-hoy',
    cohorte_id: null,
    cohorte_edicion: null,
    persona_principal_id: 'p-1',
    persona_principal_nombre: 'Yusmary Pérez',
    persona_principal_email: 'yus@example.com',
    companero_id: null,
    companero_nombre: null,
    link_type: null,
    estado: 'pendiente',
    created_at: '2026-11-07T14:00:00Z',
    updated_at: '2026-11-07T14:00:00Z',
    grupo_id: null,
    grupo_nombre: null,
    ...o,
  }
}

function fuente(
  rows: readonly InscripcionAdminRow[],
  extras: Record<string, { origen?: 'app' | 'admin' | 'publico' | null; porVerificar?: boolean; grupoId?: string | null }> = {},
): PendientesInscripcionesResult {
  return {
    rows,
    equipoIdByTallerId: new Map(rows.map((r) => [r.taller_id, `eq-${r.taller_id}`])),
    extraPorInscripcion: new Map(
      Object.entries(extras).map(([id, e]) => [id, { origen: e.origen ?? null, porVerificar: e.porVerificar ?? false, grupoId: e.grupoId ?? null }]),
    ),
  }
}

const VACIA = fuente([])
const TODO: PermisosTaller = { ...PERMISOS_TALLER_ALL_FALSE, aprobarInscripciones: true, resolverRetiros: true, gestionarGrupos: true }
const todo = () => TODO

function solicitud(o: Partial<PendienteSolicitudRow> = {}): PendienteSolicitudRow {
  return {
    id: 'sol-1',
    inscripcion_id: 'insc-9',
    grupo_asignacion_id: null,
    tipo: 'participante_retiro',
    estado: 'pendiente',
    motivo: 'Cambié de turno en el trabajo.',
    created_at: '2026-11-09T12:00:00Z',
    equipoId: 'eq-1',
    tallerNombre: 'Mujer de Hoy',
    tallerSlug: 'mujer-de-hoy',
    personaNombre: 'Andreína Colmenárez',
    personaCorreo: 'andreina@example.com',
    edicionId: 'ed-0',
    ...o,
  }
}

describe('construirItems', () => {
  it('builds one item per pendiente inscripción with its origen, por_verificar flag and pareja name', () => {
    const [item] = construirItems({
      pendientes: fuente([row({ companero_id: 'p-2', companero_nombre: 'Rafael Colmenárez' })], {
        'insc-1': { origen: 'publico', porVerificar: true },
      }),
      aprobadas: VACIA,
      solicitudes: [],
      permisosDe: todo,
    })
    expect(item).toMatchObject({
      clave: 'aprobar:insc-1',
      tipo: 'aprobar',
      nombre: 'Yusmary Pérez y Rafael Colmenárez',
      enPareja: true,
      origen: 'publico',
      porVerificar: true,
      tallerClave: 'mujer-de-hoy',
      edicionId: 'ed-1',
      puedeDecidir: true,
    })
  })

  it('takes «sin grupo» only from aprobadas without grupo in an abierta or en curso edición', () => {
    const items = construirItems({
      pendientes: VACIA,
      aprobadas: fuente(
        [
          row({ id: 'a-abierta', estado: 'aprobado' }),
          row({ id: 'a-curso', estado: 'aprobado', edicion_estado: 'en_curso' }),
          row({ id: 'a-cerrada', estado: 'aprobado', edicion_estado: 'cerrado' }),
          row({ id: 'a-con-grupo', estado: 'aprobado' }),
          row({ id: 'a-sin-dato', estado: 'aprobado' }),
        ],
        { 'a-abierta': {}, 'a-curso': {}, 'a-cerrada': {}, 'a-con-grupo': { grupoId: 'g-1' } },
      ),
      solicitudes: [],
      permisosDe: todo,
    })
    expect(items.map((i) => i.clave)).toEqual(['sin-grupo:a-abierta', 'sin-grupo:a-curso'])
  })

  it('names a retiro by its persona, falls back by tipo, and resolves its permission from its equipo', () => {
    const items = construirItems({
      pendientes: VACIA,
      aprobadas: VACIA,
      solicitudes: [
        solicitud(),
        solicitud({ id: 'sol-2', tipo: 'equipo_retiro_definitivo', personaNombre: null, equipoId: 'eq-otro', tallerSlug: null, tallerNombre: null }),
      ],
      permisosDe: (equipoId) => (equipoId === 'eq-1' ? TODO : PERMISOS_TALLER_ALL_FALSE),
    })
    expect(items[0]).toMatchObject({ clave: 'retiro:sol-1', nombre: 'Andreína Colmenárez', puedeDecidir: true, edicionId: 'ed-0' })
    expect(items[1]).toMatchObject({
      nombre: 'Servidor del equipo',
      tallerClave: 'sin-taller',
      tallerNombre: 'Taller no disponible',
      puedeDecidir: false,
    })
  })

  it('maps each kind to its own permission: aprobar, resolver retiros, gestionar grupos', () => {
    const items = construirItems({
      pendientes: fuente([row({ id: 'p' })]),
      aprobadas: fuente([row({ id: 'a', estado: 'aprobado' })], { a: {} }),
      solicitudes: [solicitud()],
      permisosDe: () => ({ ...PERMISOS_TALLER_ALL_FALSE, gestionarGrupos: true }),
    })
    expect(Object.fromEntries(items.map((i) => [i.clave, i.puedeDecidir]))).toEqual({
      'retiro:sol-1': false,
      'aprobar:p': false,
      'sin-grupo:a': true,
    })
  })
})

function item(o: Partial<ItemPendiente>): ItemPendiente {
  return {
    clave: 'aprobar:x',
    tipo: 'aprobar',
    id: 'x',
    nombre: 'Persona',
    correo: null,
    enPareja: false,
    tallerClave: 'mujer-de-hoy',
    tallerNombre: 'Mujer de Hoy',
    tallerSlug: 'mujer-de-hoy',
    edicionId: 'ed-1',
    edicionNombre: 'Edición nov 2026',
    origen: 'app',
    porVerificar: false,
    fecha: '2026-11-08T12:00:00Z',
    motivo: null,
    tipoRetiro: null,
    puedeDecidir: true,
    ...o,
  }
}

const LISTA: ItemPendiente[] = [
  item({ clave: 'sin-grupo:1', tipo: 'sin-grupo', nombre: 'Yorbelis Mujica', fecha: '2026-11-03T12:00:00Z' }),
  item({ clave: 'aprobar:nuevo', nombre: 'Gustavo Linárez', fecha: '2026-11-10T12:00:00Z', tallerClave: 'hombre', tallerNombre: 'De Hombre a Hombre' }),
  item({ clave: 'aprobar:viejo', nombre: 'Rosángela Escalona', fecha: '2026-11-04T12:00:00Z' }),
  item({ clave: 'aprobar:pv', nombre: 'Marbelis Colmenárez', porVerificar: true, fecha: '2026-11-08T12:00:00Z' }),
  item({ clave: 'retiro:1', tipo: 'retiro', nombre: 'Edgar Lucena', fecha: '2026-11-10T12:00:00Z', tallerClave: 'hombre', tallerNombre: 'De Hombre a Hombre' }),
]

describe('filtering, counting and ordering', () => {
  it('orders retiros first, then por aprobar, then sin grupo; the longest waiting first inside each', () => {
    expect(filtrarPendientes(LISTA, FILTROS_INICIALES).map((i) => i.clave)).toEqual([
      'retiro:1',
      'aprobar:viejo',
      'aprobar:pv',
      'aprobar:nuevo',
      'sin-grupo:1',
    ])
  })

  it('counts each attention metric; «Por verificar identidad» is a subset of «Por aprobar»', () => {
    expect(contarAtencion(LISTA)).toEqual({ aprobar: 3, identidad: 1, retiro: 1, 'sin-grupo': 1 })
  })

  it('filters by attention, by taller and by an accent-insensitive search', () => {
    expect(filtrarPendientes(LISTA, { ...FILTROS_INICIALES, atencion: 'identidad' }).map((i) => i.clave)).toEqual(['aprobar:pv'])
    expect(filtrarPendientes(LISTA, { ...FILTROS_INICIALES, taller: 'hombre' }).map((i) => i.clave)).toEqual([
      'retiro:1',
      'aprobar:nuevo',
    ])
    expect(filtrarPendientes(LISTA, { ...FILTROS_INICIALES, q: 'rosangela' }).map((i) => i.clave)).toEqual(['aprobar:viejo'])
  })

  it('groups the scope cards by taller with their flags, the busiest first', () => {
    expect(alcanceTalleres(LISTA)).toEqual([
      { clave: 'mujer-de-hoy', nombre: 'Mujer de Hoy', total: 3, porAprobar: 2, porVerificar: 1, retiros: 0 },
      { clave: 'hombre', nombre: 'De Hombre a Hombre', total: 2, porAprobar: 1, porVerificar: 0, retiros: 1 },
    ])
  })

  it('only a decidable, identity-confirmed por-aprobar item goes into «Aprobar varias»', () => {
    expect(esLoteable(item({}))).toBe(true)
    expect(esLoteable(item({ porVerificar: true }))).toBe(false)
    expect(esLoteable(item({ puedeDecidir: false }))).toBe(false)
    expect(esLoteable(item({ tipo: 'retiro' }))).toBe(false)
    expect(esLoteable(item({ tipo: 'sin-grupo' }))).toBe(false)
  })
})

describe('days waiting and summary', () => {
  const HOY = '2026-11-11T15:00:00Z'

  it('counts calendar days in Caracas time, never negative', () => {
    expect(diasEsperando('2026-11-11T13:00:00Z', HOY)).toBe(0)
    expect(diasEsperando('2026-11-10T13:00:00Z', HOY)).toBe(1)
    // 02:00 UTC on the 11th is still the 10th in Caracas (UTC-4).
    expect(diasEsperando('2026-11-11T02:00:00Z', HOY)).toBe(1)
    expect(diasEsperando('2026-11-03T12:00:00Z', HOY)).toBe(8)
    expect(diasEsperando('2026-11-12T12:00:00Z', HOY)).toBe(0)
  })

  it('says Hoy / Ayer / Hace N días', () => {
    expect([0, 1, 5].map(textoEspera)).toEqual(['Hoy', 'Ayer', 'Hace 5 días'])
  })

  it('summarizes the total, the talleres and the oldest wait', () => {
    expect(resumenPendientes(LISTA, HOY)).toEqual({ total: 5, talleres: 2, masAntigua: 8 })
    expect(resumenPendientes([], HOY)).toEqual({ total: 0, talleres: 0, masAntigua: 0 })
  })
})

describe('URL params', () => {
  it('reads valid params and drops an unknown attention', () => {
    expect(leerFiltros({ atencion: 'retiro', taller: 'mujer-de-hoy', q: 'ana' })).toEqual({
      atencion: 'retiro',
      taller: 'mujer-de-hoy',
      q: 'ana',
    })
    expect(leerFiltros({ atencion: 'pendiente' })).toEqual(FILTROS_INICIALES)
  })

  it('writes only what is set, plus the open item', () => {
    expect(consultaDe(FILTROS_INICIALES, null)).toBe('')
    expect(consultaDe({ atencion: 'sin-grupo', taller: null, q: ' ' }, 'sin-grupo:1')).toBe('?atencion=sin-grupo&item=sin-grupo%3A1')
  })
})
