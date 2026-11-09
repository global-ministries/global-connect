'use server'

/**
 * DPS — server actions of the service notices in the app panel
 * (odd/tasks/dps-asistencia-pco.md, T15a; S13.2-S13.4, S13.6; artboards
 * design/dps-avisos 01-07): the planner reviews and sends the notices of the
 * visible plans and reads each person's state; the person reads «Mis
 * servicios», answers Confirmar / No puedo, dismisses a notice and keeps
 * «Fechas que no puedo servir».
 *
 * Gate: an authenticated session only. Who may do what is the database's
 * call (supabase/migrations/20261109210000_dps_avisos.sql: planners through
 * dps_exigir_planificador, the person only on their own rows), which raises
 * its code as the message; the Spanish texts are in
 * lib/platform/dps/errores.ts. Nothing is revalidated: the screens apply the
 * answer in place.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  MAX_PLANES_AVISOS,
  esRespuestaAviso,
  leerEnvioAvisos,
  leerEstadoAvisos,
  leerFechaBloqueada,
  leerFechasBloqueadas,
  leerMiServicio,
  leerMisServicios,
  leerPendientesAvisos,
  leerPersonasBloqueadas,
  leerServicioAviso,
  validarFechaBloqueada,
  validarMotivo,
  type EnvioAvisos,
  type EstadoAvisos,
  type FechaBloqueada,
  type MiServicio,
  type MisServicios,
  type PendientesAvisos,
  type PersonaBloqueada,
  type RespuestaAviso,
  type ServicioAviso,
} from '@/lib/platform/dps/avisos'
import { MENSAJE_DEMASIADOS_PLANES, codigoErrorDps, mensajeErrorDps, type CodigoErrorDps, type ContextoErrorDps, type ErrorRpc } from '@/lib/platform/dps/errores'
import { rpcDps } from '@/lib/platform/dps/rpc'
import type { ResultadoDps } from './dps-asistencia.actions'

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const DATOS_INVALIDOS = 'Revisa los datos e inténtalo de nuevo.'
const ERROR_CARGAR_SERVICIO = 'No se pudo cargar el servicio. Actualiza la página.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID_RE.test(valor)
const fallo = (message: string, codigo: CodigoErrorDps | null = null) => ({ ok: false, message, codigo }) as const
const falloRpc = (error: ErrorRpc, contexto: ContextoErrorDps) => fallo(mensajeErrorDps(error, contexto), codigoErrorDps(error))

async function rpcConSesion() {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  return user ? rpcDps(cliente) : null
}

/** The plans asked for, once each; null for a bad id, 'demasiados' past 400. */
function planesValidos(planIds: unknown): string[] | null | 'demasiados' {
  if (!Array.isArray(planIds) || !planIds.every(esUuid)) return null
  const unicos = [...new Set(planIds)]
  return unicos.length > MAX_PLANES_AVISOS ? 'demasiados' : unicos
}

async function llamarPlanes<T>(
  nombre: 'dps_avisos_pendientes' | 'dps_avisos_enviar' | 'dps_avisos_estado',
  planIds: unknown,
  leer: (data: unknown) => T,
): Promise<ResultadoDps<T>> {
  const planes = planesValidos(planIds)
  if (planes === null) return fallo(DATOS_INVALIDOS)
  if (planes === 'demasiados') return fallo(MENSAJE_DEMASIADOS_PLANES, 'demasiados')
  if (planes.length === 0) return { ok: true, data: leer(null) }
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { data, error } = await rpc(nombre, { p_plan_ids: planes })
  if (error) return falloRpc(error, 'avisos')
  return { ok: true, data: leer(data) }
}

/** «Enviar avisos» (02): what the send would deliver for the visible plans (past ones are ignored). */
export async function cargarAvisosPendientesDps(input: { readonly planIds: readonly string[] }): Promise<ResultadoDps<PendientesAvisos>> {
  return llamarPlanes('dps_avisos_pendientes', input?.planIds, leerPendientesAvisos)
}

/** Sends every pending notice of the plans at once; a second send sends 0. */
export async function enviarAvisosDps(input: { readonly planIds: readonly string[] }): Promise<ResultadoDps<EnvioAvisos>> {
  return llamarPlanes('dps_avisos_enviar', input?.planIds, leerEnvioAvisos)
}

/** Each person's state per plan (01, 03) and «N avisos sin enviar». */
export async function cargarEstadoAvisosDps(input: { readonly planIds: readonly string[] }): Promise<ResultadoDps<EstadoAvisos>> {
  return llamarPlanes('dps_avisos_estado', input?.planIds, leerEstadoAvisos)
}

/** Who blocked the plan's date: the picker warns, it does not hide them (S13.6). */
export async function cargarPersonasBloqueadasDps(input: { readonly planId: string }): Promise<ResultadoDps<PersonaBloqueada[]>> {
  if (!esUuid(input?.planId)) return fallo(DATOS_INVALIDOS)
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { data, error } = await rpc('dps_personas_bloqueadas', { p_plan_id: input.planId })
  if (error) return falloRpc(error, 'avisos')
  return { ok: true, data: leerPersonasBloqueadas(data) }
}

/** «Mis servicios» of the person in session (04, 07). */
export async function cargarMisServiciosDps(): Promise<ResultadoDps<MisServicios>> {
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { data, error } = await rpc('dps_mis_servicios', undefined)
  if (error) return falloRpc(error, 'mis_servicios')
  return { ok: true, data: leerMisServicios(data) }
}

/** One service with «Quiénes sirven contigo» and the order (05); only where the person was notified. */
export async function cargarMiServicioDps(input: { readonly planId: string }): Promise<ResultadoDps<MiServicio>> {
  if (!esUuid(input?.planId)) return fallo(DATOS_INVALIDOS)
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { data, error } = await rpc('dps_mi_servicio', { p_plan_id: input.planId })
  if (error) return falloRpc(error, 'mis_servicios')
  const servicio = leerMiServicio(data)
  return servicio ? { ok: true, data: servicio } : fallo(ERROR_CARGAR_SERVICIO)
}

/** Confirmar / No puedo (motivo optional, only with No puedo); returns the service. */
export async function responderServicioDps(input: {
  readonly planId: string
  readonly respuesta: RespuestaAviso
  readonly motivo?: string | null
}): Promise<ResultadoDps<ServicioAviso>> {
  if (!esUuid(input?.planId)) return fallo(DATOS_INVALIDOS)
  if (!esRespuestaAviso(input.respuesta)) return falloRpc({ message: 'respuesta_invalida' }, 'mis_servicios')
  const motivo = input.respuesta === 'no_puede' ? validarMotivo(input.motivo) : ({ ok: true, motivo: null } as const)
  if (!motivo.ok) return fallo(motivo.mensaje, 'motivo_invalido')
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { data, error } = await rpc('dps_responder', { p_plan_id: input.planId, p_respuesta: input.respuesta, p_motivo: motivo.motivo })
  if (error) return falloRpc(error, 'mis_servicios')
  const servicio = leerServicioAviso(data)
  return servicio ? { ok: true, data: servicio } : falloRpc({ message: null }, 'mis_servicios')
}

/** «Entendido» on «Ya no estás programado» / «Cambió tu servicio». */
export async function marcarAvisoVistoDps(input: { readonly planId: string }): Promise<ResultadoDps<null>> {
  if (!esUuid(input?.planId)) return fallo(DATOS_INVALIDOS)
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { error } = await rpc('dps_aviso_visto', { p_plan_id: input.planId })
  if (error) return falloRpc(error, 'mis_servicios')
  return { ok: true, data: null }
}

/** «Fechas que no puedo servir» (06): the ranges that have not ended, with their conflicts. */
export async function cargarMisFechasBloqueadasDps(): Promise<ResultadoDps<FechaBloqueada[]>> {
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { data, error } = await rpc('dps_mis_fechas_bloqueadas', undefined)
  if (error) return falloRpc(error, 'fechas_bloqueadas')
  return { ok: true, data: leerFechasBloqueadas(data) }
}

/** Blocks a range (one Sunday = desde and hasta the same day); the services inside come back as a warning. */
export async function agregarFechaBloqueadaDps(input: {
  readonly desde: string
  readonly hasta: string
  readonly nota?: string | null
}): Promise<ResultadoDps<FechaBloqueada>> {
  const revisada = validarFechaBloqueada(input?.desde, input?.hasta, input?.nota)
  if (!revisada.ok) return fallo(revisada.mensaje, revisada.codigo)
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { data, error } = await rpc('dps_fecha_bloqueada_agregar', { p_desde: revisada.desde, p_hasta: revisada.hasta, p_nota: revisada.nota })
  if (error) return falloRpc(error, 'fechas_bloqueadas')
  const fecha = leerFechaBloqueada(data)
  return fecha ? { ok: true, data: fecha } : falloRpc({ message: null }, 'fechas_bloqueadas')
}

export async function quitarFechaBloqueadaDps(input: { readonly id: string }): Promise<ResultadoDps<null>> {
  if (!esUuid(input?.id)) return fallo(DATOS_INVALIDOS)
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { error } = await rpc('dps_fecha_bloqueada_quitar', { p_id: input.id })
  if (error) return falloRpc(error, 'fechas_bloqueadas')
  return { ok: true, data: null }
}
