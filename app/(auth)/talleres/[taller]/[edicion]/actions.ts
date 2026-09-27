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
import { rutaEdicion, rutaGrupo, rutaTaller } from '@/lib/platform/talleres/rutas'

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

// ─── Cancelar edición (T4, odd/tasks/talleres-temporadas-y-ediciones.md) ──
//
// Replaces "Cerrar esta edición" (closeExistingEdicionAction, gone — the
// estado now follows the dates, see talleres_estado_efectivo). Manual
// states are only borrador/cancelado (Decisiones): cancelar is allowed
// from borrador OR abierto, a plain `taller_ediciones` UPDATE under RLS
// (the same director/admin-scoped taller_ediciones_update policy the
// legacy open/close actions already used), with the same `.select('id')`
// non-empty check every other RLS-direct mutation in this feature uses.
// Cancelling with inscritos is ALLOWED (the confirm dialog just warns);
// the DB itself never blocks it — see the button's own confirm copy.

export interface CancelarEdicionInput {
  readonly tallerSlug: string
  readonly edicionId: string
}

export async function cancelarEdicion(
  input: CancelarEdicionInput,
): Promise<EdicionActionResult<object>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { data, error } = await client
    .from('taller_ediciones')
    .update({ estado: 'cancelado' })
    .eq('id', input.edicionId)
    .in('estado', ['borrador', 'abierto'])
    .select('id')

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo cancelar la edición.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }
  if (!data || data.length === 0) {
    return { ok: false, ...forbiddenByRls('No se pudo cancelar la edición.') }
  }

  revalidatePath(rutaEdicion(input.tallerSlug, input.edicionId))
  revalidatePath(rutaTaller(input.tallerSlug))
  return { ok: true }
}

// ─── Cupo (T6, odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) ──────
//
// No existing "Agregar persona/inscribir" control was found anywhere in
// the app (grepped app/lib for "inscrib" — only the public self-enroll
// flow under app/(auth)/talleres/explorar exists). These three actions are
// the coordinator/director-facing counterpart: search a persona
// (talleres_buscar_personas, already capability-gated for director.write/
// coordinator.write/admin.manage), try a normal insert (same shape as
// self-enroll, but through the RLS write branch instead of the self-enroll
// branch — no estado='pendiente' constraint from RLS, but this action
// still sends 'pendiente' so a sobre-cupo placement is the only enrolment
// path that forks the estado), and — only when that insert is refused with
// CUPO_LLENO — a second step that calls talleres_inscribir_sobre_cupo.

export interface BuscarPersonasParaInscribirResult {
  readonly ok: boolean
  readonly personas: ReadonlyArray<{
    readonly id: string
    readonly nombre: string | null
    readonly apellido: string | null
    readonly email: string | null
  }>
  readonly message?: string
}

export async function buscarPersonasParaInscribir(q: string): Promise<BuscarPersonasParaInscribirResult> {
  const gated = await gate()
  if (!gated.ok) return { ok: false, personas: [], message: gated.result.message }

  const query = q.trim()
  if (query.length < 2) return { ok: true, personas: [] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { data, error } = await client.rpc('talleres_buscar_personas', { p_q: query, p_limit: 20 })

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo buscar personas.')
    return { ok: false, personas: [], message: traducido.message }
  }

  return {
    ok: true,
    personas: ((data ?? []) as Array<{ id: string; nombre: string | null; apellido: string | null; email: string | null }>).map(
      (p) => ({ id: p.id, nombre: p.nombre, apellido: p.apellido, email: p.email }),
    ),
  }
}

export interface AgregarInscripcionInput {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly cohorteId: string
  readonly personaId: string
}

export async function agregarInscripcion(
  input: AgregarInscripcionInput,
): Promise<EdicionActionResult<{ inscripcionId: string }>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  if (!input.personaId?.trim()) {
    return { ok: false, error: 'invalid-input', message: 'Elige una persona.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { data, error } = await client
    .from('taller_inscripciones')
    .insert({
      taller_id: input.edicionId,
      cohorte_id: input.cohorteId,
      persona_principal_id: input.personaId,
      estado: 'pendiente',
    })
    .select('id')
    .single()

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo inscribir a esta persona.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }
  if (!data) {
    return { ok: false, ...forbiddenByRls('No se pudo inscribir a esta persona.') }
  }

  revalidatePath(rutaEdicion(input.tallerSlug, input.edicionId))
  return { ok: true, inscripcionId: data.id as string }
}

export interface InscribirSobreCupoInput {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly personaId: string
}

export async function inscribirSobreCupo(
  input: InscribirSobreCupoInput,
): Promise<EdicionActionResult<{ inscripcionId: string; cupo: number; ocupados: number; sobreCupo: number }>> {
  const gated = await gate()
  if (!gated.ok) return gated.result

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gated.supabase
  const { data, error } = await client.rpc('talleres_inscribir_sobre_cupo', {
    p_edicion_id: input.edicionId,
    p_persona_id: input.personaId,
  })

  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo inscribir sobre el cupo.')
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  const resultado = data as { inscripcion_id: string; cupo: number; ocupados: number; sobre_cupo: number }
  revalidatePath(rutaEdicion(input.tallerSlug, input.edicionId))
  return {
    ok: true,
    inscripcionId: resultado.inscripcion_id,
    cupo: resultado.cupo,
    ocupados: resultado.ocupados,
    sobreCupo: resultado.sobre_cupo,
  }
}
