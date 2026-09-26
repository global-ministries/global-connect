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

// ─── Clases (plantilla) ──────────────────────────────────────────────────
//
// taller_plantilla_clases is written directly through RLS (T1, migration
// 20260926150000_talleres_plantillas_del_taller.sql): director.write OR
// admin.manage, tree-scoped — the same predicate `editar_taller` already
// tests. Every action below only performs the write; a denial surfaces as
// a plain 42501, translated by errores-api.ts's generic fallback.

export interface UpdateCadenciaYDuracionInput {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly cadenciaDias: number
  readonly duracionMinutos: number | null
}

export async function updateCadenciaYDuracion(
  input: UpdateCadenciaYDuracionInput,
): Promise<TallerActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  if (!Number.isInteger(input.cadenciaDias) || input.cadenciaDias < 1) {
    return { ok: false, error: 'invalid-input', message: 'La cadencia debe ser de al menos 1 día.' }
  }
  if (input.duracionMinutos !== null && (!Number.isInteger(input.duracionMinutos) || input.duracionMinutos <= 0)) {
    return { ok: false, error: 'invalid-input', message: 'La duración debe ser un número positivo de minutos.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { error } = await client
    .from('talleres')
    .update({ cadencia_dias: input.cadenciaDias, duracion_minutos: input.duracionMinutos })
    .eq('id', input.tallerId)

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo actualizar la cadencia.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true }
}

export interface CrearPlantillaClaseInput {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly tema: string
}

/** Reads the current max `numero` for the taller (any activo status — numero is a taller-wide sequence) and returns the next one, or 1 when there are none yet. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
async function nextNumeroClase(client: any, tallerId: string): Promise<number> {
  const { data } = await client
    .from('taller_plantilla_clases')
    .select('numero')
    .eq('taller_id', tallerId)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()
  return ((data as { numero: number } | null)?.numero ?? 0) + 1
}

export async function crearPlantillaClase(
  input: CrearPlantillaClaseInput,
): Promise<TallerActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  const tema = input.tema.trim()
  if (tema.length === 0) {
    return { ok: false, error: 'invalid-input', message: 'El tema es obligatorio.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const numero = await nextNumeroClase(client, input.tallerId)
  const { error } = await client
    .from('taller_plantilla_clases')
    .insert({ taller_id: input.tallerId, numero, tema })

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo agregar la clase.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true }
}

export interface EditarPlantillaClaseTemaInput {
  readonly tallerSlug: string
  readonly claseId: string
  readonly tema: string
}

export async function editarPlantillaClaseTema(
  input: EditarPlantillaClaseTemaInput,
): Promise<TallerActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  const tema = input.tema.trim()
  if (tema.length === 0) {
    return { ok: false, error: 'invalid-input', message: 'El tema es obligatorio.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { error } = await client.from('taller_plantilla_clases').update({ tema }).eq('id', input.claseId)

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo editar la clase.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true }
}

export interface ToggleActivoPlantillaClaseInput {
  readonly tallerSlug: string
  readonly claseId: string
  readonly activo: boolean
}

export async function toggleActivoPlantillaClase(
  input: ToggleActivoPlantillaClaseInput,
): Promise<TallerActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { error } = await client
    .from('taller_plantilla_clases')
    .update({ activo: input.activo })
    .eq('id', input.claseId)

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo actualizar la clase.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true }
}

export interface MoverPlantillaClaseInput {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly claseId: string
  readonly direccion: 'subir' | 'bajar'
}

/**
 * T3 correction — swaps `numero` between the target clase and its
 * immediate neighbor (previous for "subir", next for "bajar") among ALL
 * of the taller's plantilla clases, active or not. Delegates the whole
 * swap to the atomic RPC talleres_mover_plantilla_clase(p_clase_id,
 * p_direccion) (migration 20260927110000_talleres_mover_plantilla_
 * clase.sql) in ONE round trip — the function itself either commits both
 * swapped rows or rolls back entirely, replacing this action's earlier
 * three-sequential-UPDATE version (flagged as a non-atomic compromise:
 * a failure between steps could leave one row on a temporary numero).
 *
 * `direccion` keeps this action's own vocabulary ('subir'/'bajar',
 * matching the UI's Up/Down buttons) and translates it to the RPC's
 * ('arriba'/'abajo') at the boundary — no UI/component change needed.
 */
export async function moverPlantillaClase(
  input: MoverPlantillaClaseInput,
): Promise<TallerActionResult<{ numero: number }>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { data, error } = await client.rpc('talleres_mover_plantilla_clase', {
    p_clase_id: input.claseId,
    p_direccion: input.direccion === 'subir' ? 'arriba' : 'abajo',
  })

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo reordenar la clase.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  const resultado = data as { moved: boolean; clase_id: string; numero: number }
  if (!resultado.moved) {
    return { ok: false, error: 'no-op', message: 'No hay una clase adyacente en esa dirección.' }
  }

  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true, numero: resultado.numero }
}

// ─── Grupos (plantilla) ──────────────────────────────────────────────────

export interface CrearPlantillaGrupoInput {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly nombre: string
  readonly capacidad: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
async function nextOrdenGrupo(client: any, tallerId: string): Promise<number> {
  const { data } = await client
    .from('taller_plantilla_grupos')
    .select('orden')
    .eq('taller_id', tallerId)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle()
  return ((data as { orden: number } | null)?.orden ?? 0) + 1
}

export async function crearPlantillaGrupo(
  input: CrearPlantillaGrupoInput,
): Promise<TallerActionResult<object>> {
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
  const orden = await nextOrdenGrupo(client, input.tallerId)
  const { error } = await client
    .from('taller_plantilla_grupos')
    .insert({ taller_id: input.tallerId, nombre, capacidad: input.capacidad, orden })

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo agregar el grupo.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true }
}

export interface EditarPlantillaGrupoInput {
  readonly tallerSlug: string
  readonly grupoId: string
  readonly nombre: string
  readonly capacidad: number
}

export async function editarPlantillaGrupo(
  input: EditarPlantillaGrupoInput,
): Promise<TallerActionResult<object>> {
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
  const { error } = await client
    .from('taller_plantilla_grupos')
    .update({ nombre, capacidad: input.capacidad })
    .eq('id', input.grupoId)

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo editar el grupo.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true }
}

export interface ToggleActivoPlantillaGrupoInput {
  readonly tallerSlug: string
  readonly grupoId: string
  readonly activo: boolean
}

export async function toggleActivoPlantillaGrupo(
  input: ToggleActivoPlantillaGrupoInput,
): Promise<TallerActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { error } = await client
    .from('taller_plantilla_grupos')
    .update({ activo: input.activo })
    .eq('id', input.grupoId)

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo actualizar el grupo.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true }
}

// ─── Facilitadores (plantilla) ───────────────────────────────────────────

const ROLES_FACILITADOR = ['lider', 'voluntario'] as const
type RolFacilitador = (typeof ROLES_FACILITADOR)[number]

export interface AgregarFacilitadorInput {
  readonly tallerSlug: string
  readonly plantillaGrupoId: string
  readonly personaId: string
  readonly rol: RolFacilitador
}

/**
 * Insert-only — the DB is the whole security wall here. RLS requires
 * editar_taller (director.write/admin.manage scoped to the taller's
 * node); the BEFORE INSERT trigger `taller_plantilla_facilitadores_
 * exige_servidor_activo` requires the target persona to be an active
 * servidor of the taller's node tree, raising P0001
 * NO_ES_SERVIDOR_ACTIVO_DEL_TALLER otherwise — mapped to a friendly
 * Spanish message by errores-api.ts.
 */
export async function agregarFacilitador(
  input: AgregarFacilitadorInput,
): Promise<TallerActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  if (!input.personaId?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Elegí una persona.' }
  }
  if (!ROLES_FACILITADOR.includes(input.rol)) {
    return { ok: false, error: 'invalid-input', message: 'Rol inválido (líder o voluntario).' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { error } = await client.from('taller_plantilla_facilitadores').insert({
    plantilla_grupo_id: input.plantillaGrupoId,
    persona_id: input.personaId,
    rol: input.rol,
  })

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo agregar el facilitador.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true }
}

export interface QuitarFacilitadorInput {
  readonly tallerSlug: string
  readonly facilitadorId: string
}

export async function quitarFacilitador(
  input: QuitarFacilitadorInput,
): Promise<TallerActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { error } = await client.from('taller_plantilla_facilitadores').delete().eq('id', input.facilitadorId)

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo quitar el facilitador.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true }
}
