'use server'

/**
 * DPS — server actions of the «Orden» tab of /dps/plan (T13 of
 * odd/tasks/dps-asistencia-pco.md; S10): read the order, start it from the
 * template of the PDF, add / save / move / remove a row, «Copiar orden del
 * domingo anterior» and save the plan's own horarios (services and
 * llegada). The client applies the changes in place, so nothing is
 * revalidated.
 *
 * Gate: an authenticated session only. Every RPC goes through the session
 * client, so the database decides who sees and who edits
 * (supabase/migrations/20261108208000_dps_orden_servicio.sql), raising its
 * code as the message; the Spanish texts are in lib/platform/dps/errores.ts.
 * Malformed input is refused before calling; invalid horarios get the same
 * code the RPC would raise (lib/platform/dps/horarios.ts).
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { codigoErrorDps, mensajeErrorDps, type CodigoErrorDps, type ContextoErrorDps, type ErrorRpc } from '@/lib/platform/dps/errores'
import { validarHorarios } from '@/lib/platform/dps/horarios'
import { FASES, leerFilaOrden, leerOrden, MAX_DURACION_SEG, type FaseOrden, type FilaOrden, type OrdenPlan, type TipoFilaOrden } from '@/lib/platform/dps/orden'
import { leerPlanCabecera, type PlanCabecera } from '@/lib/platform/dps/plan'
import { rpcDps, type RpcDps } from '@/lib/platform/dps/rpc'

import type { ResultadoDps } from './dps-asistencia.actions'

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const DATOS_INVALIDOS = 'Revisa los datos e inténtalo de nuevo.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID_RE.test(valor)
const esTextoONulo = (valor: unknown): valor is string | null => valor === null || typeof valor === 'string'
const esDuracion = (valor: unknown): valor is number => Number.isInteger(valor) && (valor as number) >= 0 && (valor as number) <= MAX_DURACION_SEG
const esFaseONula = (valor: unknown): valor is FaseOrden | null => valor === null || (FASES as readonly unknown[]).includes(valor)
const fallo = (message: string, codigo: CodigoErrorDps | null = null) => ({ ok: false, message, codigo }) as const
const falloRpc = (error: ErrorRpc, contexto: ContextoErrorDps) => fallo(mensajeErrorDps(error, contexto), codigoErrorDps(error))

async function sesion(): Promise<{ rpc: RpcDps } | null> {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  return user ? { rpc: rpcDps(cliente) } : null
}

/** One RPC with the session client; its JSON read by `leer`, a failure in `contexto`'s words. */
async function llamar<T>(nombre: string, args: Record<string, unknown>, contexto: ContextoErrorDps, leer: (data: unknown) => T | null): Promise<ResultadoDps<T>> {
  const s = await sesion()
  if (!s) return fallo(SIN_SESION)
  const { data, error } = await s.rpc(nombre, args)
  if (error) return falloRpc(error, contexto)
  const leido = leer(data)
  return leido === null ? falloRpc({ message: null }, contexto) : { ok: true, data: leido }
}

/** The order of the plan (dps_orden_leer). */
export async function cargarOrdenDps(input: { readonly planId: string }): Promise<ResultadoDps<OrdenPlan>> {
  if (!esUuid(input?.planId)) return fallo(DATOS_INVALIDOS)
  return llamar('dps_orden_leer', { p_plan_id: input.planId }, 'plan', leerOrden)
}

/** An empty order starts with the sections of the PDF (dps_orden_plantilla). */
export async function plantillaOrdenDps(input: { readonly planId: string }): Promise<ResultadoDps<OrdenPlan>> {
  if (!esUuid(input?.planId)) return fallo(DATOS_INVALIDOS)
  return llamar('dps_orden_plantilla', { p_plan_id: input.planId }, 'orden', leerOrden)
}

export interface AgregarFilaInput {
  readonly planId: string
  readonly tipo: TipoFilaOrden
  readonly titulo: string
  readonly duracionSeg: number
  /** null = at the end. */
  readonly posicion: number | null
  /** Headers only; null = 'servicio'. */
  readonly fase: FaseOrden | null
}

export async function agregarFilaOrdenDps(input: AgregarFilaInput): Promise<ResultadoDps<FilaOrden>> {
  if (
    !esUuid(input?.planId) ||
    (input.tipo !== 'item' && input.tipo !== 'encabezado') ||
    typeof input.titulo !== 'string' ||
    !esDuracion(input.duracionSeg) ||
    !(input.posicion === null || Number.isInteger(input.posicion)) ||
    !esFaseONula(input.fase)
  ) {
    return fallo(DATOS_INVALIDOS)
  }
  return llamar(
    'dps_orden_agregar',
    { p_plan_id: input.planId, p_tipo: input.tipo, p_titulo: input.titulo, p_duracion_seg: input.duracionSeg, p_posicion: input.posicion, p_fase: input.fase },
    'orden',
    leerFilaOrden,
  )
}

export interface GuardarFilaInput {
  readonly itemId: string
  readonly titulo: string
  readonly duracionSeg: number
  readonly notas: string | null
  readonly responsable: string | null
  /** Headers only; null keeps it. */
  readonly fase: FaseOrden | null
}

/** The whole row after an inline edit (dps_orden_item_guardar). */
export async function guardarFilaOrdenDps(input: GuardarFilaInput): Promise<ResultadoDps<FilaOrden>> {
  if (
    !esUuid(input?.itemId) ||
    typeof input.titulo !== 'string' ||
    !esDuracion(input.duracionSeg) ||
    !esTextoONulo(input.notas) ||
    !esTextoONulo(input.responsable) ||
    !esFaseONula(input.fase)
  ) {
    return fallo(DATOS_INVALIDOS)
  }
  return llamar(
    'dps_orden_item_guardar',
    { p_item_id: input.itemId, p_titulo: input.titulo, p_duracion_seg: input.duracionSeg, p_notas: input.notas, p_responsable: input.responsable, p_fase: input.fase },
    'orden',
    leerFilaOrden,
  )
}

export async function moverFilaOrdenDps(input: { readonly itemId: string; readonly posicion: number }): Promise<ResultadoDps<{ readonly posicion: number }>> {
  if (!esUuid(input?.itemId) || !Number.isInteger(input.posicion) || input.posicion < 0) return fallo(DATOS_INVALIDOS)
  return llamar('dps_orden_mover', { p_item_id: input.itemId, p_posicion: input.posicion }, 'orden', (data) =>
    Number.isInteger(data) ? { posicion: data as number } : null,
  )
}

export async function quitarFilaOrdenDps(input: { readonly itemId: string }): Promise<ResultadoDps<{ readonly quitado: boolean }>> {
  if (!esUuid(input?.itemId)) return fallo(DATOS_INVALIDOS)
  return llamar('dps_orden_eliminar', { p_item_id: input.itemId }, 'orden', (data) => ({ quitado: data === true }))
}

export interface CopiarOrdenInput {
  readonly origenId: string
  readonly destinoId: string
  /** Without it, a plan that already has an order answers 'destino_con_orden'. */
  readonly reemplazar: boolean
}

/** «Copiar orden del domingo anterior» (dps_orden_copiar): how many rows were copied. */
export async function copiarOrdenDps(input: CopiarOrdenInput): Promise<ResultadoDps<{ readonly copiados: number }>> {
  if (!esUuid(input?.origenId) || !esUuid(input?.destinoId) || input.origenId === input.destinoId || typeof input.reemplazar !== 'boolean') {
    return fallo(DATOS_INVALIDOS)
  }
  return llamar('dps_orden_copiar', { p_origen_id: input.origenId, p_destino_id: input.destinoId, p_reemplazar: input.reemplazar }, 'orden', (data) => ({
    copiados: Number.isInteger(data) ? (data as number) : 0,
  }))
}

export interface GuardarHorariosInput {
  readonly planId: string
  /** 1 to 4 starts 'HH:MM', ascending. */
  readonly horarios: readonly string[]
  readonly llegada: string
}

/** The plan's own services and llegada (dps_plan_horarios_guardar, S10); returns the plan for the header. */
export async function guardarHorariosDps(input: GuardarHorariosInput): Promise<ResultadoDps<PlanCabecera>> {
  if (!esUuid(input?.planId) || !Array.isArray(input.horarios) || !input.horarios.every((h) => typeof h === 'string') || typeof input.llegada !== 'string') {
    return fallo(DATOS_INVALIDOS)
  }
  const invalido = validarHorarios(input.horarios, input.llegada)
  if (invalido) return falloRpc({ message: invalido }, 'horarios')
  return llamar('dps_plan_horarios_guardar', { p_plan_id: input.planId, p_horarios: [...input.horarios], p_llegada: input.llegada }, 'horarios', leerPlanCabecera)
}
