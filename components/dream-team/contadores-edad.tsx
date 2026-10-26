'use client'

/**
 * Dream Team — the age metrics of the selected sub-area (D10): one count pill
 * per age range (components/ui/PastillasFiltro), used by Servidores and Mi
 * equipo. They are filters: each one is an `aria-pressed` button and a second
 * tap on the active range removes the filter. The numbers are distinct people
 * and already account for every other filter (see
 * lib/platform/dream-team/edad.ts).
 */
import type { ReactElement } from 'react'

import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { RANGOS_EDAD, RANGO_EDAD_LABELS, type ContadoresEdad as Contadores, type RangoEdad } from '@/lib/platform/dream-team/edad'

export interface ContadoresEdadProps {
  readonly contadores: Contadores
  readonly edad: RangoEdad | null
  readonly onEdadChange: (edad: RangoEdad | null) => void
}

export function ContadoresEdad({ contadores, edad, onEdadChange }: ContadoresEdadProps): ReactElement {
  return (
    <GrupoPastillas etiqueta="Filtrar por edad">
      {RANGOS_EDAD.map((rango) => {
        const activa = edad === rango
        return (
          <PastillaFiltro
            key={rango}
            etiqueta={RANGO_EDAD_LABELS[rango]}
            cantidad={contadores[rango]}
            activa={activa}
            onClick={() => onEdadChange(activa ? null : rango)}
          />
        )
      })}
    </GrupoPastillas>
  )
}
