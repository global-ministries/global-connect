'use server'

/**
 * T8b (odd/tasks/talleres-reserva-publica.md, S17) — server actions to
 * recover a missed clase (grupo page). The taller's «Recuperar clases
 * aparte» switch saves with the rest of the configuration
 * (updateTallerConfiguracion, T9).
 *
 * Same thin gate as minimo-suspension-actions.ts: flag + session. Who may
 * register, which clase and which dates live in the RPCs of
 * 20261110220000_talleres_recuperar_clase.sql; their refusals are
 * translated by traducirErrorRecuperacion so no RAISE text reaches the
 * browser.
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { rutaGrupo } from '@/lib/platform/talleres/rutas'
import { NOTA_RECUPERACION_MAX, traducirErrorRecuperacion } from '@/lib/platform/talleres/recuperar-clase'

export type RecuperarActionResult<T> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly error: string; readonly message: string }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client, matches this feature's other action files
async function gate(): Promise<{ ok: true; supabase: any } | { ok: false; result: RecuperarActionResult<never> }> {
  if (!isTalleresEnabled()) {
    return { ok: false, result: { ok: false, error: 'not-found', message: 'El módulo de talleres está deshabilitado.' } }
  }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return { ok: false, result: { ok: false, error: 'unauthorized', message: 'Necesitas iniciar sesión.' } }
  }

  return { ok: true, supabase }
}

function invalido(message: string): { readonly ok: false; readonly error: string; readonly message: string } {
  return { ok: false, error: 'invalid-input', message }
}

export interface RutaGrupoInput {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly grupoId: string
}

// ─── Registrar una recuperación ──────────────────────────────────────────

export interface RegistrarRecuperacionInput extends RutaGrupoInput {
  readonly sesionId: string
  readonly personaId: string
  /** YYYY-MM-DD */
  readonly fecha: string
  /** usuarios.id of who gave the clase; null = the caller. */
  readonly dadaPor: string | null
  readonly nota: string | null
}

export async function registrarRecuperacion(
  input: RegistrarRecuperacionInput,
): Promise<RecuperarActionResult<{ id: string }>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  if (!ISO_DATE.test(input.fecha)) return invalido('Elige la fecha de la recuperación.')
  const nota = input.nota?.trim() || null
  if (nota && nota.length > NOTA_RECUPERACION_MAX) {
    return invalido(`La nota no puede superar los ${NOTA_RECUPERACION_MAX} caracteres.`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { data, error } = await client.rpc('talleres_registrar_recuperacion', {
    p_sesion_id: input.sesionId,
    p_persona_id: input.personaId,
    p_fecha: input.fecha,
    p_dada_por: input.dadaPor,
    p_nota: nota,
  })
  if (error || !data) {
    return { ok: false, ...traducirErrorRecuperacion(error, 'No se pudo registrar la recuperación.') }
  }

  revalidatePath(rutaGrupo(input.tallerSlug, input.edicionId, input.grupoId))
  return { ok: true, id: String((data as { id?: unknown }).id ?? '') }
}

// ─── Anular una recuperación ─────────────────────────────────────────────

export interface AnularRecuperacionInput extends RutaGrupoInput {
  readonly recuperacionId: string
}

export async function anularRecuperacion(input: AnularRecuperacionInput): Promise<RecuperarActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { error } = await client.rpc('talleres_anular_recuperacion', { p_id: input.recuperacionId })
  if (error) {
    return { ok: false, ...traducirErrorRecuperacion(error, 'No se pudo anular la recuperación.') }
  }

  revalidatePath(rutaGrupo(input.tallerSlug, input.edicionId, input.grupoId))
  return { ok: true }
}
