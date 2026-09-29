'use client'

/**
 * Servidores — the etapa counters. They are filters: each one is an
 * `aria-pressed` button, a second tap removes the filter, and the numbers
 * already account for every other filter (see `contadoresEtapa` in
 * lib/platform/dream-team/servidores-vista.ts). On phones the row scrolls
 * horizontally instead of wrapping.
 */
import type { ReactElement } from 'react'

import { ESTADO_LABELS } from '@/components/dream-team/labels'
import { cn } from '@/lib/utils'
import { DREAM_TEAM_ESTADOS, type DreamTeamEstado } from '@/lib/platform/dream-team/types'
import type { VistaServidores } from '@/lib/platform/dream-team/servidores-vista'

export const ANILLO =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export interface ContadoresEtapaProps {
  readonly contadores: VistaServidores['contadoresEtapa']
  readonly etapa: DreamTeamEstado | null
  readonly onEtapaChange: (etapa: DreamTeamEstado | null) => void
}

export function ContadoresEtapa({ contadores, etapa, onEtapaChange }: ContadoresEtapaProps): ReactElement {
  const opciones: ReadonlyArray<{ readonly valor: DreamTeamEstado | null; readonly etiqueta: string; readonly cantidad: number }> = [
    { valor: null, etiqueta: 'Todas', cantidad: contadores.todas },
    ...DREAM_TEAM_ESTADOS.map((estado) => ({
      valor: estado,
      etiqueta: ESTADO_LABELS[estado],
      cantidad: contadores.porEtapa[estado],
    })),
  ]

  return (
    <div
      role="group"
      aria-label="Filtrar por etapa"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0"
    >
      {opciones.map(({ valor, etiqueta, cantidad }) => {
        const activa = etapa === valor
        return (
          <button
            key={valor ?? 'todas'}
            type="button"
            aria-pressed={activa}
            // A second tap on the active etapa removes the filter.
            onClick={() => onEtapaChange(activa ? null : valor)}
            className={cn(
              'flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors',
              activa
                ? 'border-[var(--brand-primary)] bg-[var(--brand-accent-strong)] text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              ANILLO,
            )}
          >
            <span>{etiqueta}</span>
            <span className="tabular-nums font-semibold text-foreground">{cantidad}</span>
          </button>
        )
      })}
    </div>
  )
}
