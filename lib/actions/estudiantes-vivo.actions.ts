'use server'

/**
 * Estudiantes — server action of the live view (/estudiantes/vivo, C4b of
 * odd/tasks/estudiantes-fase-b.md): the 15 s refresh (A5) reads
 * estudiantes_en_vivo again with the session client and hands the data back,
 * so the client swaps it in place and keeps its filters (no page reload, no
 * revalidation).
 *
 * Gate: an authenticated session only. Who may read is decided in the
 * database (sub-área level >= 2, campus rule), which raises its code as the
 * message (supabase/migrations/20261029100100_estudiantes_asistencia_rpcs.sql);
 * lib/platform/estudiantes/errores.ts turns it into Spanish.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { MENSAJES_ERROR_GRUPOS, codigoErrorGrupos, mensajeErrorVivo, type CodigoErrorGrupos } from '@/lib/platform/estudiantes/errores'
import { aDatosVivo, type DatosVivo } from '@/lib/platform/estudiantes/vivo-datos'

export type ResultadoVivo<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string; readonly codigo: CodigoErrorGrupos | null }

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const SIN_DATOS = 'No se pudo actualizar la vista en vivo. Se reintenta sola.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID_RE.test(valor)
const esFecha = (valor: unknown): valor is string =>
  typeof valor === 'string' && FECHA_RE.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`))

export interface RefrescarVivoInput {
  readonly ambitoId: string
  readonly fecha: string
  readonly turnoId: string
}

/** The live data of one ámbito at one meeting. */
export async function refrescarVivo(input: RefrescarVivoInput): Promise<ResultadoVivo<DatosVivo>> {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  if (!user) return { ok: false, message: SIN_SESION, codigo: null }

  if (!esUuid(input?.ambitoId) || !esFecha(input?.fecha) || !esUuid(input?.turnoId)) {
    return { ok: false, message: MENSAJES_ERROR_GRUPOS.datos_invalidos, codigo: 'datos_invalidos' }
  }

  const { data, error } = await cliente.rpc('estudiantes_en_vivo', { p_ambito_id: input.ambitoId, p_fecha: input.fecha, p_turno_id: input.turnoId })
  if (error) return { ok: false, message: mensajeErrorVivo(error), codigo: codigoErrorGrupos(error) }
  const datos = aDatosVivo(data)
  if (!datos) return { ok: false, message: SIN_DATOS, codigo: null }
  return { ok: true, data: datos }
}
