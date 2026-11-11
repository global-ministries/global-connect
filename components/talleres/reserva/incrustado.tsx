'use client'

/**
 * The frame of the embedded reservation (T6, S2 S18; design/talleres-reserva/07):
 * shares the mode with the flow through context, sends its height to the
 * page that embeds it (public/embed.js resizes the card) and, inside the
 * modal, closes it with Esc or the close button. Messages carry only the
 * height or the close order, so they go to any parent origin.
 */
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'

import { MENSAJE_ALTO, MENSAJE_CERRAR, SIN_INCRUSTAR, type ModoIncrustado } from './modo-incrustado'

const ContextoIncrustado = createContext<ModoIncrustado>(SIN_INCRUSTAR)

export function useModoIncrustado(): ModoIncrustado {
  return useContext(ContextoIncrustado)
}

const enMarco = () => typeof window !== 'undefined' && window.parent !== window

/** Asks embed.js to close the modal; opened on its own (no parent), goes to the public page. */
export function cerrarIncrustado(paginaPublica: string) {
  if (enMarco()) window.parent.postMessage({ type: MENSAJE_CERRAR }, '*')
  else window.location.assign(paginaPublica)
}

export function MarcoIncrustado({ modo, paginaPublica, children }: { modo: ModoIncrustado; paginaPublica: string; children: ReactNode }) {
  const marco = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = marco.current
    if (!el || !enMarco()) return
    let ultimo = -1
    const enviar = () => {
      const alto = Math.ceil(el.getBoundingClientRect().height)
      if (alto === ultimo) return
      ultimo = alto
      window.parent.postMessage({ type: MENSAJE_ALTO, height: alto }, '*')
    }
    enviar()
    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(enviar)
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  useEffect(() => {
    if (!modo.modal) return
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) cerrarIncrustado(paginaPublica)
    }
    document.addEventListener('keydown', alTeclado)
    return () => document.removeEventListener('keydown', alTeclado)
  }, [modo.modal, paginaPublica])

  return (
    <ContextoIncrustado.Provider value={modo}>
      {/* The card sits on the church site: its page shows through around it.
          A color-scheme other than the site's would make the browser paint
          the iframe opaque, so the page keeps the default one. */}
      {!modo.modal && <style>{'html,body{background:transparent}html{color-scheme:normal!important}'}</style>}
      <div ref={marco} className={modo.modal ? 'min-h-dvh bg-card' : 'p-px'}>
        {children}
      </div>
    </ContextoIncrustado.Provider>
  )
}

/** For the loading screens, which get no searchParams: the embedded one has no public header. */
export function SegunIncrustado({ normal, incrustado }: { normal: ReactNode; incrustado: ReactNode }) {
  return useSearchParams()?.get('embed') === '1' ? incrustado : normal
}
