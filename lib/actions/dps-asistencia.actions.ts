'use server'

/**
 * DPS — server actions of the Sunday attendance (/dream-team/dps/asistencia,
 * T9 of odd/tasks/dps-asistencia-pco.md): reload the sheet of a plan, mark
 * people (llegó / avisó que no viene / clear) and "Marcar todo el equipo".
 * The client applies the marks in place, so nothing is revalidated.
 *
 * Gate: an authenticated session only. Who may mark whom, the 14-day window
 * and who belongs to each team are decided in the database
 * (supabase/migrations/20261108202000_dps_planificacion_convocados.sql),
 * which raises its code as the message; the Spanish texts are in
 * lib/platform/dream-team/dps/errores.ts.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { codigoErrorDps, mensajeErrorDps, type CodigoErrorDps, type ContextoErrorDps, type ErrorRpc } from '@/lib/platform/dream-team/dps/errores'
import { leerPlanilla, type EstadoDps, type PlanillaDps } from '@/lib/platform/dream-team/dps/planilla'
import { rpcDps } from '@/lib/platform/dream-team/dps/rpc'

export type ResultadoDps<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string; readonly codigo: CodigoErrorDps | null }

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const DATOS_INVALIDOS = 'Revisa los datos e inténtalo de nuevo.'
/** dps_asistencia_marcar takes at most 300 ids ('demasiados'). */
const MAX_PERSONAS = 300
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ESTADOS: readonly EstadoDps[] = ['llego', 'aviso_no_viene']

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

/** The sheet of the plan, for every team the caller passes attendance in. */
export async function cargarPlanillaDps(input: { readonly planId: string }): Promise<ResultadoDps<PlanillaDps>> {
  if (!esUuid(input?.planId)) return fallo(DATOS_INVALIDOS)
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { data, error } = await rpc('dps_asistencia_planilla', { p_plan_id: input.planId, p_equipo_id: null })
  if (error) return falloRpc(error, 'planilla')
  return { ok: true, data: leerPlanilla(data) }
}

export interface MarcarAsistenciaInput {
  readonly planId: string
  readonly personaIds: readonly string[]
  /** null clears the mark. */
  readonly estado: EstadoDps | null
}

export async function marcarAsistenciaDps(input: MarcarAsistenciaInput): Promise<ResultadoDps<{ readonly cambiados: number }>> {
  const ids = input?.personaIds
  if (
    !esUuid(input?.planId) ||
    !Array.isArray(ids) ||
    ids.length === 0 ||
    !ids.every(esUuid) ||
    (input.estado !== null && !ESTADOS.includes(input.estado))
  ) {
    return fallo(DATOS_INVALIDOS)
  }
  if (ids.length > MAX_PERSONAS) return falloRpc({ message: 'demasiados' }, 'asistencia')
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { data, error } = await rpc('dps_asistencia_marcar', {
    p_plan_id: input.planId,
    p_persona_ids: [...ids],
    p_estado: input.estado,
    p_solo_sin_marcar: false,
  })
  if (error) return falloRpc(error, 'asistencia')
  const cambiados = Number((data as { cambiados?: unknown } | null)?.cambiados)
  return { ok: true, data: { cambiados: Number.isFinite(cambiados) ? cambiados : 0 } }
}

/** "Marcar todo el equipo": its convocados without a mark (an aviso stays). */
export async function marcarEquipoDps(input: { readonly planId: string; readonly equipoId: string }): Promise<ResultadoDps<{ readonly cambiados: number }>> {
  if (!esUuid(input?.planId) || !esUuid(input?.equipoId)) return fallo(DATOS_INVALIDOS)
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { data, error } = await rpc('dps_asistencia_marcar_equipo', { p_plan_id: input.planId, p_equipo_id: input.equipoId, p_estado: 'llego' })
  if (error) return falloRpc(error, 'asistencia')
  const cambiados = Number(data)
  return { ok: true, data: { cambiados: Number.isFinite(cambiados) ? cambiados : 0 } }
}
