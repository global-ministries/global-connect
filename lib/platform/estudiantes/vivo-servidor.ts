/**
 * Estudiantes — loads the live view (/estudiantes/vivo, C4b of
 * odd/tasks/estudiantes-fase-b.md) with the session client.
 *
 * In parallel: the meetings the caller may open (estudiantes_vivo_opciones,
 * last 14 days) and the menu facts (estudiantes_acceso). Without a meeting and
 * without the live view (`vivo`), the caller gets `null` and the page answers
 * with the app's not-found state; a director with no meeting in those days
 * gets the empty state. The chosen meeting (vivo-vista.ts) gives the live
 * data (estudiantes_en_vivo). Live data that cannot be read leaves the page
 * up with the message: the 15 s refresh retries it.
 */
import type { createSupabaseServerClient } from '@/lib/supabase/server'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'

import { parsearAccesoEstudiantes } from './acceso'
import { mensajeErrorVivo } from './errores'
import { aDatosVivo, aOpcionesVivo, type DatosVivo, type OpcionVivo } from './vivo-datos'
import { elegirOpcion, type PedidoVivo } from './vivo-vista'

type Cliente = Awaited<ReturnType<typeof createSupabaseServerClient>>

export interface DatosPaginaVivo {
  readonly opciones: readonly OpcionVivo[]
  /** `null` when there is no meeting to show. */
  readonly opcion: OpcionVivo | null
  /** `null` without a meeting or when the live data could not be read. */
  readonly datos: DatosVivo | null
  /** Why `datos` is missing for a chosen meeting. */
  readonly error: string | null
}

export async function cargarVivo(supabase: Cliente, pedido: PedidoVivo): Promise<DatosPaginaVivo | null> {
  const [opcionesRes, accesoRes] = await Promise.all([supabase.rpc('estudiantes_vivo_opciones'), supabase.rpc('estudiantes_acceso')])
  if (opcionesRes.error) throw new Error(`estudiantes_vivo_opciones: ${opcionesRes.error.message}`)
  if (accesoRes.error) console.error('[estudiantes/vivo] estudiantes_acceso failed', accesoRes.error)

  const opciones = aOpcionesVivo(opcionesRes.data ?? [])
  if (opciones.length === 0 && !parsearAccesoEstudiantes(accesoRes).vivo) return null

  const opcion = elegirOpcion(opciones, pedido, hoyEnCaracas())
  if (!opcion) return { opciones, opcion: null, datos: null, error: null }

  const vivoRes = await supabase.rpc('estudiantes_en_vivo', { p_ambito_id: opcion.ambitoId, p_fecha: opcion.fecha, p_turno_id: opcion.turnoId })
  if (vivoRes.error) {
    console.error('[estudiantes/vivo] estudiantes_en_vivo failed', opcion.ambitoId, opcion.fecha, vivoRes.error)
    return { opciones, opcion, datos: null, error: mensajeErrorVivo(vivoRes.error) }
  }
  const datos = aDatosVivo(vivoRes.data)
  return { opciones, opcion, datos, error: datos ? null : mensajeErrorVivo(null) }
}
