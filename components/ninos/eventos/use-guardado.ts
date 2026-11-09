'use client'

/**
 * Niños › Eventos — the autosave state of the screen (docs/design-system/
 * patterns.md, "Inline edit and autosave"): every write goes through
 * `guardar`, which flips the toolbar status to "Guardando…" and then to
 * "Guardado" or to the RPC's sentence, announces one sentence in the polite
 * live region and reloads the server data.
 */
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

import type { Resultado } from '@/lib/platform/ninos/eventos'

export type EstadoGuardado = 'inactivo' | 'guardando' | 'guardado' | 'error'

export interface Guardado {
  readonly estado: EstadoGuardado
  /** The RPC's sentence of the last failed save. */
  readonly error: string | null
  /** The last sentence for the live region. */
  readonly aviso: string
  readonly guardar: <T>(accion: () => Promise<Resultado<T>>, exito: (data: T) => string) => Promise<Resultado<T>>
  readonly anunciar: (texto: string) => void
}

export function useGuardado(): Guardado {
  const router = useRouter()
  const [estado, setEstado] = useState<EstadoGuardado>('inactivo')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')

  const guardar = useCallback(
    async <T,>(accion: () => Promise<Resultado<T>>, exito: (data: T) => string): Promise<Resultado<T>> => {
      setEstado('guardando')
      setError(null)
      const r = await accion()
      if (r.ok) {
        setEstado('guardado')
        setAviso(exito(r.data))
        router.refresh()
      } else {
        setEstado('error')
        setError(r.message)
        setAviso(r.message)
      }
      return r
    },
    [router],
  )

  return { estado, error, aviso, guardar, anunciar: setAviso }
}
