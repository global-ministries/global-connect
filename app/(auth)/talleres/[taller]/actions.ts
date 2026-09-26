'use server'

/**
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — server actions for
 * /talleres/[taller]'s own mutations.
 *
 * Gate: flag + authenticated session only (mirrors
 * lib/platform/talleres/api-helpers.ts's requireTalleresApiAuthenticated —
 * the "server-action equivalent" the task calls for). Authorization stays
 * in the DB: the `talleres` UPDATE RLS policy (talleres_update_director,
 * director.write OR admin.manage scoped to the taller's node — the same
 * predicate talleres_mis_permisos' `editar_taller` boolean already tests)
 * and, for the plantilla tables added in later T3 commits, their own RLS
 * plus the NO_ES_SERVIDOR_ACTIVO_DEL_TALLER trigger. Every RLS/trigger
 * denial is translated via lib/platform/talleres/errores-api.ts — never a
 * raw RAISE/SQLSTATE reaching the client.
 *
 * `nombre` is a plain table UPDATE, not an RPC — `talleres` has no
 * dedicated `editar_taller` RPC (that name only exists as the
 * talleres_mis_permisos() capability boolean); the write path for
 * nombre/descripcion has always been the RLS-guarded table itself (see
 * talleres_update_director, 20260813000001_talleres_abstract.sql).
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { traducirErrorTalleres } from '@/lib/platform/talleres/errores-api'
import { rutaTaller } from '@/lib/platform/talleres/rutas'

export type TallerActionResult<T> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly error: string; readonly message: string }

const NOMBRE_MIN_LENGTH = 2
const NOMBRE_MAX_LENGTH = 200

/**
 * Thin, shared gate: flag + authenticated session. Never checks a
 * capability — every mutation this file exposes is authorized by RLS
 * (or, for the plantilla tables, RLS plus their servidor-activo trigger),
 * per this file's own header.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client, matches this feature's other action files
async function gate(): Promise<{ ok: true; supabase: any } | { ok: false; result: TallerActionResult<never> }> {
  if (!isTalleresEnabled()) {
    return { ok: false, result: { ok: false, error: 'not-found', message: 'El módulo de talleres está deshabilitado.' } }
  }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return { ok: false, result: { ok: false, error: 'unauthorized', message: 'Necesitás iniciar sesión.' } }
  }

  return { ok: true, supabase }
}

export interface UpdateTallerNombreInput {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly nombre: string
}

export async function updateTallerNombre(
  input: UpdateTallerNombreInput,
): Promise<TallerActionResult<{ nombre: string }>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  const nombre = input.nombre.trim()
  if (nombre.length < NOMBRE_MIN_LENGTH || nombre.length > NOMBRE_MAX_LENGTH) {
    return {
      ok: false,
      error: 'invalid-input',
      message: `El nombre debe tener entre ${NOMBRE_MIN_LENGTH} y ${NOMBRE_MAX_LENGTH} caracteres.`,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { data, error } = await client
    .from('talleres')
    .update({ nombre })
    .eq('id', input.tallerId)
    .select('nombre')
    .single()

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo actualizar el nombre.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true, nombre: (data as { nombre: string }).nombre }
}
