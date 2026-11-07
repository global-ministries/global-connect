'use server'

/**
 * Grupos de Vida — the server actions of /grupos-vida/planificar (T5b and
 * S24 of odd/tasks/planner-gdv.md). The board keeps its changes in the
 * browser until "Guardar": guardarCambiosAction saves them all in one
 * planner_guardar_cambios call. Undo and "Terminé mi segmento" run on their
 * own. Each action uses the caller's session client (never the service role:
 * the RPCs check role and segment scope with auth.uid()) and revalidates the
 * planner route after a saved call. Validation and error messages live in
 * lib/platform/grupos-vida/planner/acciones.ts.
 */
import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  RUTA_PLANNER,
  deshacerPaso,
  guardarCambios,
  marcarSegmento,
  type ClienteAcciones,
  type EntradaGuardarCambios,
  type EntradaMarcarSegmento,
} from '@/lib/platform/grupos-vida/planner/acciones'

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
