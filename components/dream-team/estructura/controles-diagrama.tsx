'use client'

/**
 * Estructura — the floating controls of the desktop org chart (S12; prototype
 * `.lz-zoom` and `.lz-ley`): zoom out, the percentage, zoom in, "Ajustar",
 * "Expandir todo" and "Contraer" on the right; the legend of the health dots
 * and of the dashed (inactive) box on the left. Below lg both would collide,
 * so the legend leaves the canvas and sits under it (`flotante={false}`).
 */
import type { ReactElement } from 'react'
import { Minus, Plus } from 'lucide-react'

import { FONDO_TONO } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { PROBLEMAS_ESTRUCTURA } from '@/lib/platform/dream-team/estructura-organigrama'
import { cn } from '@/lib/utils'

const FLOTANTE = 'absolute bottom-3 z-[2] flex items-center rounded-xl border border-border bg-card'

export interface ControlesDiagramaProps {
  readonly zoom: number
  readonly minimo: number
  readonly maximo: number
  readonly onZoom: (paso: number | 'ajustar') => void
  readonly onExpandirTodo: () => void
  readonly onContraer: () => void
}

export function ControlesDiagrama({ zoom, minimo, maximo, onZoom, onExpandirTodo, onContraer }: ControlesDiagramaProps): ReactElement {
  return (
    <div role="group" aria-label="Zoom y ramas" className={cn(FLOTANTE, 'right-3 gap-0.5 p-1 shadow-sheet')}>
      <BotonSistema type="button" variante="ghost" soloIcono icono={Minus} aria-label="Alejar" disabled={zoom <= minimo} onClick={() => onZoom(-0.1)} />
      <span aria-live="polite" className="min-w-[52px] text-center font-mono text-[13px] tabular-nums text-muted-foreground">
        {Math.round(zoom * 100)} %
      </span>
      <BotonSistema type="button" variante="ghost" soloIcono icono={Plus} aria-label="Acercar" disabled={zoom >= maximo} onClick={() => onZoom(0.1)} />
      <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
      <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => onZoom('ajustar')}>
        Ajustar
      </BotonSistema>
      <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={onExpandirTodo}>
        Expandir todo
      </BotonSistema>
      <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={onContraer}>
        Contraer
      </BotonSistema>
    </div>
  )
}

export function LeyendaDiagrama({ flotante = true, className }: { readonly flotante?: boolean; readonly className?: string }): ReactElement {
  return (
    <ul
      aria-label="Leyenda"
      className={cn(
        'flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-muted-foreground',
        flotante ? cn(FLOTANTE, 'left-3 px-3 py-2') : 'border-t border-border px-3.5 py-2.5',
        className,
      )}
    >
      {PROBLEMAS_ESTRUCTURA.filter((problema) => problema.id !== 'inactivo').map((problema) => (
        <li key={problema.id} className="inline-flex items-center gap-2">
          <span aria-hidden="true" className={cn('size-[7px] rounded-full', FONDO_TONO[problema.tono])} />
          {problema.label}
        </li>
      ))}
      <li className="inline-flex items-center gap-2">
        <span aria-hidden="true" className="h-2.5 w-3.5 rounded-[3px] border border-dashed border-muted-foreground" />
        Inactivo
      </li>
    </ul>
  )
}
