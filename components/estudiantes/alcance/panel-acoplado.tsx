'use client'

/**
 * Estudiantes — `PanelAcoplado`, the detail panel docked from 1280px (gap B4
 * of design/estudiantes-dps/README-tanda-b.md, decided in S7 / D3; `.drw`
 * with `body.dock` of artboards 11, 13 and 15).
 *
 * From 1280px the panel sits fixed at the right under the desktop header,
 * 480px (640px with `ancho="lg"`), and the view leaves it room
 * (`MarcoAlcance panel`) instead of being covered: the chosen row stays in
 * sight and marked, and another row opens in the same panel without
 * closing it. It is not modal: no scrim, no focus trap; it takes the focus
 * on its title when it opens, `Escape` inside closes it and the focus goes
 * back where it was. Its header carries a small context line, the title,
 * a description and «Cerrar»; the footer holds the actions.
 *
 * Below 1280px it is `DetalleResponsivo` as before (overlay side panel from
 * md, bottom sheet on phones), with the context line over the description.
 */
import { useEffect, useId, useRef, useSyncExternalStore, type ReactElement, type ReactNode } from 'react'
import { X } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { cn } from '@/lib/utils'

import type { AnchoPanel } from './marco-alcance'

const CONSULTA_ACOPLADO = '(min-width: 1280px)'

function suscribir(avisar: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const consulta = window.matchMedia(CONSULTA_ACOPLADO)
  consulta.addEventListener?.('change', avisar)
  return () => consulta.removeEventListener?.('change', avisar)
}

// Without matchMedia (old browsers, tests) the panel overlays, as before.
const leerAcoplado = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA_ACOPLADO).matches
const leerEnServidor = (): boolean => false

/** Whether the viewport is 1280px or wider, following resizes; `false` on the server. */
export function useAcoplado(): boolean {
  return useSyncExternalStore(suscribir, leerAcoplado, leerEnServidor)
}

export interface PanelAcopladoProps {
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly titulo: string
  /** The small context line over the title ("Transit · Grupos de Chicas"). */
  readonly contexto?: ReactNode
  readonly descripcion?: ReactNode
  readonly pie?: ReactNode
  readonly ancho?: AnchoPanel
  readonly children: ReactNode
}

function Acoplado({ onCambioAbierto, titulo, contexto, descripcion, pie, ancho = 'md', children }: Omit<PanelAcopladoProps, 'abierto'>): ReactElement {
  const id = useId()
  const tituloRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    tituloRef.current?.focus({ preventScroll: true })
    return () => {
      if (previo?.isConnected) previo.focus({ preventScroll: true })
    }
  }, [])

  return (
    <aside
      aria-labelledby={id}
      data-testid="panel-acoplado"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          e.stopPropagation()
          onCambioAbierto(false)
        }
      }}
      className={cn('fixed top-16 right-0 bottom-0 z-30 flex flex-col border-l border-border bg-card', ancho === 'lg' ? 'w-[640px]' : 'w-[480px]')}
    >
      <div className="flex items-start gap-2 border-b border-border py-3.5 pr-3 pl-5">
        <div className="min-w-0 flex-1">
          {contexto && <p className="truncate text-xs text-muted-foreground">{contexto}</p>}
          <h2 id={id} ref={tituloRef} tabIndex={-1} className="mt-0.5 text-lg leading-tight font-[650] tracking-[-0.01em] text-foreground focus:outline-none">
            {titulo}
          </h2>
          {descripcion && <div className="mt-0.5 text-[13px] text-muted-foreground">{descripcion}</div>}
        </div>
        <BotonSistema type="button" variante="ghost" tamaño="sm" soloIcono icono={X} aria-label="Cerrar" onClick={() => onCambioAbierto(false)} />
      </div>
      <div className="@container min-h-0 flex-1 overflow-y-auto px-5 pt-3.5 pb-5">{children}</div>
      {pie && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{pie}</div>}
    </aside>
  )
}

export function PanelAcoplado({ abierto, onCambioAbierto, titulo, contexto, descripcion, pie, ancho = 'md', children }: PanelAcopladoProps): ReactElement | null {
  const acoplado = useAcoplado()
  if (acoplado) {
    if (!abierto) return null
    return (
      <Acoplado onCambioAbierto={onCambioAbierto} titulo={titulo} contexto={contexto} descripcion={descripcion} pie={pie} ancho={ancho}>
        {children}
      </Acoplado>
    )
  }
  const linea =
    contexto && descripcion ? (
      <>
        <span className="block">{contexto}</span>
        <span className="block">{descripcion}</span>
      </>
    ) : (
      (contexto ?? descripcion)
    )
  return (
    <DetalleResponsivo abierto={abierto} onCambioAbierto={onCambioAbierto} titulo={titulo} descripcion={linea} pie={pie} ancho={ancho}>
      {children}
    </DetalleResponsivo>
  )
}
