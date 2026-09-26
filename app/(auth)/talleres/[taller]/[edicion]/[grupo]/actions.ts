'use server'

/**
 * T4 (odd/tasks/talleres-configuracion-del-taller.md) — server action for
 * /talleres/[taller]/[edicion]/[grupo]'s clase-in-place edit: tema and
 * fecha_programada, through talleres_editar_clase. A closed clase shows no
 * edit control (the page's own job — never re-checked here); the RPC's own
 * CLASE_CERRADA guard is the real wall, mapped by errores-api.ts.
 *
 * Gate: flag + authenticated session only, mirroring the sibling
 * /talleres/[taller]/[edicion]/actions.ts — authorization stays in the DB
 * (talleres_editar_clase's own capability check, raising
 * `sin_permisos_para_este_taller`, ERRCODE 42501, and CLASE_CERRADA,
 * P0001, when the clase is already closed).
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { traducirErrorTalleres } from '@/lib/platform/talleres/errores-api'
import { rutaGrupo } from '@/lib/platform/talleres/rutas'

export type GrupoActionResult<T> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly error: string; readonly message: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client, matches this feature's other action files
async function gate(): Promise<{ ok: true; supabase: any } | { ok: false; result: GrupoActionResult<never> }> {
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

export interface EditarClaseInstanciadaInput {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly grupoId: string
  readonly sesionId: string
  readonly tema: string
  readonly fechaProgramada: string
}

export async function editarClaseInstanciada(
  input: EditarClaseInstanciadaInput,
): Promise<GrupoActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  const tema = input.tema.trim()
  if (tema.length === 0) {
    return { ok: false, error: 'invalid-input', message: 'El tema es obligatorio.' }
  }
  if (!input.fechaProgramada.trim()) {
    return { ok: false, error: 'invalid-input', message: 'La fecha es obligatoria.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { error } = await client.rpc('talleres_editar_clase', {
    p_sesion_id: input.sesionId,
    p_tema: tema,
    p_fecha_programada: input.fechaProgramada,
  })

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo editar la clase.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  revalidatePath(rutaGrupo(input.tallerSlug, input.edicionId, input.grupoId))
  return { ok: true }
}
