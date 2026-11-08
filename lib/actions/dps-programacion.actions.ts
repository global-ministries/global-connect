'use server'

/**
 * DPS — server actions of the annual programming sheet (/dps/programacion,
 * T11 of odd/tasks/dps-asistencia-pco.md; S6.4, S7.3): reload a year, save
 * one cell and "Nueva serie". The client applies the changes in place, so
 * nothing is revalidated.
 *
 * Gate: an authenticated session only. Every RPC goes through the session
 * client, so the database decides who sees and who edits
 * (supabase/migrations/20261108201000_dps_planificacion_rpcs.sql:
 * dps_planes_rango, dps_plan_campo, dps_plan_crear, dps_serie_crear),
 * raising its code as the message; the Spanish texts are in
 * lib/platform/dps/programacion.ts and errores.ts.
 *
 * A Sunday of the sheet without a plan yet gets it on its first edit
 * (dps_plan_crear 'domingo', then dps_plan_campo). If someone created it
 * meanwhile ('plan_duplicado'), the cell goes to that plan. The series
 * cover is uploaded afterwards with cambiarPortadaDps (dps-plan.actions.ts)
 * on one of its plans.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { codigoErrorDps, type CodigoErrorDps, type ErrorRpc } from '@/lib/platform/dps/errores'
import { COLUMNAS_HOJA, esDomingo, leerPlanHoja, leerPlanesHoja, mensajeErrorProgramacion, valorParaRpc, type ColumnaHoja, type PlanHoja } from '@/lib/platform/dps/programacion'
import { rpcDps, type RpcDps } from '@/lib/platform/dps/rpc'

import type { ResultadoDps } from './dps-asistencia.actions'

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const DATOS_INVALIDOS = 'Revisa los datos e inténtalo de nuevo.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLORES = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5']

const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID_RE.test(valor)
const fallo = (message: string, codigo: CodigoErrorDps | null = null) => ({ ok: false, message, codigo }) as const
const falloRpc = (error: ErrorRpc) => fallo(mensajeErrorProgramacion(error), codigoErrorDps(error))

async function sesion(): Promise<RpcDps | null> {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  return user ? rpcDps(cliente) : null
}

/** The plans of a year (dps_planes_rango, 1 Jan to 31 Dec). */
export async function cargarProgramacionDps(input: { readonly anio: number }): Promise<ResultadoDps<PlanHoja[]>> {
  const anio = input?.anio
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return fallo(DATOS_INVALIDOS)
  const rpc = await sesion()
  if (!rpc) return fallo(SIN_SESION)

  const { data, error } = await rpc('dps_planes_rango', { p_desde: `${anio}-01-01`, p_hasta: `${anio}-12-31` })
  if (error) return falloRpc(error)
  return { ok: true, data: leerPlanesHoja(data) }
}

export interface GuardarCeldaInput {
  /** null: the Sunday has no plan yet. */
  readonly planId: string | null
  readonly fecha: string
  readonly columna: ColumnaHoja
  /** What the cell reads; '' clears it. */
  readonly valor: string
}

/** The id of the Sunday plan of the date, creating it when there is none. */
async function planDelDomingo(rpc: RpcDps, fecha: string): Promise<{ readonly id: string } | { readonly error: ErrorRpc }> {
  const creado = await rpc('dps_plan_crear', { p_fecha: fecha, p_tipo: 'domingo', p_titulo: null })
  if (!creado.error && esUuid(creado.data)) return { id: creado.data }
  if (creado.error && codigoErrorDps(creado.error) !== 'plan_duplicado') return { error: creado.error }
  const rango = await rpc('dps_planes_rango', { p_desde: fecha, p_hasta: fecha })
  if (rango.error) return { error: rango.error }
  const existente = leerPlanesHoja(rango.data).find((p) => p.tipo === 'domingo')
  return existente ? { id: existente.id } : { error: creado.error ?? { message: null } }
}

/** One cell (dps_plan_campo); returns the stored plan. */
export async function guardarCeldaDps(input: GuardarCeldaInput): Promise<ResultadoDps<PlanHoja>> {
  const columna = input?.columna
  if (!COLUMNAS_HOJA.some((c) => c.id === columna) || typeof input.valor !== 'string') return fallo(DATOS_INVALIDOS)
  if (input.planId === null ? !esDomingo(input.fecha) : !esUuid(input.planId)) return fallo(DATOS_INVALIDOS)
  const valor = valorParaRpc(columna, input.valor)
  if (!valor.ok) return fallo(valor.mensaje, 'valor_invalido')
  const rpc = await sesion()
  if (!rpc) return fallo(SIN_SESION)

  let planId = input.planId
  if (planId === null) {
    const plan = await planDelDomingo(rpc, input.fecha)
    if ('error' in plan) return falloRpc(plan.error)
    planId = plan.id
  }
  const { data, error } = await rpc('dps_plan_campo', { p_plan_id: planId, p_campo: columna, p_valor: valor.valor })
  if (error) return falloRpc(error)
  const plan = leerPlanHoja(data)
  return plan ? { ok: true, data: plan } : falloRpc({ message: null })
}

export interface CrearSerieInput {
  readonly nombre: string
  readonly primerDomingo: string
  readonly semanas: number
  /** chart-1 … chart-5 (colorNuevaSerie). */
  readonly color: string
}

/** "Nueva serie": the series and its Sundays (dps_serie_crear attaches a Sunday that has a plan without a series). */
export async function crearSerieDps(input: CrearSerieInput): Promise<ResultadoDps<{ readonly serieId: string; readonly planIds: string[] }>> {
  const nombre = typeof input?.nombre === 'string' ? input.nombre.trim() : ''
  if (
    !nombre ||
    nombre.length > 120 ||
    !esDomingo(input.primerDomingo) ||
    !Number.isInteger(input.semanas) ||
    input.semanas < 1 ||
    input.semanas > 52 ||
    !COLORES.includes(input.color)
  ) {
    return fallo(DATOS_INVALIDOS)
  }
  const rpc = await sesion()
  if (!rpc) return fallo(SIN_SESION)

  const { data, error } = await rpc('dps_serie_crear', {
    p_nombre: nombre,
    p_color: input.color,
    p_semanas: input.semanas,
    p_primer_domingo: input.primerDomingo,
    p_sinopsis: null,
    p_enlace: null,
  })
  if (error) return falloRpc(error)
  const r = (data ?? {}) as { serie_id?: unknown; planes?: unknown }
  const planIds = (Array.isArray(r.planes) ? r.planes : []).map((p) => (p as { id?: unknown })?.id).filter(esUuid)
  return { ok: true, data: { serieId: esUuid(r.serie_id) ? r.serie_id : '', planIds } }
}
