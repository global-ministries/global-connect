'use server'

/**
 * Estudiantes — server actions of the "Año escolar" editor of the person
 * detail (C6b4 of odd/tasks/estudiantes-fase-b.md, S16): read the school
 * years of a member with the campus scale, and save them.
 *
 * Gate: an authenticated session only. Who may read and save (level >= 1 on
 * an active Transit / Inside Out group of the person, campus rule) is checked
 * by estudiantes_ficha (20261102110000) and estudiantes_ficha_guardar
 * (20261029100100), which raise their code as the message;
 * lib/platform/estudiantes/ficha.ts turns it into Spanish and the code travels
 * back so the editor hides for The Living Room (`anio_no_aplica`). A save
 * revalidates the Estudiantes pages that show the year.
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'
import {
  MENSAJES_ERROR_FICHA,
  codigoErrorFicha,
  mensajeErrorFicha,
  parsearFicha,
  type CodigoErrorFicha,
  type FichaEstudiante,
} from '@/lib/platform/estudiantes/ficha'

export type ResultadoFicha<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string; readonly codigo: CodigoErrorFicha | null }

type Args<F extends keyof Database['public']['Functions']> = Database['public']['Functions'][F]['Args']

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const SIN_CARGAR = 'No se pudo cargar el año escolar.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATOS_INVALIDOS = { ok: false, message: MENSAJES_ERROR_FICHA.datos_invalidos, codigo: 'datos_invalidos' } as const

const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID_RE.test(valor)
const esAnio = (valor: unknown): valor is number => typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= 20

async function clienteConSesion() {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  return user ? cliente : null
}

/** The school years of a person and the scale of their campus. */
export async function leerFicha(personaId: string): Promise<ResultadoFicha<FichaEstudiante>> {
  const cliente = await clienteConSesion()
  if (!cliente) return { ok: false, message: SIN_SESION, codigo: null }
  if (!esUuid(personaId)) return DATOS_INVALIDOS

  const { data, error } = await cliente.rpc('estudiantes_ficha', { p_persona_id: personaId })
  if (error) return { ok: false, message: mensajeErrorFicha(error, SIN_CARGAR), codigo: codigoErrorFicha(error) }
  const ficha = parsearFicha(data)
  return ficha ? { ok: true, data: ficha } : { ok: false, message: SIN_CARGAR, codigo: null }
}

/** Saves the año actual and the año final; `null` año final takes the last year of the scale. */
export async function guardarFicha(personaId: string, anioActual: number, anioFinal: number | null): Promise<ResultadoFicha<null>> {
  const cliente = await clienteConSesion()
  if (!cliente) return { ok: false, message: SIN_SESION, codigo: null }
  if (!esUuid(personaId) || !esAnio(anioActual) || (anioFinal !== null && !esAnio(anioFinal))) return DATOS_INVALIDOS

  // The generated types mark p_anio_final non-null; NULL takes the last year of the scale.
  const args = { p_persona_id: personaId, p_anio_actual: anioActual, p_anio_final: anioFinal } as Args<'estudiantes_ficha_guardar'>
  const { error } = await cliente.rpc('estudiantes_ficha_guardar', args)
  if (error) return { ok: false, message: mensajeErrorFicha(error), codigo: codigoErrorFicha(error) }

  revalidatePath('/estudiantes')
  revalidatePath('/estudiantes/grupos')
  revalidatePath('/estudiantes/grupos/[grupoId]', 'page')
  revalidatePath('/estudiantes/promocion')
  return { ok: true, data: null }
}
