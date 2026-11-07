'use client'

/**
 * Planner — the session draft in localStorage (S24 of
 * odd/tasks/planner-gdv.md): one draft per user and season
 * (claveBorrador), so it survives a reload and follows the user across tabs
 * (the `storage` event). The text is parsed with leerBorrador
 * (lib/platform/grupos-vida/planner/borrador.ts): another version, season,
 * user or shape reads as an empty draft. When storage cannot be written
 * (private mode, quota) the draft still lives in this tab.
 *
 * Read through useSyncExternalStore: the server and the first client render
 * see an empty draft, then the stored one, with no hydration mismatch.
 */
import { useCallback, useSyncExternalStore } from 'react'

import { BORRADOR_VACIO, claveBorrador, leerBorrador, serializarBorrador, type Borrador } from '@/lib/platform/grupos-vida/planner/borrador'

const EVENTO = 'planner-gdv:borrador'

/** This tab's text for the keys whose last write to storage failed. */
const enPestana = new Map<string, string | null>()
/** The parsed draft of each key, reused while its text does not change (useSyncExternalStore needs a stable snapshot). */
const leidos = new Map<string, { readonly texto: string | null; readonly borrador: Borrador }>()

function leerTexto(clave: string): string | null {
  if (enPestana.has(clave)) return enPestana.get(clave) ?? null
  try {
    return window.localStorage.getItem(clave)
  } catch {
    return null
  }
}

function suscribir(aviso: () => void): () => void {
  window.addEventListener('storage', aviso)
  window.addEventListener(EVENTO, aviso)
  return () => {
    window.removeEventListener('storage', aviso)
    window.removeEventListener(EVENTO, aviso)
  }
}

const sinBorrador = (): Borrador => BORRADOR_VACIO

/** The stored draft of this user and season, and the function that replaces it (an empty draft removes it). */
export function useBorradorLocal(usuarioId: string, temporadaId: string): readonly [Borrador, (borrador: Borrador) => void] {
  const clave = claveBorrador(usuarioId, temporadaId)

  const leer = useCallback((): Borrador => {
    const texto = leerTexto(clave)
    const previo = leidos.get(clave)
    if (previo && previo.texto === texto) return previo.borrador
    const borrador = leerBorrador(texto, { usuarioId, temporadaId })
    leidos.set(clave, { texto, borrador })
    return borrador
  }, [clave, usuarioId, temporadaId])

  const borrador = useSyncExternalStore(suscribir, leer, sinBorrador)

  const escribir = useCallback(
    (siguiente: Borrador) => {
      const texto = siguiente.cambios.length > 0 ? serializarBorrador(siguiente, { usuarioId, temporadaId }) : null
      try {
        if (texto === null) window.localStorage.removeItem(clave)
        else window.localStorage.setItem(clave, texto)
        enPestana.delete(clave)
      } catch {
        enPestana.set(clave, texto)
      }
      leidos.set(clave, { texto, borrador: texto === null ? BORRADOR_VACIO : siguiente })
      window.dispatchEvent(new Event(EVENTO))
    },
    [clave, usuarioId, temporadaId],
  )

  return [borrador, escribir] as const
}
