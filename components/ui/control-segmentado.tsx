'use client'

/**
 * ControlSegmentado — a 2–3 option switch, e.g. the "Por persona / Por
 * servicio" view (docs/design-system/components.md, "Segmented control";
 * prototype `.seg`). Decided 2026-10-26: plain buttons with `aria-pressed`
 * inside `role="group"`, the same model as the filter pills; `ui/toggle-group`
 * stays unused. The pressed segment inverts (`bg-foreground text-background`).
 *
 * Segments use the sm control height (36px) with a 44px touch target.
 */
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

export interface OpcionSegmento<T extends string> {
  readonly valor: T
  readonly etiqueta: string
}

export interface ControlSegmentadoProps<T extends string> {
  readonly opciones: readonly OpcionSegmento<T>[]
  readonly valor: T
  readonly onCambio: (valor: T) => void
  /** Accessible name of the group, e.g. "Vista". */
  readonly etiqueta: string
  readonly className?: string
}

export function ControlSegmentado<T extends string>({
  opciones,
  valor,
  onCambio,
  etiqueta,
  className,
}: ControlSegmentadoProps<T>): ReactElement {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className={cn('inline-flex rounded-xl border border-border bg-card p-[3px]', className)}
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
              'focus-ring min-h-9 rounded-md px-3 text-sm font-medium transition-colors pointer-coarse:min-h-11',
              pulsado ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opcion.etiqueta}
          </button>
        )
      })}
    </div>
  )
}
