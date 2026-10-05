'use server'

/**
 * Dream Team — server actions for the campus service shifts on
 * /admin/dream-team/estructura (D12 of odd/tasks/ninos-voluntarios-waumba.md).
 *
 * Same contract as ./actions.ts: flag → session → dream_team.org.manage before
 * touching the database, a discriminated result, never a thrown error reaching
 * the client. RLS enforces the same gate (shifts: org.manage; a node's
 * restriction: org.manage in the tree of the node).
 *
 * Shifts are never deleted from here: a servicio may be assigned to one, so a
 * shift that stops being used is disabled (`activo = false`).
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  hasDreamTeamOrgManageCapability,
  isDreamTeamEnabled,
  requireDreamTeamSession,
} from '@/lib/platform/dream-team/route-access'
import { guardarTurnosDeEquipo, validarDatosTurno, validarTurnoIds } from '@/lib/platform/dream-team/turnos'

const ESTRUCTURA_PATH = '/admin/dream-team/estructura'

type ActionError = 'forbidden' | 'not-found' | 'unauthorized' | 'invalid-input' | 'internal'

export type TurnoActionResult = { readonly ok: true } | { readonly ok: false; readonly error: ActionError; readonly message?: string }

type Contexto =
  | { readonly ok: true; readonly supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> }
  | { readonly ok: false; readonly error: ActionError }

async function contextoDeEscritura(): Promise<Contexto> {
  if (!isDreamTeamEnabled()) return { ok: false, error: 'not-found' }
  const session = await requireDreamTeamSession()
  if (!session) return { ok: false, error: 'unauthorized' }
  if (!hasDreamTeamOrgManageCapability(session)) return { ok: false, error: 'forbidden' }
  return { ok: true, supabase: await createSupabaseServerClient() }
}

function fallo(error: { code?: string; message?: string }, contexto: string): TurnoActionResult {
  if (error.code === '23505') return { ok: false, error: 'invalid-input', message: 'Ya existe un turno con ese nombre en el campus.' }
  if (error.code === '42501') return { ok: false, error: 'forbidden' }
  if (error.code === '23514') {
    return { ok: false, error: 'invalid-input', message: 'Ese turno no pertenece al campus o no está activo.' }
  }
  console.error(`[dream-team/estructura] ${contexto}:`, error)
  return { ok: false, error: 'internal', message: error.message }
}

export interface CrearTurnoInput {
  readonly campusId: string
  readonly nombre: string
  readonly diaSemana: number
  readonly hora: string
  readonly orden?: number
}

export async function crearTurno(input: CrearTurnoInput): Promise<TurnoActionResult> {
  const contexto = await contextoDeEscritura()
  if (!contexto.ok) return contexto
  if (typeof input.campusId !== 'string' || !input.campusId) return { ok: false, error: 'invalid-input', message: 'Elige un campus.' }
  const validacion = validarDatosTurno(input)
  if (!validacion.ok) return { ok: false, error: 'invalid-input', message: validacion.message }

  const { datos } = validacion
  const { error } = await contexto.supabase.from('dream_team_turnos').insert({
    campus_id: input.campusId,
    nombre: datos.nombre,
    dia_semana: datos.diaSemana,
    hora: datos.hora,
    orden: datos.orden,
  })
  if (error) return fallo(error, 'crearTurno')
  revalidatePath(ESTRUCTURA_PATH)
  return { ok: true }
}

export async function cambiarActivoTurno(input: { readonly id: string; readonly activo: boolean }): Promise<TurnoActionResult> {
  const contexto = await contextoDeEscritura()
  if (!contexto.ok) return contexto
  if (typeof input.id !== 'string' || typeof input.activo !== 'boolean') return { ok: false, error: 'invalid-input' }

  const { data, error } = await contexto.supabase
    .from('dream_team_turnos')
    .update({ activo: input.activo })
    .eq('id', input.id)
    .select('id')
  if (error) return fallo(error, 'cambiarActivoTurno')
  if (!data || data.length === 0) return { ok: false, error: 'not-found' }
  revalidatePath(ESTRUCTURA_PATH)
  return { ok: true }
}

/** Sets the shifts a node serves in; an empty list makes it inherit from its parent again. */
export async function guardarTurnosEquipo(input: {
  readonly equipoId: string
  readonly turnoIds: readonly string[]
}): Promise<TurnoActionResult> {
  const contexto = await contextoDeEscritura()
  if (!contexto.ok) return contexto
  if (typeof input.equipoId !== 'string' || !input.equipoId) return { ok: false, error: 'invalid-input' }
  const validacion = validarTurnoIds(input.turnoIds)
  if (!validacion.ok) return { ok: false, error: 'invalid-input', message: validacion.message }

  try {
    await guardarTurnosDeEquipo(contexto.supabase, input.equipoId, validacion.turnoIds)
  } catch (error) {
    return fallo(error as { code?: string; message?: string }, 'guardarTurnosEquipo')
  }
  revalidatePath(ESTRUCTURA_PATH)
  return { ok: true }
}
