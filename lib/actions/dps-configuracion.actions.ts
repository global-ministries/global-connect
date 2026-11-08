'use server'

/**
 * DPS — server actions of the configuration (/dps/configuracion,
 * T9 of odd/tasks/dps-asistencia-pco.md; S6.3): default horarios and
 * llegada, planificadores and "Quién pasa asistencia" per team.
 *
 * Gate: an authenticated session only. The writes are for configurators
 * (admin/pastor or the DPS direction, L17), which only the database knows
 * (dps_exigir_configurador in
 * supabase/migrations/20261108201000_dps_planificacion_rpcs.sql); a
 * 'sin_autoridad' comes back with its code so the screen turns read-only.
 * The person search reuses talleres_buscar_personas, the Dream Team
 * assigner's search (app/api/dream-team/usuarios/buscar/route.ts).
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { leerConfig, normalizarHorarios, validarLlegada, type ConfigDps } from '@/lib/platform/dps/configuracion'
import { codigoErrorDps, mensajeErrorDps, type CodigoErrorDps, type ErrorRpc } from '@/lib/platform/dps/errores'
import { rpcDps } from '@/lib/platform/dps/rpc'
import type { ResultadoDps } from './dps-asistencia.actions'

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const DATOS_INVALIDOS = 'Revisa los datos e inténtalo de nuevo.'
const SIN_PERMISO_BUSCAR = 'No tienes permiso para buscar personas.'
const ERROR_BUSCAR = 'No se pudo buscar. Intenta de nuevo.'
const MIN_BUSQUEDA = 2
const MAX_RESULTADOS = 20
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID_RE.test(valor)
const fallo = (message: string, codigo: CodigoErrorDps | null = null) => ({ ok: false, message, codigo }) as const
const falloRpc = (error: ErrorRpc) => fallo(mensajeErrorDps(error, 'configuracion'), codigoErrorDps(error))

async function rpcConSesion() {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  return user ? rpcDps(cliente) : null
}

export async function guardarHorariosDps(input: {
  readonly horarios: readonly string[]
  readonly llegada: string
}): Promise<ResultadoDps<{ readonly horarios: string[]; readonly llegada: string }>> {
  if (!Array.isArray(input?.horarios) || typeof input.llegada !== 'string') return fallo(DATOS_INVALIDOS)
  const horarios = normalizarHorarios(input.horarios)
  if (!horarios.ok) return fallo(horarios.mensaje, 'horarios_invalidos')
  const llegada = validarLlegada(input.llegada)
  if (!llegada.ok) return fallo(llegada.mensaje, 'llegada_invalida')
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { data, error } = await rpc('dps_config_guardar', { p_horarios: horarios.horarios, p_llegada: llegada.llegada })
  if (error) return falloRpc(error)
  const guardado = leerConfig(data)
  return { ok: true, data: { horarios: [...guardado.horarios], llegada: guardado.llegada } }
}

/** Adds a planner and returns the configuration read again (the list with names). */
export async function agregarPlanificadorDps(input: { readonly personaId: string }): Promise<ResultadoDps<ConfigDps>> {
  if (!esUuid(input?.personaId)) return fallo(DATOS_INVALIDOS)
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { error } = await rpc('dps_planificador_agregar', { p_persona_id: input.personaId })
  if (error) return falloRpc(error)
  const leida = await rpc('dps_config_leer', undefined)
  if (leida.error) return falloRpc(leida.error)
  return { ok: true, data: leerConfig(leida.data) }
}

export async function quitarPlanificadorDps(input: { readonly personaId: string }): Promise<ResultadoDps<null>> {
  if (!esUuid(input?.personaId)) return fallo(DATOS_INVALIDOS)
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { error } = await rpc('dps_planificador_quitar', { p_persona_id: input.personaId })
  if (error) return falloRpc(error)
  return { ok: true, data: null }
}

/** true / false, or null to inherit from the nearest ancestor. */
export async function guardarPasanAsistenciaDps(input: {
  readonly equipoId: string
  readonly habilitado: boolean | null
}): Promise<ResultadoDps<null>> {
  if (!esUuid(input?.equipoId) || !(input.habilitado === null || typeof input.habilitado === 'boolean')) return fallo(DATOS_INVALIDOS)
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { error } = await rpc('dps_pasan_asistencia_guardar', { p_equipo_id: input.equipoId, p_habilitado: input.habilitado })
  if (error) return falloRpc(error)
  return { ok: true, data: null }
}

export interface PersonaEncontradaDps {
  readonly personaId: string
  readonly nombre: string
}

/** People by name for "Agregar planificador": id and name only. */
export async function buscarPersonasDps(input: { readonly q: string }): Promise<ResultadoDps<PersonaEncontradaDps[]>> {
  const q = typeof input?.q === 'string' ? input.q.trim() : ''
  if (q.length < MIN_BUSQUEDA) return { ok: true, data: [] }
  const rpc = await rpcConSesion()
  if (!rpc) return fallo(SIN_SESION)

  const { data, error } = await rpc('talleres_buscar_personas', { p_q: q, p_limit: MAX_RESULTADOS })
  if (error) return error.code === '42501' ? fallo(SIN_PERMISO_BUSCAR, 'sin_autoridad') : fallo(ERROR_BUSCAR)
  const filas = Array.isArray(data) ? (data as { id?: unknown; nombre?: unknown; apellido?: unknown }[]) : []
  return {
    ok: true,
    data: filas
      .filter((f) => esUuid(f?.id))
      .map((f) => ({
        personaId: f.id as string,
        nombre: [f.nombre, f.apellido].filter((x): x is string => typeof x === 'string' && x.trim() !== '').join(' '),
      })),
  }
}
