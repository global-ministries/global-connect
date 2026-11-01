'use client'

/**
 * Niños › Check-in — the arrival queue of the selected service
 * (ninos_prechecks_pendientes, odd/tasks/ninos-precheck.md P3–P4): families
 * that said "Voy en camino" and QR pre-registrations that said "¿Vienen hoy?",
 * first notice on top. Read on mount, on service change, every 30 s while the
 * screen is visible and on `recargar` (after a check-in or a confirmed
 * pre-registration). A failed read keeps the last list: the table can always
 * search by hand.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Servicio } from '@/lib/platform/ninos/checkin'
import { ordenarCola, type ItemCola } from '@/lib/platform/ninos/checkin-vista'
import { parseLlegando, parsePreregistrosLlegando, type FamiliaLlegando, type PreregistroLlegando } from '@/lib/platform/ninos/precheck'
import { createClient } from '@/lib/supabase/client'

import { useRefrescoVisible } from '../use-refresco'

export function useColaLlegando(servicio: Servicio): { cola: ItemCola[]; recargar: () => Promise<void> } {
  const [familias, setFamilias] = useState<FamiliaLlegando[]>([])
  const [preregistros, setPreregistros] = useState<PreregistroLlegando[]>([])

  const recargar = useCallback(async () => {
    if (!servicio.turnoId) return
    const { data, error } = await createClient().rpc('ninos_prechecks_pendientes', {
      p_turno_id: servicio.turnoId,
      p_fecha: servicio.fecha,
    })
    if (!error) {
      setFamilias(parseLlegando(data))
      setPreregistros(parsePreregistrosLlegando(data))
    }
  }, [servicio])

  useEffect(() => {
    // Fetch on mount and on service change; state is set after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recargar()
  }, [recargar])
  useRefrescoVisible(() => void recargar(), 30_000)

  const cola = useMemo(() => (servicio.turnoId ? ordenarCola(familias, preregistros) : []), [servicio.turnoId, familias, preregistros])
  return { cola, recargar }
}
