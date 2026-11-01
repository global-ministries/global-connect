/**
 * Estudiantes — loads the leader list (/estudiantes/grupos/[grupoId], C3b of
 * odd/tasks/estudiantes-fase-b.md) and the "Mi grupo" entry (/estudiantes)
 * with the session client.
 *
 * Access: the group must be one of estudiantes_mis_grupos() (level >= 1:
 * its leaders, the entrenador / director de grupo of its sub-área, the
 * directors above, admin and the campus pastor); anyone else gets `null` and
 * the page answers with the app's not-found state.
 *
 * Then, in parallel: the meetings the group can mark
 * (estudiantes_grupo_sesiones), the school scale of the campus (Transit /
 * Inside Out, for the visitor form) and the caller's gender (the entrenador
 * notice). The chosen meeting (lib/platform/estudiantes/lista-vista.ts) gives
 * the roster (estudiantes_grupo_lista) and the history dots
 * (estudiantes_grupo_historial). A history that cannot be read is shown
 * empty and logged.
 */
import type { createSupabaseServerClient } from '@/lib/supabase/server'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'

import { aEscala, type GradoEscala } from './grupos-datos'
import { HISTORIAL_VACIO, aGruposMios, aHistorial, aListaGrupo, aSesiones, type GrupoMio, type Historial, type ListaGrupo, type Sesion } from './lista-datos'
import { elegirSesion, grupoUnico, type PedidoSesion, type SesionElegida } from './lista-vista'

type Cliente = Awaited<ReturnType<typeof createSupabaseServerClient>>

export interface DatosListaLider {
  /** The group as estudiantes_mis_grupos lists it (always present). */
  readonly grupo: GrupoMio
  /** The roster of the chosen meeting; `null` when there is no meeting to mark. */
  readonly lista: ListaGrupo | null
  readonly sesiones: readonly Sesion[]
  readonly sesion: SesionElegida | null
  readonly historial: Historial
  /** The campus scale (Transit / Inside Out); empty for The Living Room. */
  readonly escala: readonly GradoEscala[]
  /** Other active groups of the same sub-área and campus the caller sees (the entrenador selector). */
  readonly gruposSubarea: readonly GrupoMio[]
  /** The caller sees no other group and manages none: /estudiantes sends them here, so there is no "‹ Estudiantes". */
  readonly esRaiz: boolean
  /** The caller's gender, for "Marcas como entrenadora / entrenador". */
  readonly generoVisor: string | null
  /** Today in Caracas (YYYY-MM-DD). */
  readonly hoy: string
}

export async function cargarMisGrupos(supabase: Cliente): Promise<GrupoMio[]> {
  const { data, error } = await supabase.rpc('estudiantes_mis_grupos')
  if (error) throw new Error(`estudiantes_mis_grupos: ${error.message}`)
  return aGruposMios(data ?? [])
}

async function generoDe(supabase: Cliente, authId: string): Promise<string | null> {
  const { data, error } = await supabase.from('usuarios').select('genero').eq('auth_id', authId).maybeSingle()
  if (error) return null
  return (data as { genero?: string | null } | null)?.genero ?? null
}

export async function cargarListaLider(
  supabase: Cliente,
  { grupoId, pedido, authId }: { readonly grupoId: string; readonly pedido: PedidoSesion; readonly authId: string },
): Promise<DatosListaLider | null> {
  const grupos = await cargarMisGrupos(supabase)
  const grupo = grupos.find((g) => g.grupoId === grupoId)
  if (!grupo) return null

  const tlr = grupo.experiencia === 'the_living_room'
  const [sesionesRes, escalaRes, generoVisor] = await Promise.all([
    supabase.rpc('estudiantes_grupo_sesiones', { p_grupo_id: grupoId }),
    tlr ? Promise.resolve(null) : supabase.rpc('estudiantes_escala_campus', { p_campus_id: grupo.campusId }),
    generoDe(supabase, authId),
  ])
  if (sesionesRes.error) throw new Error(`estudiantes_grupo_sesiones: ${sesionesRes.error.message}`)
  if (escalaRes?.error) console.error('[estudiantes/lista] escala_campus failed', grupo.campusId, escalaRes.error)

  const hoy = hoyEnCaracas()
  const sesiones = aSesiones(sesionesRes.data ?? [])
  const sesion = elegirSesion(sesiones, grupo.experiencia, pedido, hoy)

  let lista: ListaGrupo | null = null
  let historial: Historial = HISTORIAL_VACIO
  if (sesion) {
    const [listaRes, historialRes] = await Promise.all([
      supabase.rpc('estudiantes_grupo_lista', {
        p_grupo_id: grupoId,
        p_fecha: sesion.fecha,
        ...(sesion.turnoId ? { p_turno_id: sesion.turnoId } : {}),
      }),
      supabase.rpc('estudiantes_grupo_historial', { p_grupo_id: grupoId }),
    ])
    if (listaRes.error) throw new Error(`estudiantes_grupo_lista: ${listaRes.error.message}`)
    lista = aListaGrupo(listaRes.data)
    if (historialRes.error) console.error('[estudiantes/lista] grupo_historial failed', grupoId, historialRes.error)
    else historial = aHistorial(historialRes.data)
  }

  return {
    grupo,
    lista,
    sesiones,
    sesion,
    historial,
    escala: escalaRes && !escalaRes.error ? aEscala(escalaRes.data ?? []) : [],
    gruposSubarea: grupos.filter((g) => g.subareaId === grupo.subareaId && g.campusId === grupo.campusId),
    esRaiz: grupoUnico(grupos) !== null,
    generoVisor,
    hoy,
  }
}
