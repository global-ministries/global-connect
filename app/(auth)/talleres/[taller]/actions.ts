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

/**
 * B1 correction (odd/tasks/talleres-configuracion-del-taller.md T7) — RLS's
 * USING clause silently filters an UPDATE/DELETE to zero affected rows
 * instead of raising an error, so a forbidden write against one of the
 * plantilla tables looked exactly like a successful no-op (the row exists,
 * it just didn't belong to this caller's node). Every mutation below that
 * goes through RLS directly (never through an RPC, which raises its own
 * explicit exception) chains `.select('id')` and, when the result comes
 * back empty, treats it the same as an explicit 42501 denial — reusing
 * traducirErrorTalleres's own generic-42501 message so there is one place
 * that phrases it.
 */
function forbiddenByRls(mensajePorDefecto: string): { readonly error: string; readonly message: string } {
  const traducido = traducirErrorTalleres({ code: '42501' }, mensajePorDefecto)
  return { error: traducido.error, message: traducido.message }
}

const NOMBRE_MIN_LENGTH = 2
const NOMBRE_MAX_LENGTH = 200
const DESCRIPCION_MAX_LENGTH = 2000

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
    return { ok: false, result: { ok: false, error: 'unauthorized', message: 'Necesitas iniciar sesión.' } }
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

export interface UpdateTallerDescripcionInput {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly descripcion: string
}

/**
 * T3 correction — same in-place-edit pattern and write path as
 * updateTallerNombre: a plain `talleres` table UPDATE, gated by the same
 * talleres_update_director RLS policy (there is no `editar_taller` RPC —
 * see this file's header). An empty/whitespace-only value clears the
 * description (stored as NULL, not an empty string) — the table's own
 * CHECK (descripcion IS NULL OR length(descripcion) <= 2000) allows
 * either, but NULL is the cleaner "no description" state.
 */
export async function updateTallerDescripcion(
  input: UpdateTallerDescripcionInput,
): Promise<TallerActionResult<{ descripcion: string | null }>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  const trimmed = input.descripcion.trim()
  if (trimmed.length > DESCRIPCION_MAX_LENGTH) {
    return {
      ok: false,
      error: 'invalid-input',
      message: `La descripción no puede superar los ${DESCRIPCION_MAX_LENGTH} caracteres.`,
    }
  }
  const descripcion = trimmed.length === 0 ? null : trimmed

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { data, error } = await client
    .from('talleres')
    .update({ descripcion })
    .eq('id', input.tallerId)
    .select('descripcion')
    .single()

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo actualizar la descripción.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true, descripcion: (data as { descripcion: string | null }).descripcion }
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
  const { data, error } = await client
    .from('talleres')
    .update({ cadencia_dias: input.cadenciaDias, duracion_minutos: input.duracionMinutos })
    .eq('id', input.tallerId)
    .select('id')

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo actualizar la cadencia.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }
  if (!data || data.length === 0) {
    return { ok: false, ...forbiddenByRls('No se pudo actualizar la cadencia.') }
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
  const { data, error } = await client
    .from('taller_plantilla_clases')
    .update({ tema })
    .eq('id', input.claseId)
    .select('id')

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo editar la clase.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }
  if (!data || data.length === 0) {
    return { ok: false, ...forbiddenByRls('No se pudo editar la clase.') }
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
  const { data, error } = await client
    .from('taller_plantilla_clases')
    .update({ activo: input.activo })
    .eq('id', input.claseId)
    .select('id')

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo actualizar la clase.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }
  if (!data || data.length === 0) {
    return { ok: false, ...forbiddenByRls('No se pudo actualizar la clase.') }
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
  const { data, error } = await client
    .from('taller_plantilla_grupos')
    .update({ nombre, capacidad: input.capacidad })
    .eq('id', input.grupoId)
    .select('id')

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo editar el grupo.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }
  if (!data || data.length === 0) {
    return { ok: false, ...forbiddenByRls('No se pudo editar el grupo.') }
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
  const { data, error } = await client
    .from('taller_plantilla_grupos')
    .update({ activo: input.activo })
    .eq('id', input.grupoId)
    .select('id')

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo actualizar el grupo.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }
  if (!data || data.length === 0) {
    return { ok: false, ...forbiddenByRls('No se pudo actualizar el grupo.') }
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
    return { ok: false, error: 'invalid-input', message: 'Elige una persona.' }
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
  const { data, error } = await client
    .from('taller_plantilla_facilitadores')
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

  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true }
}

// ─── Configuración (T4, odd/tasks/talleres-temporadas-y-ediciones.md) ────
//
// tipo/vinculo/regimen/cierre_inscripcion_offset_dias/intervalo_ediciones_
// dias (T1, migration 20260928100000_talleres_regimen_y_estado_derivado.sql)
// are plain `talleres` columns, written directly through RLS — the same
// talleres_update_director policy updateTallerNombre/updateTallerDescripcion
// already go through, so this follows their exact gate + forbiddenByRls
// shape. cadencia_dias/duracion_minutos stay on updateCadenciaYDuracion
// above (moved here in the UI only — the section, not the action).
//
// Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md T2) — adds
// clases_minimas_para_completar, the completion rule talleres_cerrar_edicion
// applies: null (empty field) means every clase dictada, otherwise an
// integer 1..50 (the column itself only requires >= 1; 50 is this form's
// own sanity cap, well above any real taller's clase count).

export interface UpdateTallerConfiguracionInput {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly tipo: 'individual' | 'pareja'
  readonly vinculo: 'matrimonio' | 'novios' | null
  readonly regimen: 'temporada' | 'cadencia'
  readonly cierreInscripcionOffsetDias: number
  readonly intervaloEdicionesDias: number | null
  /** null = todas las clases dictadas; otherwise an integer 1..50. */
  readonly clasesMinimasParaCompletar: number | null
  /**
   * When a new partner ficha gets its access email (talleres.
   * momento_envio_acceso, odd/tasks/talleres-conyuge-invitacion.md C2).
   * Omitted = the column is left as it is.
   */
  readonly momentoEnvioAcceso?: 'al_aprobar' | 'al_inscribirse'
}

const MOMENTOS_ENVIO_ACCESO = ['al_aprobar', 'al_inscribirse'] as const

const TIPOS_TALLER = ['individual', 'pareja'] as const
const VINCULOS_TALLER = ['matrimonio', 'novios'] as const
const REGIMENES_TALLER = ['temporada', 'cadencia'] as const
const CLASES_MINIMAS_MAX = 50

export async function updateTallerConfiguracion(
  input: UpdateTallerConfiguracionInput,
): Promise<TallerActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  if (!TIPOS_TALLER.includes(input.tipo)) {
    return { ok: false, error: 'invalid-input', message: 'Tipo inválido (individual o parejas).' }
  }
  // A régimen=individual taller never has a vínculo — normalized here
  // (not just in the UI) so a stale client can't sneak one through.
  const vinculo = input.tipo === 'pareja' ? input.vinculo : null
  if (vinculo !== null && !VINCULOS_TALLER.includes(vinculo)) {
    return { ok: false, error: 'invalid-input', message: 'Vínculo inválido (matrimonio o novios).' }
  }
  if (!REGIMENES_TALLER.includes(input.regimen)) {
    return { ok: false, error: 'invalid-input', message: 'Régimen inválido (temporada o cadencia).' }
  }
  if (
    !Number.isInteger(input.cierreInscripcionOffsetDias) ||
    input.cierreInscripcionOffsetDias < -60 ||
    input.cierreInscripcionOffsetDias > 60
  ) {
    return {
      ok: false,
      error: 'invalid-input',
      message: 'El cierre de inscripción debe ser un entero entre -60 y 60 días.',
    }
  }
  if (
    input.intervaloEdicionesDias !== null &&
    (!Number.isInteger(input.intervaloEdicionesDias) ||
      input.intervaloEdicionesDias < 1 ||
      input.intervaloEdicionesDias > 365)
  ) {
    return {
      ok: false,
      error: 'invalid-input',
      message: 'El intervalo entre ediciones debe ser un entero entre 1 y 365 días.',
    }
  }
  // An empty field arrives as null (= todas las clases dictadas); a stale
  // client that omits the key is normalized the same way.
  const clasesMinimas = input.clasesMinimasParaCompletar ?? null
  if (
    clasesMinimas !== null &&
    (!Number.isInteger(clasesMinimas) || clasesMinimas < 1 || clasesMinimas > CLASES_MINIMAS_MAX)
  ) {
    return {
      ok: false,
      error: 'invalid-input',
      message: `Las clases mínimas para completar deben ser un entero entre 1 y ${CLASES_MINIMAS_MAX}.`,
    }
  }

  if (input.momentoEnvioAcceso !== undefined && !MOMENTOS_ENVIO_ACCESO.includes(input.momentoEnvioAcceso)) {
    return {
      ok: false,
      error: 'invalid-input',
      message: 'El envío del acceso debe ser al aprobar o al inscribirse.',
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { data, error } = await client
    .from('talleres')
    .update({
      tipo: input.tipo,
      vinculo,
      regimen: input.regimen,
      cierre_inscripcion_offset_dias: input.cierreInscripcionOffsetDias,
      intervalo_ediciones_dias: input.intervaloEdicionesDias,
      clases_minimas_para_completar: clasesMinimas,
      ...(input.momentoEnvioAcceso !== undefined ? { momento_envio_acceso: input.momentoEnvioAcceso } : {}),
    })
    .eq('id', input.tallerId)
    .select('id')

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo actualizar la configuración.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }
  if (!data || data.length === 0) {
    return { ok: false, ...forbiddenByRls('No se pudo actualizar la configuración.') }
  }

  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true }
}

// ─── Crear edición (T4) ───────────────────────────────────────────────────
//
// One-question "Crear edición" — wraps the talleres_crear_edicion RPC
// (migration 20260928110000_talleres_crear_edicion.sql). Authority,
// régimen branching, temporada exclusivity and the adelantar cap are ALL
// enforced by the RPC itself (P0001/P0002/42501); this action only shapes
// the call and translates the result, mirroring T2's crearPlantillaClase
// pattern of thin validation + a single RPC round trip.

export interface CrearEdicionInput {
  readonly tallerId: string
  readonly tallerSlug: string
  /** Régimen=cadencia only — the RPC requires this; ignored (sent as null) for régimen=temporada. */
  readonly fechaInicio: string | null
  /** Régimen=temporada only — the RPC requires this; ignored (sent as null) for régimen=cadencia. */
  readonly temporadaId: string | null
  /** Régimen=cadencia only, 0..6 — how many additional ediciones to create spaced by the taller's intervalo_ediciones_dias. */
  readonly adelantar: number
}

export interface CrearEdicionEdicionCreada {
  readonly edicionId: string
  readonly nombre: string
}

export type CrearEdicionResult =
  | { readonly ok: true; readonly ediciones: readonly CrearEdicionEdicionCreada[] }
  | { readonly ok: false; readonly error: string; readonly message: string }

export async function crearEdicion(input: CrearEdicionInput): Promise<CrearEdicionResult> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { data, error } = await client.rpc('talleres_crear_edicion', {
    p_taller_id: input.tallerId,
    p_fecha_inicio: input.fechaInicio,
    p_temporada_id: input.temporadaId,
    p_adelantar: input.adelantar,
  })

  if (error || !data) {
    const traducido = traducirErrorTalleres(error, 'No se pudo crear la edición.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  const resultado = data as {
    ediciones?: ReadonlyArray<{ edicion_id: string; nombre: string }>
  }
  const ediciones = (resultado.ediciones ?? []).map((e) => ({
    edicionId: e.edicion_id,
    nombre: e.nombre,
  }))
  if (ediciones.length === 0) {
    return { ok: false, error: 'internal', message: 'No se pudo crear la edición.' }
  }

  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true, ediciones }
}
