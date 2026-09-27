'use server'

/**
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — server actions for the
 * consolidated /talleres/temporadas screens.
 *
 * T3 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — talleres_
 * temporadas is now owned by a Dream Team node and its RLS is scoped by
 * that node's own tree (supabase/migrations/
 * 20260928120000_talleres_temporadas_por_direccion.sql). `createTemporada`
 * and `toggleTallerInTemporada` now route through the new SECURITY DEFINER
 * RPCs (talleres_crear_temporada, talleres_agregar_taller_a_temporada,
 * talleres_quitar_taller_de_temporada) instead of a raw table write — the
 * RPC IS the security wall, the exact same shape
 * lib/platform/talleres/solicitudes-retiro-actions.ts already documents
 * for talleres_resolver_solicitud_retiro: derive the scope from the
 * temporada/equipo itself, surface a failed authority check as SQLSTATE
 * 42501, map it to `forbidden` here. The old flat
 * `auth_has_talleres_capability` defense-in-depth pre-check is GONE (it
 * would no longer even be accurate: a director.write grant scoped to one
 * branch would pass that flat check yet still be correctly refused by the
 * new scoped RLS/RPC for another branch's temporada) — the app-layer gate
 * is now intentionally thin: kill switch → auth → RPC/RLS.
 *
 * `createTemporada` needs an `equipoId` now (the RPC's own p_equipo_id) —
 * the UI's node picker is T5's job ("the form gets the node picker in
 * T5"), so `equipoId` is optional here purely so the still-unmodified
 * ./crear/temporada-form.tsx keeps compiling; omitting it fails fast with
 * `invalid-input` rather than reaching the RPC with a missing required
 * argument. `descripcion` is no longer settable at creation (the RPC's
 * signature has no p_descripcion param — describing a temporada is not
 * part of this task; the column itself is untouched for a future UPDATE
 * path) but the field stays in the input type, unused, so that same form
 * (which still sends it) keeps compiling too.
 *
 * `transitionTemporada` is UNCHANGED: a plain guarded UPDATE, now simply
 * subject to the new scoped UPDATE policy instead of the old unscoped one
 * ("Temporada state transitions stay as today", T3's own delegation). A
 * caller without write authority on this temporada's own node still just
 * matches 0 rows under RLS (same failure shape the guarded state-machine
 * check already produces for an illegal transition) — the UI shows the
 * same generic message either way (temporada-detail-client.tsx never
 * branches on the error code).
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { rutaTemporadas, rutaTemporada } from '@/lib/platform/talleres/rutas'

export type TemporadaActionResult =
  | { readonly ok: true; readonly temporadaId?: string }
  | {
      readonly ok: false
      readonly error: 'forbidden' | 'not-found' | 'unauthorized' | 'invalid-input' | 'internal'
      readonly message?: string
    }

type Gate =
  | { readonly ok: true; readonly supabase: unknown }
  | { readonly ok: false; readonly error: 'not-found' | 'unauthorized' }

/**
 * Kill switch → auth. No capability pre-check: the RPCs (create/toggle) and
 * RLS (transition) are the security wall — see this module's own header.
 */
async function requireSession(): Promise<Gate> {
  if (!isTalleresEnabled()) return { ok: false, error: 'not-found' }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  return { ok: true, supabase }
}

interface RpcError {
  readonly code?: string
  readonly message?: string
}

/**
 * Maps a talleres_crear_temporada/talleres_agregar_taller_a_temporada/
 * talleres_quitar_taller_de_temporada error to the action result shape.
 * 42501 = no director.write/admin.manage scoped to the node in question;
 * P0001/P0002/22023 = a domain refusal (TALLER_FUERA_DE_LA_DIRECCION,
 * TALLER_NO_ES_POR_TEMPORADA, EDICION_YA_EXISTE, EDICION_CON_INSCRITOS,
 * TEMPORADA_NOT_FOUND, EQUIPO_NOT_FOUND, …) — surfaced as invalid-input
 * with the raw message, since the UI shows it verbatim either way.
 */
function mapRpcError(error: RpcError): TemporadaActionResult {
  if (error.code === '42501') {
    return { ok: false, error: 'forbidden', message: 'No tenés permiso para esta dirección o temporada.' }
  }
  if (error.code === 'P0001' || error.code === 'P0002' || error.code === '22023') {
    return { ok: false, error: 'invalid-input', message: error.message }
  }
  return { ok: false, error: 'internal', message: error.message ?? 'unknown error' }
}

// ─── createTemporada ────────────────────────────────────────────────────────

export interface CreateTemporadaInput {
  readonly equipoId?: string
  readonly nombre: string
  /** @deprecated no longer sent to the RPC (it derives its own slug); kept
   *  so the not-yet-rewritten form (T5) still compiles. */
  readonly slug?: string
  /** @deprecated not settable at creation (no p_descripcion on the RPC);
   *  kept so the not-yet-rewritten form (T5) still compiles. */
  readonly descripcion?: string | null
  readonly fecha_apertura: string // ISO
  readonly fecha_cierre: string // ISO
  readonly tallerIds?: readonly string[]
}

/**
 * Creates a temporada owned by `equipoId` (estado='borrador', slug derived
 * server-side) via talleres_crear_temporada, optionally creating one
 * edición per `tallerIds` entry. `equipoId` is required at runtime (the
 * node picker itself is T5's job — see this module's own header).
 */
export async function createTemporada(
  input: CreateTemporadaInput,
): Promise<TemporadaActionResult> {
  const gate = await requireSession()
  if (!gate.ok) return gate

  if (!input.equipoId) {
    return { ok: false, error: 'invalid-input', message: 'Selecciona una dirección.' }
  }

  const nombre = input.nombre?.trim() ?? ''
  if (nombre.length < 2 || nombre.length > 120) {
    return { ok: false, error: 'invalid-input', message: 'El nombre debe tener entre 2 y 120 caracteres.' }
  }

  if (!input.fecha_apertura || !input.fecha_cierre) {
    return { ok: false, error: 'invalid-input', message: 'Las fechas de apertura y cierre son requeridas.' }
  }
  if (new Date(input.fecha_cierre) < new Date(input.fecha_apertura)) {
    return { ok: false, error: 'invalid-input', message: 'La fecha de cierre debe ser posterior o igual a la de apertura.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client.rpc('talleres_crear_temporada', {
    p_equipo_id: input.equipoId,
    p_nombre: nombre,
    p_fecha_apertura: input.fecha_apertura,
    p_fecha_cierre: input.fecha_cierre,
    p_taller_ids: input.tallerIds ?? [],
  })

  if (error) return mapRpcError(error)

  const temporadaId = (data as { temporada_id?: string } | null)?.temporada_id
  if (!temporadaId) {
    return { ok: false, error: 'internal', message: 'No se pudo crear la temporada.' }
  }

  revalidatePath(rutaTemporadas())
  return { ok: true, temporadaId }
}

// ─── toggleTallerInTemporada ─────────────────────────────────────────────────

export interface ToggleTallerInput {
  readonly temporadaId: string
  readonly tallerId: string
  readonly on: boolean
}

/**
 * The "elijo qué talleres abren" control surface: on=true adds the taller
 * (talleres_agregar_taller_a_temporada — creates its edición; tolerates
 * EDICION_YA_EXISTE as idempotent success, since the junction row and a
 * non-cancelled edición always exist together under T3's model); on=false
 * removes it (talleres_quitar_taller_de_temporada — cancels the edición,
 * never deletes it; refuses with EDICION_CON_INSCRITOS if it has
 * inscritos, surfaced as invalid-input).
 */
export async function toggleTallerInTemporada(
  input: ToggleTallerInput,
): Promise<TemporadaActionResult> {
  const gate = await requireSession()
  if (!gate.ok) return gate

  if (!input.temporadaId || !input.tallerId) {
    return { ok: false, error: 'invalid-input', message: 'temporadaId y tallerId son requeridos.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const rpcName = input.on
    ? 'talleres_agregar_taller_a_temporada'
    : 'talleres_quitar_taller_de_temporada'

  const { error } = await client.rpc(rpcName, {
    p_temporada_id: input.temporadaId,
    p_taller_id: input.tallerId,
  })

  if (error) {
    if (input.on && (error as RpcError).message === 'EDICION_YA_EXISTE') {
      return { ok: true }
    }
    return mapRpcError(error)
  }

  revalidatePath(rutaTemporada(input.temporadaId))
  return { ok: true }
}

// ─── transitionTemporada ─────────────────────────────────────────────────────

/**
 * Allowed source states for each target estado. A guarded UPDATE filters on
 * these so an illegal transition matches zero rows (→ invalid-input) rather
 * than silently clobbering the estado.
 */
const ALLOWED_FROM: Record<'abierto' | 'cerrado' | 'cancelado', readonly string[]> = {
  abierto: ['borrador'],
  cerrado: ['abierto'],
  cancelado: ['borrador', 'abierto'],
}

export interface TransitionTemporadaInput {
  readonly temporadaId: string
  readonly next: 'abierto' | 'cerrado' | 'cancelado'
}

export async function transitionTemporada(
  input: TransitionTemporadaInput,
): Promise<TemporadaActionResult> {
  const gate = await requireSession()
  if (!gate.ok) return gate

  if (!input.temporadaId) {
    return { ok: false, error: 'invalid-input', message: 'temporadaId es requerido.' }
  }
  const allowed = ALLOWED_FROM[input.next]
  if (!allowed) {
    return { ok: false, error: 'invalid-input', message: 'Transición no permitida.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client
    .from('talleres_temporadas')
    .update({ estado: input.next })
    .eq('id', input.temporadaId)
    .in('estado', allowed)
    .select('id')
    .maybeSingle()

  if (error) {
    return { ok: false, error: 'internal', message: (error.message as string) ?? 'unknown error' }
  }
  if (!data) {
    return {
      ok: false,
      error: 'invalid-input',
      message: 'Transición no permitida desde el estado actual (o sin permiso sobre esta dirección).',
    }
  }

  revalidatePath(rutaTemporada(input.temporadaId))
  revalidatePath(rutaTemporadas())
  return { ok: true, temporadaId: input.temporadaId }
}
