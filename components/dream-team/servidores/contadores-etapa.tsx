'use client'

/**
 * Servidores — the etapa counters. They are filters: each one is an
 * `aria-pressed` button, a second tap removes the filter, and the numbers
 * already account for every other filter (see `contadoresEtapa` in
 * lib/platform/dream-team/servidores-vista.ts). They are the shared count
 * pills (components/ui/PastillasFiltro), like every list refinement.
 */
import type { ReactElement } from 'react'

import { ESTADO_LABELS } from '@/components/dream-team/labels'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
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
    <GrupoPastillas etiqueta="Filtrar por etapa">
      {opciones.map(({ valor, etiqueta, cantidad }) => {
        const activa = etapa === valor
        return (
          <PastillaFiltro
            key={valor ?? 'todas'}
            etiqueta={etiqueta}
            cantidad={cantidad}
            activa={activa}
            // A second tap on the active etapa removes the filter.
            onClick={() => onEtapaChange(activa ? null : valor)}
          />
        )
      })}
    </GrupoPastillas>
  )
}
