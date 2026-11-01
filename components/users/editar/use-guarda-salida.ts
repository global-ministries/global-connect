'use client'

/**
 * Decision 9 of S14 (odd/tasks/sistema-diseno-v2.md): while the form has
 * unsaved changes, leaving asks "¿Descartar los cambios?" first. Covers every
 * in-app link (breadcrumbs, "‹ Ficha", sidebar, tab bar, Más) with one
 * capture-phase click listener, so the shell needs no change, plus
 * `beforeunload` for reloads, closing the tab and external addresses.
 * Buttons that leave on their own (Cancelar) call `pedirSalida`.
 */
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

/** Where a confirmed exit goes: an internal path, or an action (discard in place). */
export type DestinoSalida = string | (() => void)

/** The internal path an anchor click would open, or null when the click is not a plain in-app navigation. */
export function rutaInterna(evento: MouseEvent, origen: string): string | null {
  if (evento.defaultPrevented || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return null
  const ancla = (evento.target as Element | null)?.closest?.('a[href]')
  if (!(ancla instanceof HTMLAnchorElement)) return null
  if ((ancla.target && ancla.target !== '_self') || ancla.hasAttribute('download')) return null
  const url = new URL(ancla.href, origen)
  if (url.origin !== origen) return null
  const actual = new URL(window.location.href)
  // Same page, only a hash: not a navigation.
  if (url.pathname === actual.pathname && url.search === actual.search) return null
  return `${url.pathname}${url.search}${url.hash}`
}

export function useGuardaSalida(conCambios: boolean) {
  const router = useRouter()
  const [pendiente, setPendiente] = useState<DestinoSalida | null>(null)

  useEffect(() => {
    if (!conCambios) return
    const antesDeSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    const alHacerClic = (e: MouseEvent) => {
      const ruta = rutaInterna(e, window.location.origin)
      if (!ruta) return
      e.preventDefault()
      e.stopPropagation()
      setPendiente(ruta)
    }
    window.addEventListener('beforeunload', antesDeSalir)
    document.addEventListener('click', alHacerClic, true)
    return () => {
      window.removeEventListener('beforeunload', antesDeSalir)
      document.removeEventListener('click', alHacerClic, true)
    }
  }, [conCambios])

  /** Leaves at once without changes; asks first with changes. */
  const pedirSalida = useCallback(
    (destino: DestinoSalida) => {
      if (!conCambios) {
        if (typeof destino === 'string') router.push(destino)
        else destino()
        return
      }
      setPendiente(() => destino)
    },
    [conCambios, router],
  )

  const descartar = useCallback(() => {
    const destino = pendiente
    setPendiente(null)
    if (destino === null) return
    if (typeof destino === 'string') router.push(destino)
    else destino()
  }, [pendiente, router])

  const seguirEditando = useCallback(() => setPendiente(null), [])

  return { preguntando: pendiente !== null, pedirSalida, descartar, seguirEditando }
}
