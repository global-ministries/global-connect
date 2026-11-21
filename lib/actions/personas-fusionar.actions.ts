'use server'

/**
 * Personas — server actions of /admin/personas/fusionar
 * (odd/tasks/dream-team-estructura-correcciones.md, T5, S6c): search the two
 * fichas, their side-by-side summary, and the merge (dry run first).
 *
 * Gate: an authenticated session only; who may merge is decided in the
 * database (personas_fusion_buscar, personas_fusion_resumen and
 * personas_fusionar refuse anyone but admin or pastor with 42501,
 * 20261121120000_personas_fusionar.sql). lib/platform/personas/fusion.ts maps
 * the answers and turns the errors into Spanish; a database detail never
 * reaches the screen.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  MENSAJE_ELIGE_DOS,
  mapBusquedaFusion,
  mapResultadoFusion,
  mapResumenFusion,
  mensajeErrorFusion,
  type PersonaFusionBuscada,
  type ResultadoFusion,
  type ResumenPersonaFusion,
} from '@/lib/platform/personas/fusion'

export type ResultadoAccionFusion<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string }

type ErrorRpc = { readonly code?: string; readonly message?: string } | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the RPCs are newer than the generated types
type ClienteRpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: any }> }

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

async function conSesion<T>(run: (cliente: ClienteRpc) => Promise<ResultadoAccionFusion<T>>): Promise<ResultadoAccionFusion<T>> {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  if (!user) return { ok: false, error: SIN_SESION }
  return run(cliente as unknown as ClienteRpc)
}

function fallo(error: ErrorRpc, contexto: string): { readonly ok: false; readonly error: string } {
  const code = error?.code
  if (code !== '42501' && code !== '22023') console.error(`[personas-fusionar ${contexto}] error:`, error)
  return { ok: false, error: mensajeErrorFusion(error) }
}

/** The people matching q (accents, words in any order, cédula, teléfono); at most 20. */
export async function buscarPersonasParaFusion(q: string): Promise<ResultadoAccionFusion<PersonaFusionBuscada[]>> {
  const texto = typeof q === 'string' ? q.trim().slice(0, 100) : ''
  return conSesion(async (cliente) => {
    if (texto.length < 2) return { ok: true, data: [] }
    const { data, error } = await cliente.rpc('personas_fusion_buscar', { p_q: texto })
    if (error) return fallo(error, 'buscar')
    return { ok: true, data: mapBusquedaFusion(data) }
  })
}

/** The side-by-side summary of two different fichas, in the given order. */
export async function resumenFusion(ids: readonly string[]): Promise<ResultadoAccionFusion<ResumenPersonaFusion[]>> {
  return conSesion(async (cliente) => {
    if (!Array.isArray(ids) || ids.length !== 2 || !ids.every(esUuid) || ids[0] === ids[1]) {
      return { ok: false, error: MENSAJE_ELIGE_DOS }
    }
    const { data, error } = await cliente.rpc('personas_fusion_resumen', { p_ids: [ids[0], ids[1]] })
    if (error) return fallo(error, 'resumen')
    return { ok: true, data: mapResumenFusion(data) }
  })
}

/** Merges seVaId into quedaId; `simular` returns the same counts without changing anything. */
export async function fusionarPersonas(entrada: {
  readonly quedaId: string
  readonly seVaId: string
  readonly simular: boolean
}): Promise<ResultadoAccionFusion<ResultadoFusion>> {
  return conSesion(async (cliente) => {
    const { quedaId, seVaId } = entrada ?? ({} as typeof entrada)
    if (!esUuid(quedaId) || !esUuid(seVaId) || quedaId === seVaId) return { ok: false, error: MENSAJE_ELIGE_DOS }
    const { data, error } = await cliente.rpc('personas_fusionar', {
      p_queda: quedaId,
      p_se_va: seVaId,
      p_simular: entrada.simular === true,
    })
    if (error) return fallo(error, entrada.simular ? 'simular' : 'fusionar')
    return { ok: true, data: mapResultadoFusion(data) }
  })
}
