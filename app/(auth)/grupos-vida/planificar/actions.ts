'use server'

/**
 * Grupos de Vida — the server actions of /grupos-vida/planificar (T5b and
 * S24 of odd/tasks/planner-gdv.md). The board keeps its changes in the
 * browser until "Guardar": guardarCambiosAction saves them all in one
 * planner_guardar_cambios call. Undo and "Terminé mi segmento" run on their
 * own; cargarOrigenAction only reads the origin season's groups for the Lado
 * a lado view (T7) and cargarHistorialAction the older steps of the history
 * panel (T8a). publicarTemporadaAction publishes from the review
 * (/publicar, T8a) and revalidates every Grupos de Vida page, whose groups
 * and seasons change. The new-season assistant (/nueva, T8b) creates the
 * season with crearTemporadaAction (revalidating the planner and the seasons
 * list), reads the season that closes with cargarCierreAction and copies its
 * groups with guardarCambiosAction, batch by batch. Each action uses the caller's session client (never the
 * service role: the RPCs check role and segment scope with auth.uid()) and
 * revalidates the planner route after a saved call. Validation and error messages live in
 * lib/platform/grupos-vida/planner/acciones.ts.
 */
import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  RUTA_PLANNER,
  crearTemporada,
  deshacerPaso,
  guardarCambios,
  historialPaginado,
  marcarSegmento,
  publicarTemporada,
  type ClienteAcciones,
  type EntradaCrearTemporada,
  type EntradaGuardarCambios,
  type EntradaMarcarSegmento,
} from '@/lib/platform/grupos-vida/planner/acciones'
import { cargarCierre, cargarGruposOrigen, comoClientePlanner } from '@/lib/platform/grupos-vida/planner/datos'

async function conSesion<R extends { readonly ok: boolean }>(accion: (cliente: ClienteAcciones) => Promise<R>): Promise<R> {
  const supabase = await createSupabaseServerClient()
  const rpc = supabase.rpc as unknown as ClienteAcciones['rpc']
  const resultado = await accion({ rpc: rpc.bind(supabase) })
  if (resultado.ok) revalidatePath(RUTA_PLANNER)
  return resultado
}

export async function guardarCambiosAction(entrada: EntradaGuardarCambios) {
  return conSesion((cliente) => guardarCambios(cliente, entrada))
}

export async function deshacerPasoAction(entrada: { readonly pasoId: string }) {
  return conSesion((cliente) => deshacerPaso(cliente, entrada))
}

export async function marcarSegmentoAction(entrada: EntradaMarcarSegmento) {
  return conSesion((cliente) => marcarSegmento(cliente, entrada))
}

export async function cargarOrigenAction(entrada: { readonly temporadaId: string }) {
  const temporadaId = typeof entrada?.temporadaId === 'string' ? entrada.temporadaId : ''
  if (!temporadaId) return { ok: false as const, mensaje: 'La temporada no existe.' }
  const supabase = await createSupabaseServerClient()
  return cargarGruposOrigen(comoClientePlanner(supabase), temporadaId)
}

export async function cargarHistorialAction(entrada: { readonly temporadaId: string; readonly antes?: string | null }) {
  const supabase = await createSupabaseServerClient()
  const rpc = supabase.rpc as unknown as ClienteAcciones['rpc']
  return historialPaginado({ rpc: rpc.bind(supabase) }, { temporadaId: entrada?.temporadaId ?? '', antes: entrada?.antes ?? null })
}

export async function crearTemporadaAction(entrada: EntradaCrearTemporada) {
  const supabase = await createSupabaseServerClient()
  const rpc = supabase.rpc as unknown as ClienteAcciones['rpc']
  const resultado = await crearTemporada({ rpc: rpc.bind(supabase) }, entrada)
  if (resultado.ok) {
    revalidatePath(RUTA_PLANNER, 'layout')
    revalidatePath('/grupos-vida/temporadas')
  }
  return resultado
}

export async function cargarCierreAction(entrada: { readonly origenId: string; readonly destinoId?: string | null }) {
  const supabase = await createSupabaseServerClient()
  return cargarCierre(comoClientePlanner(supabase), { origenId: entrada?.origenId ?? '', destinoId: entrada?.destinoId ?? null })
}

export async function publicarTemporadaAction(entrada: { readonly temporadaId: string }) {
  const supabase = await createSupabaseServerClient()
  const rpc = supabase.rpc as unknown as ClienteAcciones['rpc']
  const resultado = await publicarTemporada({ rpc: rpc.bind(supabase) }, { temporadaId: entrada?.temporadaId ?? '' })
  if (resultado.ok) {
    revalidatePath(RUTA_PLANNER, 'layout')
    revalidatePath('/grupos-vida', 'layout')
  }
  return resultado
}
