'use client'

/**
 * Servidores — the active-filter pills: one per filter, each with an X that
 * removes it (and whatever depends on it), plus "Limpiar todo".
 */
import type { ReactElement } from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { FiltrosServidores, Pastilla } from '@/lib/platform/dream-team/servidores-vista'
import { ANILLO } from './contadores-etapa'

export interface PastillasFiltrosProps {
  readonly pastillas: readonly Pastilla[]
  readonly onQuitar: (parche: Partial<FiltrosServidores>) => void
  readonly onLimpiarTodo: () => void
}

export function PastillasFiltros({ pastillas, onQuitar, onLimpiarTodo }: PastillasFiltrosProps): ReactElement | null {
  if (pastillas.length === 0) return null
  return (
    <ul aria-label="Filtros activos" className="flex flex-wrap items-center gap-2">
      {pastillas.map((pastilla) => (
        <li key={pastilla.clave}>
          <button
            type="button"
            aria-label={pastilla.quitarEtiqueta}
            onClick={() => onQuitar(pastilla.parche)}
            className={cn(
              'flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-card/50 px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent',
              ANILLO,
            )}
          >
            <span>{pastilla.etiqueta}</span>
            <X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={onLimpiarTodo}
          className={cn(
            'min-h-[44px] rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            ANILLO,
          )}
        >
          Limpiar todo
        </button>
      </li>
    </ul>
  )
}
