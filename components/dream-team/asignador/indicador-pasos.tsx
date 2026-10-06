'use client'

/** Dream Team — the step indicator at the top of the "Asignar servicio" panel. */
import type { ReactElement } from 'react'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'
import { PASOS, type Paso } from './logica'

export function IndicadorPasos({ actual }: { readonly actual: Paso }): ReactElement {
  return (
    <ol aria-label="Pasos" className="flex items-center gap-2">
      {PASOS.map(({ paso, titulo }, i) => {
        const hecho = paso < actual
        const activo = paso === actual
        return (
          <li
            key={paso}
            aria-current={activo ? 'step' : undefined}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                activo && 'border-primary bg-primary text-primary-foreground',
                hecho && 'border-primary bg-primary/10 text-primary',
                !activo && !hecho && 'border-border text-muted-foreground',
              )}
            >
              {hecho ? <Check className="size-3.5" aria-hidden="true" /> : paso}
            </span>
            <span
              className={cn(
                'truncate text-xs sm:text-sm',
                activo ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {titulo}
              {hecho && <span className="sr-only"> (completado)</span>}
            </span>
            {i < PASOS.length - 1 && <span aria-hidden="true" className="h-px min-w-3 flex-1 bg-border" />}
          </li>
        )
      })}
    </ol>
  )
}
