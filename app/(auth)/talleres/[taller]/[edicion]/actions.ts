'use server'

/**
 * T4 (odd/tasks/talleres-configuracion-del-taller.md) — server actions for
 * /talleres/[taller]/[edicion]'s instantiated-grupo mutations: editing a
 * grupo in place (talleres_editar_grupo) and adding/removing a
 * facilitador (taller_grupo_asignaciones), through the SAME bounded
 * picker T3 built for the plantilla (components/talleres/facilitador-
 * picker.tsx) — never talleres_buscar_personas.
 *
 * Gate: flag + authenticated session only, the same thin pattern as
 * app/(auth)/talleres/[taller]/actions.ts's gate() — authorization stays
 * in the DB: talleres_editar_grupo's own capability check (raises
 * `sin_permisos_para_este_taller`, ERRCODE 42501), the taller_grupo_
 * asignaciones RLS policies (20260918200000_talleres_scoped_policies_
 * grupos.sql) and the BEFORE INSERT/UPDATE trigger requiring an active
 * servidor of the taller's node (NO_ES_SERVIDOR_ACTIVO_DEL_TALLER, P0001,
 * 20260926150000_talleres_plantillas_del_taller.sql). Every denial is
 * translated via lib/platform/talleres/errores-api.ts — never a raw
 * RAISE/SQLSTATE reaching the client.
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { traducirErrorTalleres } from '@/lib/platform/talleres/errores-api'
import { rutaEdicion, rutaGrupo } from '@/lib/platform/talleres/rutas'

export type EdicionActionResult<T> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly error: string; readonly message: string }

/**
 * B1 correction (odd/tasks/talleres-configuracion-del-taller.md T7) — same
 * reasoning as app/(auth)/talleres/[taller]/actions.ts's own forbiddenByRls:
 * RLS's USING clause silently filters an UPDATE/DELETE to zero affected
 * rows instead of raising an error, so quitarFacilitadorGrupo's DELETE
 * (which goes straight through RLS, never an RPC) needs its own empty-
 * result check.
 */
function forbiddenByRls(mensajePorDefecto: string): { readonly error: string; readonly message: string } {
  const traducido = traducirErrorTalleres({ code: '42501' }, mensajePorDefecto)
  return { error: traducido.error, message: traducido.message }
}

/**
 * Thin, shared gate: flag + authenticated session. Never checks a
 * capability — every mutation this file exposes is authorized by the DB
 * (the RPC's own check, or RLS plus the servidor-activo trigger).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client, matches this feature's other action files
async function gate(): Promise<{ ok: true; supabase: any } | { ok: false; result: EdicionActionResult<never> }> {
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

// ─── Grupo instanciado ───────────────────────────────────────────────────

export interface EditarGrupoInstanciadoInput {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly grupoId: string
  readonly nombre: string
  readonly capacidad: number
}

export async function editarGrupoInstanciado(
  input: EditarGrupoInstanciadoInput,
): Promise<EdicionActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  const nombre = input.nombre.trim()
  if (nombre.length === 0) {
    return { ok: false, error: 'invalid-input', message: 'El nombre es obligatorio.' }
  }
  if (!Number.isInteger(input.capacidad) || input.capacidad <= 0) {
    return { ok: false, error: 'invalid-input', message: 'La capacidad debe ser un número positivo.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { error } = await client.rpc('talleres_editar_grupo', {
    p_grupo_id: input.grupoId,
    p_nombre: nombre,
    p_capacidad: input.capacidad,
  })

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo editar el grupo.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  // T5 (odd/tasks/talleres-configuracion-del-taller.md) — the grupo's
  // nombre/capacidad also render on its own page (grupo-detalle.ts's
  // "Equipo" section header), not just the edición's grupos list.
  revalidatePath(rutaEdicion(input.tallerSlug, input.edicionId))
  revalidatePath(rutaGrupo(input.tallerSlug, input.edicionId, input.grupoId))
  return { ok: true }
}

// ─── Facilitadores del grupo instanciado ─────────────────────────────────

const ROLES_FACILITADOR = ['lider', 'voluntario'] as const
type RolFacilitador = (typeof ROLES_FACILITADOR)[number]

export interface AgregarFacilitadorGrupoInput {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly grupoId: string
  readonly personaId: string
  readonly rol: RolFacilitador
}

/**
 * Insert-only — the DB is the whole security wall here, mirroring
 * app/(auth)/talleres/[taller]/actions.ts's agregarFacilitador for the
 * plantilla: RLS requires gestionar_grupos-equivalent capability scoped to
 * the taller's node, and the BEFORE INSERT trigger requires the target
 * persona to be an active servidor of the taller's node tree, raising
 * P0001 NO_ES_SERVIDOR_ACTIVO_DEL_TALLER otherwise.
 */
export async function agregarFacilitadorGrupo(
  input: AgregarFacilitadorGrupoInput,
): Promise<EdicionActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  if (!input.personaId?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Elige una persona.' }
  }
  if (!ROLES_FACILITADOR.includes(input.rol)) {
    return { ok: false, error: 'invalid-input', message: 'Rol inválido (líder o voluntario).' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { error } = await client.from('taller_grupo_asignaciones').insert({
    grupo_id: input.grupoId,
    persona_id: input.personaId,
    rol: input.rol,
  })

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo agregar el facilitador.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  // T5 — the grupo's own page (grupo-detalle.ts's "Equipo" section) lists
  // the same taller_grupo_asignaciones rows as the edición's grupos list.
  revalidatePath(rutaEdicion(input.tallerSlug, input.edicionId))
  revalidatePath(rutaGrupo(input.tallerSlug, input.edicionId, input.grupoId))
  return { ok: true }
}

export interface QuitarFacilitadorGrupoInput {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly grupoId: string
  readonly facilitadorId: string
}

export async function quitarFacilitadorGrupo(
  input: QuitarFacilitadorGrupoInput,
): Promise<EdicionActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { data, error } = await client
    .from('taller_grupo_asignaciones')
    .delete()
    .eq('id', input.facilitadorId)
    .select('id')

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo quitar el facilitador.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }
  if (!data || data.length === 0) {
    return { ok: false, ...forbiddenByRls('No se pudo quitar el facilitador.') }
  }

  // T5 — same reasoning as agregarFacilitadorGrupo/editarGrupoInstanciado:
  // the grupo's own page shows the same facilitadores list.
  revalidatePath(rutaEdicion(input.tallerSlug, input.edicionId))
  revalidatePath(rutaGrupo(input.tallerSlug, input.edicionId, input.grupoId))
  return { ok: true }
}
