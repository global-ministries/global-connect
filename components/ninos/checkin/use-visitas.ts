'use client'

/**
 * Niños › Check-in — prior visits of the children on the desk (T2d, S9.3):
 * one ninos_es_visitante_lote call per batch of children not asked yet for
 * the service date. A failed call leaves them unknown (no badge, regular
 * quota) and lets a later batch ask again.
 */
import { useCallback, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { parseVisitas, type VisitasPrevias } from '@/lib/platform/ninos/mesa-reglas'
import { createClient } from '@/lib/supabase/client'

const SIN_VISITAS: VisitasPrevias = {}

export function useVisitas(fecha: string): { visitas: VisitasPrevias; cargar: (ninoIds: readonly string[]) => void } {
  const [leidas, setLeidas] = useState<{ fecha: string; porNino: VisitasPrevias }>({ fecha, porNino: SIN_VISITAS })
  const pedidos = useRef(new Set<string>())

  const cargar = useCallback(
    (ninoIds: readonly string[]) => {
      const nuevos = [...new Set(ninoIds)].filter((id) => !pedidos.current.has(`${fecha}:${id}`))
      if (nuevos.length === 0) return
      for (const id of nuevos) pedidos.current.add(`${fecha}:${id}`)
      // Not in database.types.ts yet (20261108150000): untyped client.
      const cliente = createClient() as unknown as SupabaseClient
      const olvidar = () => {
        for (const id of nuevos) pedidos.current.delete(`${fecha}:${id}`)
      }
      void Promise.resolve(cliente.rpc('ninos_es_visitante_lote', { p_nino_ids: nuevos, p_fecha: fecha })).then((r) => {
        if (!r || r.error) return olvidar()
        const porNino = parseVisitas(r.data)
        setLeidas((v) => ({ fecha, porNino: v.fecha === fecha ? { ...v.porNino, ...porNino } : porNino }))
      }, olvidar)
    },
    [fecha],
  )

  return { visitas: leidas.fecha === fecha ? leidas.porNino : SIN_VISITAS, cargar }
}
