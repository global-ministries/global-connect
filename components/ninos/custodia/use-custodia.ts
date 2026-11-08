'use client'

/**
 * Niños › Custodia — the active restrictions of the children on screen
 * (odd/tasks/ninos-checkin-pco.md, T2e, S9.2), for the alerts at the desk,
 * the salón and the pickup. Asks ninos_custodia_de again when the set of
 * children changes; {} while loading, on error or without children (the
 * pickup is refused by the database anyway).
 */
import { useEffect, useState } from 'react'

import { cargarCustodiaDe, type CustodiaPorNino } from '@/lib/platform/ninos/custodia'
import { createClient } from '@/lib/supabase/client'

const VACIO: CustodiaPorNino = {}

export function useCustodia(ninoIds: readonly string[]): CustodiaPorNino {
  const clave = [...new Set(ninoIds)].sort().join(',')
  const [custodia, setCustodia] = useState<{ clave: string; datos: CustodiaPorNino }>({ clave: '', datos: VACIO })

  useEffect(() => {
    if (!clave) return
    let vigente = true
    void cargarCustodiaDe(createClient(), clave.split(',')).then((datos) => {
      if (vigente) setCustodia({ clave, datos })
    })
    return () => {
      vigente = false
    }
  }, [clave])

  return custodia.clave === clave ? custodia.datos : VACIO
}
