'use server'

/**
 * Estudiantes — server action of "Promover temporada" (/estudiantes/promocion,
 * C6b3 of odd/tasks/estudiantes-fase-b.md, S11–S15): applies the promotion of
 * a campus with the director's choice for every last-Transit-year group.
 *
 * Gate: an authenticated session only. Who may promote (level 3 on every
 * Transit and Inside Out sub-área of the campus), the 180-day lock and the
 * decisions are checked again by estudiantes_promocion_aplicar
 * (supabase/migrations/20261102100000_estudiantes_promocion.sql), which raises
 * its code as the message; lib/platform/estudiantes/promocion.ts turns it into
 * Spanish. On success the promotion page (now blocked) and Grupos are
 * revalidated.
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { DECISIONES, leerResumenPromocion, mensajeErrorPromocion, type Decision, type ResumenPromocion } from '@/lib/platform/estudiantes/promocion'

export type ResultadoPromocion<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string }

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const DATOS_INVALIDOS = 'Revisa los datos e inténtalo de nuevo.'
const MAX_GRUPOS = 200
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID_RE.test(valor)

function decisionesValidas(valor: unknown): Record<string, Decision> | null {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return null
  const entradas = Object.entries(valor)
  if (entradas.length > MAX_GRUPOS) return null
  const salida: Record<string, Decision> = {}
  for (const [grupoId, decision] of entradas) {
    if (!esUuid(grupoId) || !DECISIONES.includes(decision as Decision)) return null
    salida[grupoId] = decision as Decision
  }
  return salida
}

export interface AplicarPromocionInput {
  readonly campusId: string
  /** One choice per active group of the last Transit year; `{}` when there is none. */
  readonly decisiones: Readonly<Record<string, Decision>>
}

export async function aplicarPromocion(input: AplicarPromocionInput): Promise<ResultadoPromocion<ResumenPromocion>> {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  if (!user) return { ok: false, message: SIN_SESION }

  const decisiones = decisionesValidas(input?.decisiones)
  if (!esUuid(input?.campusId) || !decisiones) return { ok: false, message: DATOS_INVALIDOS }

  const { data, error } = await cliente.rpc('estudiantes_promocion_aplicar', { p_campus_id: input.campusId, p_decisiones: decisiones })
  if (error) return { ok: false, message: mensajeErrorPromocion(error) }

  revalidatePath('/estudiantes/promocion')
  revalidatePath('/estudiantes/grupos')
  return {
    ok: true,
    data: leerResumenPromocion(data) ?? { grupos: 0, egresan: 0, fichasSuben: 0, gruposNuevos: [], pasanGrupo: [], aplicadaAt: null, proxima: null },
  }
}
