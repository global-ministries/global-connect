'use server'

/**
 * PR18 — DT-072 — Server actions for participante surface.
 *
 * Currently exposes one action:
 *   - `inscribirseATaller({ tallerId, cohorteId, companeroId?, linkType? })`
 *
 * Capability gate: NONE beyond an authenticated session (finding #1,
 * Option B). Self-enroll is how a user becomes a participant, so gating
 * it on `participation.read` was a chicken-and-egg trap. The gate is
 * `requireTalleresApiAuthenticated` (kill switch + auth only); the RLS
 * `WITH CHECK` term is the security wall — it forces `estado='pendiente'`
 * + persona=self + pareja validation. Approval still needs a write cap.
 *
 * Revalidates /talleres/explorar and /talleres/mis-talleres after
 * success so the participant's view reflects the new inscription.
 */

import { revalidatePath } from 'next/cache'

import { requireTalleresApiAuthenticated } from '@/lib/platform/talleres/api-helpers'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import {
  cedulaParaRpc,
  MENSAJES_PAREJA,
  parseBusquedaPareja,
  parseConyugeRegistrado,
  traducirErrorRpcPareja,
  type CodigoPareja,
  type ConyugeRegistrado,
} from '@/lib/platform/talleres/inscripcion-pareja'

export interface InscribirseInput {
  readonly tallerId: string
  readonly cohorteId: string
  readonly companeroId?: string | null
  readonly linkType?: 'matrimonio' | 'novios' | null
}

export type InscribirseResult =
  | { readonly ok: true; readonly inscripcionId: string }
  | { readonly ok: false; readonly error: 'not-found' | 'invalid-input' | 'unauthorized' | 'forbidden' | 'internal'; readonly message?: string }

export async function inscribirseATaller(input: InscribirseInput): Promise<InscribirseResult> {
  if (!isTalleresEnabled()) return { ok: false, error: 'not-found' }
  if (!input?.tallerId || !input?.cohorteId) {
    return { ok: false, error: 'invalid-input' }
  }

  const gate = await requireTalleresApiAuthenticated()
  if (!gate.ok) {
    // Map the gate's response status to our domain error code.
    if (gate.response.status === 404) return { ok: false, error: 'not-found' }
    if (gate.response.status === 401) return { ok: false, error: 'unauthorized' }
    if (gate.response.status === 403) return { ok: false, error: 'forbidden' }
    return { ok: false, error: 'internal' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase

  // Resolve auth_id → internal usuarios.id (FK target).
  // gate.userId is the auth.users.id (auth.uid); the FK
  // taller_inscripciones.persona_principal_id points to public.usuarios.id,
  // so we MUST resolve before insert. Canonical pattern matches
  // lib/actions/support.actions.ts:311, lib/actions/solicitudes-grupo.actions.ts:167,
  // lib/actions/support-capabilities.actions.ts:46.
  const { data: usuario, error: usuarioError } = await client
    .from('usuarios')
    .select('id')
    .eq('auth_id', gate.userId)
    .maybeSingle()

  if (usuarioError) {
    return { ok: false, error: 'internal', message: `resolve usuario: ${usuarioError.message}` }
  }
  if (!usuario?.id) {
    return { ok: false, error: 'internal', message: 'usuario interno no encontrado para auth.uid' }
  }

  const { data, error } = await client
    .from('taller_inscripciones')
    .insert({
      taller_id: input.tallerId,
      cohorte_id: input.cohorteId,
      persona_principal_id: usuario.id,
      companero_id: input.companeroId ?? null,
      link_type: input.linkType ?? null,
      estado: 'pendiente',
    })
    .select('id')
    .single()

  if (error || !data) {
    return {
      ok: false,
      error: 'internal',
      message: error?.message ?? 'insert failed',
    }
  }

  revalidatePath('/talleres/explorar')
  // T10 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/
  // mis-talleres is deleted; the "Para Mí" nav points at the merged
  // /talleres/mi-recorrido (T9), so only that one needs revalidating —
  // otherwise a participant who enrolls and then clicks through the menu
  // would see stale data on the screen they actually land on.
  revalidatePath('/talleres/mi-recorrido')
  return { ok: true, inscripcionId: data.id as string }
}

// ─── Inscripción en pareja (odd/tasks/talleres-inscripcion-en-pareja.md P2) ─
// The partner picker's two read-side lookups. Same gate as the enrollment
// itself (kill switch + authenticated session); the RPCs resolve the caller
// from auth.uid() and are the security wall.

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
