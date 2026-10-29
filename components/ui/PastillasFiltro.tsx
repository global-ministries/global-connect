'use client'

/**
 * Count pills that refine a list: etapa, "Sin cuenta", "En varios equipos".
 * They sit one level below the KPI filter cards (components/ui/TarjetasFiltro):
 * the cards choose WHERE to look (dirección, área, equipo), the pills narrow
 * WHAT is shown. One look everywhere — label, then the count in bold — and the
 * pressed pill uses the same brand tint (`bg-brand-tint`) as a selected card.
 *
 * Without `cantidad` (chips whose counts are not loaded, quick ranges) the
 * pill shows only its label, with the same look. With `tono` a status dot
 * (`PuntoEstado`, decorative) goes before the label, e.g. the Estructura
 * problem pills; the accessible name stays the label and the count.
 *
 * `GrupoPastillas` lays them out: a horizontally scrollable row on phones,
 * wrapping from `md` up. Each caller keeps its own rule (single choice, a
 * second tap clears, independent toggles) in `onClick`.
 */
import type { ReactElement, ReactNode } from 'react'

import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { cn } from '@/lib/utils'

const ANILLO =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export interface PastillaFiltroProps {
  readonly etiqueta: string
  /** Omitted when there is nothing to count: the pill shows only the label. */
  readonly cantidad?: number
  readonly activa: boolean
  readonly onClick: () => void
  /** Optional status dot before the label; none when absent. */
  readonly tono?: TonoEstado
}

export function PastillaFiltro({ etiqueta, cantidad, activa, onClick, tono }: PastillaFiltroProps): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onClick}
      className={cn(
        'flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-[1.5px] px-4 text-sm font-medium transition-colors',
        activa
          ? 'border-brand bg-brand-tint text-foreground'
          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
        ANILLO,
      )}
    >
      {tono && (
        <span aria-hidden="true" className="inline-flex">
          <PuntoEstado tono={tono} />
        </span>
      )}
      <span>{etiqueta}</span>
      {cantidad !== undefined && <span className="font-semibold tabular-nums text-foreground">{cantidad}</span>}
    </button>
  )
}

export interface GrupoPastillasProps {
  /** Accessible name of the group, e.g. "Filtrar por etapa". */
  readonly etiqueta: string
  readonly children: ReactNode
  readonly className?: string
}

export function GrupoPastillas({ etiqueta, children, className }: GrupoPastillasProps): ReactElement {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className={cn('-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0', className)}
    >
      {children}
    </div>
  )
}
