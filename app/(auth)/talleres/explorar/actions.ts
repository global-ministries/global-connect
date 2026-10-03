'use server'

/**
 * PR18 — DT-072 — Server actions for participante surface (/talleres/explorar).
 *
 *   - `inscribirseATaller({ edicionId, pareja? })`
 *   - `miConyugeRegistrado()` and `buscarParejaPorCedula(edicionId, cedula)`,
 *     the partner picker's lookups.
 *
 * Capability gate: NONE beyond an authenticated session (finding #1,
 * Option B). Self-enroll is how a user becomes a participant, so gating
 * it on `participation.read` was a chicken-and-egg trap. The gate is
 * `requireTalleresApiAuthenticated` (kill switch + auth only).
 *
 * Inscripción en pareja (odd/tasks/talleres-inscripcion-en-pareja.md P2) —
 * members no longer INSERT into taller_inscripciones: the member branch of
 * its policy is gone and `talleres_inscribirme` is the security wall. It
 * resolves the caller from auth.uid(), the cohorte from the edición and the
 * partner from `p_pareja`, and forces estado 'pendiente'. Approval still
 * needs a write cap.
 *
 * Revalidates /talleres/explorar and /talleres/mi-recorrido after a
 * successful enrollment so the participant's views reflect it.
 */

import { revalidatePath } from 'next/cache'

import { requireTalleresApiAuthenticated } from '@/lib/platform/talleres/api-helpers'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import {
  cedulaParaRpc,
  MENSAJES_PAREJA,
  parejaParaRpc,
  parseBusquedaPareja,
  parseConyugeRegistrado,
  parseResultadoInscribirme,
  traducirErrorRpcPareja,
  validarPareja,
  type CodigoPareja,
  type ConyugeRegistrado,
  type ParejaInscripcion,
} from '@/lib/platform/talleres/inscripcion-pareja'

// Every action shares the same gate (kill switch + authenticated session);
// the RPCs resolve the caller from auth.uid() and are the security wall.

type ErrorSesion = 'not-found' | 'unauthorized' | 'forbidden' | 'internal'

/** A failure every Explorar action may return, with a message ready to show. */
export interface FalloExplorar {
  readonly ok: false
  readonly error: CodigoPareja | ErrorSesion | 'invalid-input'
  readonly message: string
}

const MENSAJES_SESION: Readonly<Record<ErrorSesion | 'invalid-input', string>> = {
  'not-found': 'Los talleres no están disponibles en este momento.',
  unauthorized: 'Debes iniciar sesión.',
  forbidden: 'No tienes permisos para hacer esto.',
  internal: 'No se pudo completar la operación. Inténtalo de nuevo.',
  'invalid-input': 'Faltan datos para completar la operación.',
}

function fallo(error: ErrorSesion | 'invalid-input'): FalloExplorar {
  return { ok: false, error, message: MENSAJES_SESION[error] }
}

/** Kill switch + session gate shared by the partner actions. */
async function abrirSesion(): Promise<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  { readonly ok: true; readonly client: any } | FalloExplorar
> {
  if (!isTalleresEnabled()) return fallo('not-found')
  const gate = await requireTalleresApiAuthenticated()
  if (!gate.ok) {
    if (gate.response.status === 404) return fallo('not-found')
    if (gate.response.status === 401) return fallo('unauthorized')
    if (gate.response.status === 403) return fallo('forbidden')
    return fallo('internal')
  }
  return { ok: true, client: gate.supabase }
}

export type ConyugeRegistradoResult =
  | { readonly ok: true; readonly conyuge: ConyugeRegistrado | null }
  | FalloExplorar

/**
 * The caller's registered spouse (nombre, apellido, foto), or null when
 * there is none or more than one. The picker falls back to the cédula
 * search on null or on any failure.
 */
export async function miConyugeRegistrado(): Promise<ConyugeRegistradoResult> {
  const sesion = await abrirSesion()
  if (!sesion.ok) return sesion

  const { data, error } = await sesion.client.rpc('talleres_mi_conyuge_registrado')
  if (error) return { ok: false, ...traducirErrorRpcPareja(error, MENSAJES_SESION.internal) }
  return { ok: true, conyuge: parseConyugeRegistrado(data) }
}

export type BusquedaParejaResult =
  | { readonly ok: true; readonly encontrada: true; readonly nombreMostrado: string }
  | { readonly ok: true; readonly encontrada: false; readonly message: string }
  | FalloExplorar

/**
 * Looks a partner up by exact cédula. A match only reveals the masked name
 * ("María G."); a miss answers with the neutral PAREJA_NO_CONFIRMADA text.
 * An unrecognizable cédula is rejected here so it never spends one of the
 * member's throttled searches.
 */
export async function buscarParejaPorCedula(edicionId: string, cedula: string): Promise<BusquedaParejaResult> {
  if (typeof edicionId !== 'string' || edicionId.trim() === '') return fallo('invalid-input')
  const cedulaNormalizada = cedulaParaRpc(cedula)
  if (cedulaNormalizada === null) {
    return { ok: false, error: 'CEDULA_INVALIDA', message: MENSAJES_PAREJA.CEDULA_INVALIDA }
  }

  const sesion = await abrirSesion()
  if (!sesion.ok) return sesion

  const { data, error } = await sesion.client.rpc('talleres_buscar_pareja_por_cedula', {
    p_edicion_id: edicionId,
    p_cedula: cedulaNormalizada,
  })
  if (error) return { ok: false, ...traducirErrorRpcPareja(error, MENSAJES_SESION.internal) }

  const resultado = parseBusquedaPareja(data)
  if (resultado === null) return fallo('internal')
  if (!resultado.ok) {
    return { ok: false, error: resultado.codigo, message: MENSAJES_PAREJA[resultado.codigo] }
  }
  if (!resultado.encontrada) {
    return { ok: true, encontrada: false, message: MENSAJES_PAREJA.PAREJA_NO_CONFIRMADA }
  }
  return resultado
}

export interface InscribirseInput {
  /** taller_ediciones.id — the RPC resolves the cohorte from it. */
  readonly edicionId: string
  /** null (or absent) for an individual edición. */
  readonly pareja?: ParejaInscripcion | null
}

export type InscribirseResult = { readonly ok: true; readonly inscripcionId: string } | FalloExplorar

const MENSAJE_INSCRIPCION_FALLIDA = 'No se pudo completar la inscripción. Inténtalo de nuevo.'

export async function inscribirseATaller(input: InscribirseInput): Promise<InscribirseResult> {
  if (!isTalleresEnabled()) return fallo('not-found')
  const edicionId = typeof input?.edicionId === 'string' ? input.edicionId.trim() : ''
  if (edicionId === '') return fallo('invalid-input')

  const pareja = validarPareja(input.pareja)
  if (!pareja.ok) {
    return pareja.error === 'CEDULA_INVALIDA'
      ? { ok: false, error: 'CEDULA_INVALIDA', message: MENSAJES_PAREJA.CEDULA_INVALIDA }
      : fallo('invalid-input')
  }

  const sesion = await abrirSesion()
  if (!sesion.ok) return sesion

  const { data, error } = await sesion.client.rpc('talleres_inscribirme', {
    p_edicion_id: edicionId,
    p_pareja: parejaParaRpc(pareja.pareja),
  })
  if (error) return { ok: false, ...traducirErrorRpcPareja(error, MENSAJE_INSCRIPCION_FALLIDA) }

  const resultado = parseResultadoInscribirme(data)
  if (resultado === null) return { ok: false, error: 'internal', message: MENSAJE_INSCRIPCION_FALLIDA }
  if (!resultado.ok) {
    return { ok: false, error: resultado.codigo, message: MENSAJES_PAREJA[resultado.codigo] }
  }

  revalidatePath('/talleres/explorar')
  // T10 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/
  // mis-talleres is deleted; the "Para Mí" nav points at the merged
  // /talleres/mi-recorrido (T9), so only that one needs revalidating —
  // otherwise a participant who enrolls and then clicks through the menu
  // would see stale data on the screen they actually land on.
  revalidatePath('/talleres/mi-recorrido')
  return { ok: true, inscripcionId: resultado.inscripcionId }
}
