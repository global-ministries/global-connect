"use client"

import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'

import { cn } from '@/lib/utils'
import { CLASE_CAPA_FLOTANTE } from '@/components/navegacion/estilos-navegacion'

/**
 * A non-modal floating panel anchored to a shell button (prototype
 * design/app-shell, `.fly` and `.pop`): the rail flyouts of the sidebar, the
 * account menu and the notifications popover.
 *
 * - On open, focus moves to the first link, field or button inside.
 * - Escape closes it and returns focus to the anchor.
 * - A pointer press outside the panel and its anchor, or focus moving out of
 *   it (Tab past the last item), closes it without moving focus.
 *
 * `posicion="riel"` is a fixed layer to the right of the sidebar, level with
 * the anchor (so the scrolling nav never clips it); `posicion="debajo"` drops
 * below the anchor, aligned to its right edge, inside the caller's `relative`
 * wrapper.
 */
export interface PanelFlotanteProps {
  readonly abierto: boolean
  /** Close request; the panel itself returns focus to the anchor on Escape. */
  readonly onCerrar: () => void
  readonly ancla: RefObject<HTMLElement | null>
  readonly id: string
  /** Accessible name of the panel (the prototype names a flyout "Submenú de <grupo>"). */
  readonly etiqueta?: string
  /** Id of a heading inside that names the panel, instead of `etiqueta`. */
  readonly etiquetadoPor?: string
  readonly posicion?: 'riel' | 'debajo'
  readonly className?: string
  readonly children: ReactNode
}

const SELECTOR_ENFOCABLE = 'a[href], select, input, button:not([disabled]), [tabindex]:not([tabindex="-1"])'
const MARGEN = 8

export function PanelFlotante({
  abierto,
  onCerrar,
  ancla,
  id,
  etiqueta,
  etiquetadoPor,
  posicion = 'debajo',
  className,
  children,
}: PanelFlotanteProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  // The latest close callback, so the listeners below do not re-subscribe on every render.
  const cerrarRef = useRef(onCerrar)
  useEffect(() => {
    cerrarRef.current = onCerrar
  })

  // Rail: beside the sidebar, level with the anchor, kept inside the viewport.
  useLayoutEffect(() => {
    if (!abierto || posicion !== 'riel') return
    const boton = ancla.current
    const panel = panelRef.current
    if (!boton || !panel) return
    const rectAncla = boton.getBoundingClientRect()
    const borde = boton.closest('[data-sidebar]')?.getBoundingClientRect().right ?? rectAncla.right
    const alto = panel.offsetHeight
    // Written straight to the element before paint: a state round trip would
    // leave the panel unpositioned when focus moves into it.
    panel.style.top = `${Math.max(MARGEN, Math.min(rectAncla.top - 6, window.innerHeight - alto - MARGEN))}px`
    panel.style.left = `${borde + MARGEN}px`
  }, [abierto, posicion, ancla])

  useEffect(() => {
    if (!abierto) return
    panelRef.current?.querySelector<HTMLElement>(SELECTOR_ENFOCABLE)?.focus()

    const alPulsarTecla = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return
      evento.preventDefault()
      cerrarRef.current()
      ancla.current?.focus()
    }
    const alPresionar = (evento: PointerEvent | MouseEvent) => {
      const objetivo = evento.target as Node
      if (panelRef.current?.contains(objetivo) || ancla.current?.contains(objetivo)) return
      cerrarRef.current()
    }
    document.addEventListener('keydown', alPulsarTecla)
    document.addEventListener('mousedown', alPresionar)
    return () => {
      document.removeEventListener('keydown', alPulsarTecla)
      document.removeEventListener('mousedown', alPresionar)
    }
  }, [abierto, ancla])

  if (!abierto) return null

  return (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={etiquetadoPor ? undefined : etiqueta}
      aria-labelledby={etiquetadoPor}
      onBlur={(evento) => {
        // Focus left for another element of the page (Tab past the end): close.
        const destino = evento.relatedTarget as Node | null
        if (!destino || panelRef.current?.contains(destino) || ancla.current?.contains(destino)) return
        cerrarRef.current()
      }}
      className={cn(
        CLASE_CAPA_FLOTANTE,
        'z-[85] animate-fade-in',
        posicion === 'riel' ? 'fixed min-w-[232px] max-w-[280px] p-1.5' : 'absolute right-0 top-full mt-2',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** The rail flyout: a group's title and its pages, beside the 64px sidebar. */
export function PanelFlotanteRiel({
  titulo,
  etiqueta,
  children,
  ...props
}: Omit<PanelFlotanteProps, 'posicion' | 'etiquetadoPor'> & { readonly titulo: string }) {
  return (
    <PanelFlotante {...props} posicion="riel" etiqueta={etiqueta ?? `Submenú de ${titulo}`}>
      <h2 className="px-2.5 pt-2 pb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {titulo}
      </h2>
      {children}
    </PanelFlotante>
  )
}
