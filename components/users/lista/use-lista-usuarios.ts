'use client'

/**
 * Usuarios — the /users data on the v2 RPCs (S13 of
 * odd/tasks/sistema-diseno-v2.md), driven by the filters the screen keeps in
 * the URL. The list RPC gets every filter, the sort and the page window
 * (`argumentosLista`); the statistics behind the hero and the attention
 * metrics count the caller's whole scope (`argumentosEstadisticas`: only the
 * caller and the campus), so changing a filter reloads the list alone.
 *
 * The rows stay on screen while the next page loads (`cargando` turns the
 * list into skeleton rows, the frame stays). An older answer that arrives
 * after a newer one is dropped.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import {
  aEstadisticas,
  aPersonas,
  argumentosEstadisticas,
  argumentosLista,
  type EstadisticasUsuarios,
  type FilaUsuarioRpc,
  type FiltrosUsuarios,
  type PersonaUsuario,
} from '@/lib/platform/usuarios/lista-vista'

export interface OpcionesListaUsuarios {
  readonly filtros: FiltrosUsuarios
  /** The header campus; `null` = every campus the caller may see. */
  readonly campusId: string | null
  /** Page size (20, 50 or 100). */
  readonly limite: number
}

export interface ListaUsuarios {
  readonly personas: readonly PersonaUsuario[]
  /** People that match the filters (all pages). */
  readonly total: number
  readonly estadisticas: EstadisticasUsuarios | null
  readonly cargando: boolean
  readonly error: string | null
  readonly recargar: () => void
}

const mensajeDe = (error: unknown, porDefecto: string): string =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : porDefecto

export function useListaUsuarios({ filtros, campusId, limite }: OpcionesListaUsuarios): ListaUsuarios {
  const { authUserId } = useCurrentUser()
  const notificar = useNotificaciones()
  const supabase = useMemo(() => createClient(), [])

  const [respuesta, setRespuesta] = useState<{
    readonly clave: string
    readonly personas: readonly PersonaUsuario[]
    readonly total: number
    readonly error: string | null
  } | null>(null)
  const [estadisticas, setEstadisticas] = useState<EstadisticasUsuarios | null>(null)
  const [version, setVersion] = useState(0)

  // One key per distinct request (and reload), so a re-render with equal filters does not query again.
  const argumentos = authUserId ? JSON.stringify(argumentosLista(filtros, { authId: authUserId, campusId, limite })) : null
  const clave = argumentos ? `${version}:${argumentos}` : null

  useEffect(() => {
    if (!clave || !argumentos) return
    // A newer request drops the answer of this one.
    let vigente = true
    supabase
      .rpc('listar_usuarios_con_permisos_v2', JSON.parse(argumentos))
      .then(({ data, error: errorRpc }) => {
        if (!vigente) return
        if (errorRpc) throw errorRpc
        const filas = (data ?? []) as unknown as FilaUsuarioRpc[]
        setRespuesta({ clave, personas: aPersonas(filas), total: filas.length > 0 ? Number(filas[0].total_count) || 0 : 0, error: null })
      })
      .then(undefined, (fallo: unknown) => {
        if (!vigente) return
        const mensaje = mensajeDe(fallo, 'No se pudo cargar la lista de personas.')
        setRespuesta({ clave, personas: [], total: 0, error: mensaje })
        notificar.error(mensaje)
      })
    return () => {
      vigente = false
    }
  }, [clave, argumentos, supabase, notificar])

  useEffect(() => {
    if (!authUserId) return
    let vigente = true
    supabase
      .rpc('obtener_estadisticas_usuarios_con_permisos_v2', argumentosEstadisticas({ authId: authUserId, campusId }))
      .then(({ data, error: errorRpc }) => {
        if (!vigente) return
        if (errorRpc) {
          // The list still works without the numbers; they stay hidden.
          console.error('Error cargando estadísticas de usuarios:', errorRpc.message)
          return
        }
        setEstadisticas(aEstadisticas((data ?? [])[0]))
      })
    return () => {
      vigente = false
    }
  }, [authUserId, campusId, version, supabase])

  const recargar = useCallback(() => setVersion((v) => v + 1), [])

  // The previous rows stay while the next answer loads; the list shows skeleton rows meanwhile.
  const cargando = clave === null || respuesta?.clave !== clave
  return {
    personas: respuesta?.personas ?? [],
    total: respuesta?.total ?? 0,
    estadisticas,
    cargando,
    error: cargando ? null : (respuesta?.error ?? null),
    recargar,
  }
}
