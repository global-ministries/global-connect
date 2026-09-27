'use server'

/**
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — server actions for the
 * consolidated /talleres/temporadas screens.
 *
 * T3 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — talleres_
 * temporadas is now owned by a Dream Team node and its RLS is scoped by
 * that node's own tree (supabase/migrations/
 * 20260928120000_talleres_temporadas_por_direccion.sql). `createTemporada`,
 * `agregarTallerATemporada` and `quitarTallerDeTemporada` all route through
 * the SECURITY DEFINER RPCs (talleres_crear_temporada, talleres_agregar_
 * taller_a_temporada, talleres_quitar_taller_de_temporada) instead of a raw
 * table write — the RPC IS the security wall, the exact same shape
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
 * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — "Crear
 * temporada" (crear/temporada-form.tsx) now picks the dirección itself, so
 * `equipoId` is a required runtime input again (still typed optional here
 * purely so a caller that omits it fails fast with `invalid-input` rather
 * than reaching the RPC with a missing required argument); `slug`/
 * `descripcion` are GONE from `CreateTemporadaInput` (the RPC derives its
 * own slug and has no p_descripcion param). `createTemporada` also returns
 * `edicionesCreadas` (the RPC's own `ediciones` array length) so the form
 * can redirect with a "Se crearon N ediciones" notice. The single
 * `toggleTallerInTemporada` (checkbox toggle) is replaced by
 * `agregarTallerATemporada`/`quitarTallerDeTemporada` — the detail screen's
 * "Agregar taller" select and per-row "Quitar" icon are two differently-
 * shaped controls now, not one toggle. Every RPC error is translated
 * through errores-api.ts's `traducirErrorTalleres` (the same table every
 * other talleres action uses) instead of surfacing the raw RAISE text.
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
import { traducirErrorTalleres } from '@/lib/platform/talleres/errores-api'
import { rutaTemporadas, rutaTemporada } from '@/lib/platform/talleres/rutas'

export type TemporadaActionResult =
  | { readonly ok: true; readonly temporadaId?: string; readonly edicionesCreadas?: number }
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

/** Maps `traducirErrorTalleres`'s HTTP-shaped status to this module's own narrower error union. */
function toLocalError(status: number): 'forbidden' | 'not-found' | 'invalid-input' | 'internal' {
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409 || status === 400) return 'invalid-input'
  return 'internal'
}

/**
 * Maps a talleres_crear_temporada/talleres_agregar_taller_a_temporada/
 * talleres_quitar_taller_de_temporada error to the action result shape,
 * through the SAME Spanish translation table every other talleres action
 * uses (errores-api.ts's `traducirErrorTalleres`) — never the raw RAISE
 * text. 42501 = no director.write/admin.manage scoped to the node in
 * question; P0001/P0002/22023 = a domain refusal (TALLER_FUERA_DE_LA_
 * DIRECCION, TALLER_NO_ES_POR_TEMPORADA, EDICION_YA_EXISTE, EDICION_CON_
 * INSCRITOS, TEMPORADA_NOT_FOUND, EQUIPO_NOT_FOUND, …).
 */
function mapRpcError(error: RpcError, mensajePorDefecto: string): TemporadaActionResult {
  const traducido = traducirErrorTalleres(error, mensajePorDefecto)
  return { ok: false, error: toLocalError(traducido.status), message: traducido.message }
}

// ─── createTemporada ────────────────────────────────────────────────────────

export interface CreateTemporadaInput {
  readonly equipoId?: string
  readonly nombre: string
  readonly fecha_apertura: string // ISO
  readonly fecha_cierre: string // ISO
  readonly tallerIds?: readonly string[]
}

/**
 * Creates a temporada owned by `equipoId` (estado='borrador', slug derived
 * server-side) via talleres_crear_temporada, optionally creating one
 * edición per `tallerIds` entry. `equipoId` is required at runtime — T5's
 * own form (crear/temporada-form.tsx) always supplies it from its
 * dirección picker.
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

  if (error) return mapRpcError(error, 'No se pudo crear la temporada.')

  const resultado = data as { temporada_id?: string; ediciones?: readonly unknown[] } | null
  const temporadaId = resultado?.temporada_id
  if (!temporadaId) {
    return { ok: false, error: 'internal', message: 'No se pudo crear la temporada.' }
  }

  revalidatePath(rutaTemporadas())
  return { ok: true, temporadaId, edicionesCreadas: resultado.ediciones?.length ?? 0 }
}

// ─── agregarTallerATemporada / quitarTallerDeTemporada ──────────────────────
//
// T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the detail
// screen's "add"/"remove" are two separate, differently-shaped controls now
// (a "Agregar taller" select+button vs. a per-row "Quitar" icon with its own
// confirm dialog), not one checkbox toggle — `toggleTallerInTemporada` is
// replaced by these two, more honestly named actions.

export interface AgregarTallerInput {
  readonly temporadaId: string
  readonly tallerId: string
}

/**
 * talleres_agregar_taller_a_temporada — creates the taller's edición.
 * Tolerates EDICION_YA_EXISTE as idempotent success (a non-cancelled
 * edición already means "already in this temporada" under T3's model).
 */
export async function agregarTallerATemporada(
  input: AgregarTallerInput,
): Promise<TemporadaActionResult> {
  const gate = await requireSession()
  if (!gate.ok) return gate

  if (!input.temporadaId || !input.tallerId) {
    return { ok: false, error: 'invalid-input', message: 'temporadaId y tallerId son requeridos.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { error } = await client.rpc('talleres_agregar_taller_a_temporada', {
    p_temporada_id: input.temporadaId,
    p_taller_id: input.tallerId,
  })

  if (error) {
    if ((error as RpcError).message === 'EDICION_YA_EXISTE') {
      return { ok: true }
    }
    return mapRpcError(error, 'No se pudo agregar el taller a la temporada.')
  }

  revalidatePath(rutaTemporada(input.temporadaId))
  return { ok: true }
}

export interface QuitarTallerInput {
  readonly temporadaId: string
  readonly tallerId: string
}

/**
 * talleres_quitar_taller_de_temporada — cancels the taller's edición here
 * (never deletes it). Refuses with EDICION_CON_INSCRITOS when it has
 * inscritos — surfaced verbatim (errores-api.ts's own copy) so the "Quitar"
 * confirm dialog can show it exactly.
 */
export async function quitarTallerDeTemporada(
  input: QuitarTallerInput,
): Promise<TemporadaActionResult> {
  const gate = await requireSession()
  if (!gate.ok) return gate

  if (!input.temporadaId || !input.tallerId) {
    return { ok: false, error: 'invalid-input', message: 'temporadaId y tallerId son requeridos.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { error } = await client.rpc('talleres_quitar_taller_de_temporada', {
    p_temporada_id: input.temporadaId,
    p_taller_id: input.tallerId,
  })

  if (error) return mapRpcError(error, 'No se pudo quitar el taller de la temporada.')

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
