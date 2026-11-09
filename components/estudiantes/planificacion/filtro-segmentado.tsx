'use client'

/**
 * Estudiantes — the segmented filter with counts of the toolbar ("Todos 15 ·
 * Sin marcar 3 · …"): gap EA5 of design/estudiantes-dps/README-tanda-a.md,
 * the `ControlSegmentado` frame and pressed state (components/ui/
 * control-segmentado.tsx) with a mono count per segment. From md one line of
 * 30px segments (40px to the touch); on a phone it fills the width and each
 * segment takes two lines (label, count), 44px, so five fit at 360px.
 */
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

export interface OpcionFiltroSegmentado<T extends string> {
  readonly valor: T
  readonly etiqueta: string
  readonly cuenta: number
}

export interface FiltroSegmentadoProps<T extends string> {
  /** Accessible name of the group ("Mostrar"). */
  readonly etiqueta: string
  readonly opciones: readonly OpcionFiltroSegmentado<T>[]
  readonly valor: T
  readonly onCambio: (valor: T) => void
  readonly className?: string
}

export function FiltroSegmentado<T extends string>({ etiqueta, opciones, valor, onCambio, className }: FiltroSegmentadoProps<T>): ReactElement {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className={cn('grid w-full auto-cols-fr grid-flow-col gap-0.5 rounded-xl border border-border bg-card p-[3px] md:inline-flex md:w-auto md:max-w-full', className)}
    >
      {opciones.map((opcion) => {
        const pulsado = opcion.valor === valor
        return (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={pulsado}
            onClick={() => onCambio(opcion.valor)}
            className={cn(
              'focus-ring flex min-h-11 min-w-0 touch-manipulation flex-col items-center justify-center rounded-md px-1 text-[13px] font-medium leading-tight transition-colors',
              'md:min-h-[30px] md:flex-row md:gap-1.5 md:whitespace-nowrap md:px-3 md:text-sm md:pointer-coarse:min-h-10',
              pulsado ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="max-w-full truncate">{opcion.etiqueta}</span>{' '}
            <span className="font-mono text-xs tabular-nums opacity-80">{opcion.cuenta}</span>
          </button>
        )
      })}
    </div>
  )
}
