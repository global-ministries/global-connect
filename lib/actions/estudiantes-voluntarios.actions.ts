'use server'

/**
 * Estudiantes — server actions of the volunteer attendance
 * (/estudiantes/voluntarios, C5 of odd/tasks/estudiantes-fase-b.md): reload
 * the roster of a service and mark volunteers Presente / Avisó / Faltó. The
 * client applies the marks in place, so nothing is revalidated.
 *
 * Gate: an authenticated session only. Who may mark whom, who was expected
 * and the marking window are decided in the database
 * (supabase/migrations/20261101130000_estudiantes_voluntarios_asistencia.sql),
 * which raises its code as the message; the Spanish texts are the Niños ones
 * (lib/platform/ninos/voluntarios.ts), the same screen rules.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  ESTADOS_ASISTENCIA,
  leerPlanilla,
  mensajeErrorMarcar,
  mensajeErrorPlanilla,
  type EstadoAsistencia,
  type Planilla,
} from '@/lib/platform/ninos/voluntarios'

export type ResultadoVoluntarios<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string }

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const DATOS_INVALIDOS = 'Revisa los datos e inténtalo de nuevo.'
const MAX_SERVICIOS = 300
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID_RE.test(valor)
const esFecha = (valor: unknown): valor is string =>
  typeof valor === 'string' && FECHA_RE.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`))

async function clienteConSesion() {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  return user ? cliente : null
}

export interface ServicioVoluntariosInput {
  readonly turnoId: string
  readonly fecha: string
}

/** The roster of one service, with the current marks. */
export async function cargarPlanillaVoluntarios(input: ServicioVoluntariosInput): Promise<ResultadoVoluntarios<Planilla>> {
  const cliente = await clienteConSesion()
  if (!cliente) return { ok: false, message: SIN_SESION }
  if (!esUuid(input?.turnoId) || !esFecha(input?.fecha)) return { ok: false, message: DATOS_INVALIDOS }

  const { data, error } = await cliente.rpc('estudiantes_voluntarios_planilla', { p_turno_id: input.turnoId, p_fecha: input.fecha })
  if (error) return { ok: false, message: mensajeErrorPlanilla(error) }
  return { ok: true, data: leerPlanilla(data) }
}

export interface MarcarVoluntariosInput extends ServicioVoluntariosInput {
  readonly servicioIds: readonly string[]
  /** null clears the marks. */
  readonly estado: EstadoAsistencia | null
  /** "Marcar el resto como Faltó": existing marks stay. */
  readonly soloSinMarcar?: boolean
}

export async function marcarVoluntarios(input: MarcarVoluntariosInput): Promise<ResultadoVoluntarios<{ readonly cambiados: number }>> {
  const cliente = await clienteConSesion()
  if (!cliente) return { ok: false, message: SIN_SESION }
  const ids = input?.servicioIds
  if (
    !esUuid(input?.turnoId) ||
    !esFecha(input?.fecha) ||
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_SERVICIOS ||
    !ids.every(esUuid) ||
    (input.estado !== null && !ESTADOS_ASISTENCIA.includes(input.estado))
  ) {
    return { ok: false, message: DATOS_INVALIDOS }
  }

  const { data, error } = await cliente.rpc('estudiantes_voluntarios_marcar', {
    p_turno_id: input.turnoId,
    p_fecha: input.fecha,
    p_servicio_ids: [...ids],
    // NULL clears the marks; the generated types cannot express a nullable argument.
    p_estado: input.estado as string,
    p_solo_sin_marcar: input.soloSinMarcar === true,
  })
  if (error) return { ok: false, message: mensajeErrorMarcar(error) }
  const cambiados = Number((data as { cambiados?: unknown } | null)?.cambiados)
  return { ok: true, data: { cambiados: Number.isFinite(cambiados) ? cambiados : 0 } }
}
