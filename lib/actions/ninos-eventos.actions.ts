'use server'

/**
 * Niños — server actions of /ninos/eventos (odd/tasks/ninos-checkin-pco.md,
 * T1c, S5, S8): create and edit an event, archive or restore it, add a
 * horario, change its check-in window and remove it.
 *
 * Gate: an authenticated session only. Who may write (ninos_puede_configurar_campus:
 * admin, pastor or whoever configures every Niños area of the campus) and every
 * rule are checked again by the RPCs
 * (supabase/migrations/20261108100000_ninos_eventos.sql), whose HINT is
 * returned as is (lib/platform/ninos/eventos.ts). On success the screen is
 * revalidated.
 */

import { revalidatePath } from 'next/cache'

import {
  OPCIONES_EVENTO,
  TIPOS_EVENTO,
  rpcAgregarHorario,
  rpcArchivarEvento,
  rpcGuardarEvento,
  rpcGuardarVentana,
  rpcQuitarHorario,
  validarEvento,
  validarHora,
  validarVentana,
  type GuardarEventoArgs,
  type Resultado,
} from '@/lib/platform/ninos/eventos'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const DATOS_INVALIDOS = 'Revisa los datos e inténtalo de nuevo.'
const RUTA = '/ninos/eventos'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID_RE.test(valor)
const esTextoONulo = (valor: unknown): valor is string | null => valor === null || typeof valor === 'string'

async function clienteConSesion() {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  return user ? cliente : null
}

function despues<T>(r: Resultado<T>): Resultado<T> {
  if (r.ok) revalidatePath(RUTA)
  return r
}

export type GuardarEventoInput = GuardarEventoArgs

function eventoBienFormado(input: GuardarEventoInput | undefined): input is GuardarEventoInput {
  return (
    !!input &&
    esUuid(input.campusId) &&
    (input.eventoId === null || esUuid(input.eventoId)) &&
    typeof input.nombre === 'string' &&
    TIPOS_EVENTO.includes(input.tipo) &&
    (input.diaSemana === null || typeof input.diaSemana === 'number') &&
    esTextoONulo(input.fechaInicio) &&
    esTextoONulo(input.fechaFin) &&
    esTextoONulo(input.anuncioMesa) &&
    OPCIONES_EVENTO.every((k) => typeof input[k] === 'boolean')
  )
}

/** Creates (eventoId null) or updates an event; returns its id. */
export async function guardarEvento(input: GuardarEventoInput): Promise<Resultado<{ id: string }>> {
  const cliente = await clienteConSesion()
  if (!cliente) return { ok: false, message: SIN_SESION }
  if (!eventoBienFormado(input)) return { ok: false, message: DATOS_INVALIDOS }
  const invalido = validarEvento(input)
  if (invalido) return { ok: false, message: invalido }

  const r = await rpcGuardarEvento(cliente, input)
  return despues(r.ok ? { ok: true, data: { id: r.data } } : r)
}

/** Archives (activo false) or restores (activo true) an event. */
export async function archivarEvento(input: { eventoId: string; activo: boolean }): Promise<Resultado<{ activo: boolean }>> {
  const cliente = await clienteConSesion()
  if (!cliente) return { ok: false, message: SIN_SESION }
  if (!esUuid(input?.eventoId) || typeof input.activo !== 'boolean') return { ok: false, message: DATOS_INVALIDOS }

  const r = await rpcArchivarEvento(cliente, input.eventoId, input.activo)
  return despues(r.ok ? { ok: true, data: { activo: r.data } } : r)
}

export interface AgregarHorarioInput {
  readonly eventoId: string
  readonly turnoId?: string | null
  readonly nombre?: string | null
  readonly hora?: string | null
  readonly abreMinAntes: number
  readonly cierraMinDespues: number
}

/** Adds a horario: an existing weekly turno (turnoId) or a new one (nombre + hora). */
export async function agregarHorario(input: AgregarHorarioInput): Promise<Resultado<{ id: string }>> {
  const cliente = await clienteConSesion()
  if (!cliente) return { ok: false, message: SIN_SESION }
  const conTurno = input?.turnoId != null
  if (
    !esUuid(input?.eventoId) ||
    (conTurno && !esUuid(input.turnoId)) ||
    (!conTurno && (typeof input.hora !== 'string' || !esTextoONulo(input.nombre ?? null)))
  ) {
    return { ok: false, message: DATOS_INVALIDOS }
  }
  const invalido = (conTurno ? null : validarHora(input.hora ?? '')) ?? validarVentana(input.abreMinAntes, input.cierraMinDespues)
  if (invalido) return { ok: false, message: invalido }

  const r = await rpcAgregarHorario(cliente, input)
  return despues(r.ok ? { ok: true, data: { id: r.data } } : r)
}

/** When the check-in opens (minutes before) and the pickup closes (minutes after). */
export async function guardarVentanaHorario(input: {
  horarioId: string
  abreMinAntes: number
  cierraMinDespues: number
}): Promise<Resultado<null>> {
  const cliente = await clienteConSesion()
  if (!cliente) return { ok: false, message: SIN_SESION }
  if (!esUuid(input?.horarioId)) return { ok: false, message: DATOS_INVALIDOS }
  const invalido = validarVentana(input.abreMinAntes, input.cierraMinDespues)
  if (invalido) return { ok: false, message: invalido }

  return despues(await rpcGuardarVentana(cliente, input.horarioId, input.abreMinAntes, input.cierraMinDespues))
}

/** Removes a horario; says whether its dated turno was deleted too. */
export async function quitarHorario(input: { horarioId: string }): Promise<Resultado<{ turnoBorrado: boolean }>> {
  const cliente = await clienteConSesion()
  if (!cliente) return { ok: false, message: SIN_SESION }
  if (!esUuid(input?.horarioId)) return { ok: false, message: DATOS_INVALIDOS }

  return despues(await rpcQuitarHorario(cliente, input.horarioId))
}
