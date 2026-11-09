'use client'

/**
 * Niños › Check-in — the print station of this desk (odd/tasks/ninos-checkin-pco.md,
 * T3b, S10 "Laptop de la mesa con el agente"; artboard 05, the printer pill).
 * Reads the stations the caller may print to (ninos_impresion_estaciones, as
 * the user), keeps the active ones of the desk's campuses, and remembers the
 * chosen one on this device per campus (localStorage). The list refreshes
 * while the page is visible so the connection status follows the agent. A
 * failed read means "no stations": the desk works exactly as before.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  avisoEstacionMesa,
  claveEstacionMesa,
  guardarEstacionMesa,
  leerEstacionMesa,
  leerEstaciones,
  type EstacionVista,
} from '@/lib/platform/ninos/impresion-vista'
import { createClient } from '@/lib/supabase/client'

import { useRefrescoVisible } from '../use-refresco'

const almacen = (): Storage | null => (typeof window === 'undefined' ? null : window.localStorage)

export interface EstacionMesa {
  /** Active stations of the desk's campuses; empty = no printing here (show nothing). */
  readonly estaciones: readonly EstacionVista[]
  readonly elegida: EstacionVista | null
  readonly elegir: (estacionId: string | null) => void
  /** The small notice («… el código queda en pantalla»), or null. */
  readonly aviso: string | null
}

/** `campusIds`: the campuses of the desk's salones; empty = every campus the caller operates. */
export function useEstacionMesa(campusIds: readonly string[]): EstacionMesa {
  const clave = useMemo(() => claveEstacionMesa(campusIds), [campusIds])
  const [todas, setTodas] = useState<EstacionVista[]>([])
  const [elegidaId, setElegidaId] = useState<string | null>(null)
  const [ahora, setAhora] = useState(() => new Date())

  const cargar = useCallback(async () => {
    try {
      const { data, error } = await (createClient() as unknown as SupabaseClient).rpc('ninos_impresion_estaciones', {})
      setTodas(error ? [] : leerEstaciones(data))
    } catch {
      setTodas([])
    }
    setAhora(new Date())
  }, [])

  useEffect(() => {
    setElegidaId(leerEstacionMesa(almacen(), clave))
  }, [clave])
  useEffect(() => {
    void cargar()
  }, [cargar])
  useRefrescoVisible(() => void cargar(), 30_000)

  const estaciones = useMemo(
    () => todas.filter((e) => e.activa && (campusIds.length === 0 || campusIds.includes(e.campusId))),
    [todas, campusIds],
  )
  const elegida = estaciones.find((e) => e.id === elegidaId) ?? null

  const elegir = useCallback(
    (estacionId: string | null) => {
      setElegidaId(estacionId)
      guardarEstacionMesa(almacen(), clave, estacionId)
    },
    [clave],
  )

  return { estaciones, elegida, elegir, aviso: avisoEstacionMesa(estaciones, elegida, ahora) }
}
