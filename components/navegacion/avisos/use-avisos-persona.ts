"use client"

/**
 * The signed-in person's in-app notices for the bell (avisos_persona through
 * `mis_avisos()`, owner-only by RLS). Loads after mount, again when the
 * window regains focus and every two minutes, never blocking the shell; a
 * failed load keeps the last list. Marking read is optimistic and survives
 * a load that was already in flight.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  cargarMisAvisos,
  contarNoLeidos,
  marcarAvisoLeido,
  type AvisoPersona,
  type ClienteAvisos,
} from '@/lib/platform/avisos/avisos-persona'
import { createClient } from '@/lib/supabase/client'

const INTERVALO_MS = 2 * 60 * 1000

export type EstadoAvisos = 'cargando' | 'listo' | 'error'

export interface AvisosPersona {
  readonly avisos: readonly AvisoPersona[]
  readonly noLeidas: number
  readonly estado: EstadoAvisos
  readonly recargar: () => Promise<void>
  readonly marcarLeido: (id: string) => Promise<void>
  readonly marcarTodos: () => Promise<void>
}

/**
 * `activo = false` reads nothing (the caller passes its own list).
 * `fuente` replaces the browser Supabase client (tests).
 */
export function useAvisosPersona({ activo = true, fuente }: { activo?: boolean; fuente?: ClienteAvisos } = {}): AvisosPersona {
  const [avisos, setAvisos] = useState<readonly AvisoPersona[]>([])
  const [estado, setEstado] = useState<EstadoAvisos>('cargando')
  const clienteRef = useRef<ClienteAvisos | null>(fuente ?? null)
  const montado = useRef(true)
  const marcados = useRef(new Set<string>())

  // Null when the browser client cannot be built (no Supabase config): then
  // there is no source and the bell shows its empty state.
  const cliente = useCallback((): ClienteAvisos | null => {
    if (!clienteRef.current) {
      try {
        clienteRef.current = createClient() as unknown as ClienteAvisos
      } catch {
        return null
      }
    }
    return clienteRef.current
  }, [])

  const recargar = useCallback(async () => {
    const fuenteActual = cliente()
    if (!fuenteActual) {
      // No source: settle at once as an empty list, so the bell never shows
      // a skeleton for something that will not load.
      setEstado('listo')
      return
    }
    try {
      const lista = await cargarMisAvisos(fuenteActual)
      if (!montado.current) return
      setAvisos(lista.map((aviso) => (marcados.current.has(aviso.id) ? { ...aviso, leido: true } : aviso)))
      setEstado('listo')
    } catch {
      if (montado.current) setEstado((actual) => (actual === 'listo' ? actual : 'error'))
    }
  }, [cliente])

  useEffect(() => {
    montado.current = true
    if (!activo) return () => { montado.current = false }
    // Loading from an external source; only the no-source branch sets state synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recargar()
    const alVolver = () => void recargar()
    window.addEventListener('focus', alVolver)
    const intervalo = window.setInterval(alVolver, INTERVALO_MS)
    return () => {
      montado.current = false
      window.removeEventListener('focus', alVolver)
      window.clearInterval(intervalo)
    }
  }, [activo, recargar])

  const marcarLeido = useCallback(
    async (id: string) => {
      marcados.current.add(id)
      setAvisos((lista) => lista.map((aviso) => (aviso.id === id ? { ...aviso, leido: true } : aviso)))
      const fuenteActual = cliente()
      if (!fuenteActual) return
      try {
        await marcarAvisoLeido(fuenteActual, id)
      } catch {
        // The next load shows the real state.
      }
    },
    [cliente],
  )

  const marcarTodos = useCallback(async () => {
    const ids = avisos.filter((aviso) => !aviso.leido).map((aviso) => aviso.id)
    await Promise.all(ids.map((id) => marcarLeido(id)))
  }, [avisos, marcarLeido])

  return { avisos, noLeidas: contarNoLeidos(avisos), estado, recargar, marcarLeido, marcarTodos }
}
