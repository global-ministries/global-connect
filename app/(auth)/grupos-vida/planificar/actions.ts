'use server'

/**
 * Grupos de Vida — the server actions of /grupos-vida/planificar (T5b of
 * odd/tasks/planner-gdv.md). Each one runs one planner step with the caller's
 * session client (never the service role: the RPCs check role and segment
 * scope with auth.uid()) and revalidates the planner route after a saved
 * step. Validation and error messages live in
 * lib/platform/grupos-vida/planner/acciones.ts.
 */
import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  RUTA_PLANNER,
  crearGrupo,
  deshacerPaso,
  editarGrupo,
  eliminarGrupo,
  marcarSegmento,
  moverPersonas,
  type ClienteAcciones,
  type EntradaCrearGrupo,
  type EntradaEditarGrupo,
  type EntradaMarcarSegmento,
  type EntradaMover,
  type ResultadoAccion,
} from '@/lib/platform/grupos-vida/planner/acciones'

async function conSesion<T>(accion: (cliente: ClienteAcciones) => Promise<ResultadoAccion<T>>): Promise<ResultadoAccion<T>> {
  const supabase = await createSupabaseServerClient()
  const rpc = supabase.rpc as unknown as ClienteAcciones['rpc']
  const resultado = await accion({ rpc: rpc.bind(supabase) })
  if (resultado.ok) revalidatePath(RUTA_PLANNER)
  return resultado
}

export async function moverPersonasAction(entrada: EntradaMover) {
  return conSesion((cliente) => moverPersonas(cliente, entrada))
}

export async function crearGrupoAction(entrada: EntradaCrearGrupo) {
  return conSesion((cliente) => crearGrupo(cliente, entrada))
}

export async function editarGrupoAction(entrada: EntradaEditarGrupo) {
  return conSesion((cliente) => editarGrupo(cliente, entrada))
}

export async function eliminarGrupoAction(entrada: { readonly grupoId: string }) {
  return conSesion((cliente) => eliminarGrupo(cliente, entrada))
}

export async function deshacerPasoAction(entrada: { readonly pasoId: string }) {
  return conSesion((cliente) => deshacerPaso(cliente, entrada))
}

export async function marcarSegmentoAction(entrada: EntradaMarcarSegmento) {
  return conSesion((cliente) => marcarSegmento(cliente, entrada))
}
