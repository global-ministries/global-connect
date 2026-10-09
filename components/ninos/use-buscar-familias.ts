'use client'

import { useCallback, useState } from 'react'

import { mensajeDeErrorFamilia } from '@/lib/platform/ninos/familia'
import { agruparFamilias, parseFamilias, type FamiliaEncontrada } from '@/lib/platform/ninos/familias-vista'
import { createClient } from '@/lib/supabase/client'

/** The Familias search (ninos_buscar_familias), shared by Familias and Check-in. */
export function useBuscarFamilias() {
  const [q, setQ] = useState('')
  const [familias, setFamilias] = useState<FamiliaEncontrada[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)

  const buscar = useCallback(async (texto: string): Promise<FamiliaEncontrada[] | null> => {
    if (texto.trim().length < 2) return null
    setBuscando(true)
    setError(null)
    const { data, error: err } = await createClient().rpc('ninos_buscar_familias', { p_q: texto.trim() })
    setBuscando(false)
    if (err) {
      setError(mensajeDeErrorFamilia(err))
      setFamilias(null)
      return null
    }
    // One card per family even when both parents matched.
    const encontradas = agruparFamilias(parseFamilias(data))
    setFamilias(encontradas)
    return encontradas
  }, [])

  const limpiar = useCallback(() => {
    setQ('')
    setFamilias(null)
    setError(null)
  }, [])

  return { q, setQ, familias, error, setError, buscando, buscar, limpiar }
}
