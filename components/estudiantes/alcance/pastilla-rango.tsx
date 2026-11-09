'use client'

/**
 * Estudiantes — `PastillaRango`, the date range of Reportes in the header
 * band (gap B3 of design/estudiantes-dps/README-tanda-b.md, decided in S7 /
 * D7; `.rp` and `.pop` of artboard 15). The date pill look (planned
 * `PastillaFecha`: `rounded-full` border on `bg-background`, 13px / 500,
 * 36px, 44px on touch) with the range always in sight: «Últimas 8 semanas ·
 * 14 sep – 8 nov ▾». It opens a popover (`dialog` «Rango de fechas») with
 * the quick ranges (`aria-pressed`, the current one in brand text) and
 * «Elegir fechas» (`children`: the Desde / Hasta fields of the caller).
 * Picking a quick range closes it; `Escape` closes it and returns the focus.
 */
import { useState, type ReactElement, type ReactNode } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface OpcionRango {
  readonly clave: string
  readonly etiqueta: string
  /** "14 sep – 8 nov". */
  readonly fechas: string
}

export interface PastillaRangoProps {
  /** "Últimas 8 semanas", or "Elegir fechas" for a custom range. */
  readonly etiqueta: string
  readonly fechas: string
  readonly opciones: readonly OpcionRango[]
  /** The quick range in use; `null` for a custom one. */
  readonly actual: string | null
  readonly onElegir: (clave: string) => void
  /** «Elegir fechas»: the Desde / Hasta fields. */
  readonly children: ReactNode
}

const CLASE_TITULO = 'px-1 pt-0.5 pb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground'

export function PastillaRango({ etiqueta, fechas, opciones, actual, onElegir, children }: PastillaRangoProps): ReactElement {
  const [abierto, setAbierto] = useState(false)
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-accent pointer-coarse:min-h-11"
        >
          <CalendarDays aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span>
            {etiqueta} <span className="font-normal text-muted-foreground">· {fechas}</span>
          </span>
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Rango de fechas" className="w-[300px] max-w-[calc(100vw-32px)] bg-card p-2.5 shadow-sheet">
        <h3 className={CLASE_TITULO}>Rango</h3>
        <div role="group" aria-label="Rangos rápidos">
          {opciones.map((o) => {
            const activa = o.clave === actual
            return (
              <button
                key={o.clave}
                type="button"
                aria-pressed={activa}
                onClick={() => {
                  setAbierto(false)
                  if (!activa) onElegir(o.clave)
                }}
                className={cn(
                  'focus-ring flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent pointer-coarse:min-h-11',
                  activa ? 'font-semibold text-brand-text' : 'text-foreground',
                )}
              >
                {o.etiqueta}
                <small className="text-xs font-normal text-muted-foreground">{o.fechas}</small>
              </button>
            )
          })}
        </div>
        <hr className="my-2 border-border" />
        <h3 className={CLASE_TITULO}>Elegir fechas</h3>
        {children}
      </PopoverContent>
    </Popover>
  )
}
