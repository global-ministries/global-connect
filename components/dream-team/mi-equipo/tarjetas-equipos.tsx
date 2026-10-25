'use client'

/**
 * Mi equipo — the team picker: one level of the dirección's tree ("Toda la
 * dirección" or "Todo <área>" plus a card per child), rendered by the shared
 * KPI filter cards (components/ui/TarjetasFiltro), with a way back up once an
 * área was entered. This file only maps the Mi equipo view model onto them.
 */
import type { ReactElement } from 'react'
import { ChevronLeft } from 'lucide-react'

import { TarjetasFiltro, type TarjetaFiltro } from '@/components/ui/TarjetasFiltro'
import type { NivelEquipos, ResponsableVista, TarjetaEquipo } from '@/lib/platform/dream-team/mi-equipo-vista'

export interface TarjetasEquiposProps {
  readonly nivel: NivelEquipos
  readonly seleccionadoId: string
  readonly onSeleccionar: (equipoId: string) => void
  /** Goes back to `nivel.padre`. */
  readonly onVolver: () => void
}

const PERSONAS = { singular: 'persona', plural: 'personas' } as const

function lineaResponsable(responsable: ResponsableVista | null): string | null {
  if (!responsable) return null
  return `${responsable.rol === 'coordinador' ? 'Coordina' : 'Dirige'} ${responsable.nombre}`
}

function aTarjeta(equipo: TarjetaEquipo): TarjetaFiltro {
  return {
    id: equipo.id,
    label: equipo.label,
    subtitulo: lineaResponsable(equipo.responsable),
    total: equipo.total,
    badge: equipo.porActivar > 0 ? `${equipo.porActivar} por activar` : null,
  }
}

export function TarjetasEquipos({ nivel, seleccionadoId, onSeleccionar, onVolver }: TarjetasEquiposProps): ReactElement {
  const tarjetas = (
    <TarjetasFiltro
      todas={aTarjeta(nivel.todas)}
      items={nivel.equipos.map(aTarjeta)}
      modoCompacto={nivel.modoCompacto}
      seleccionadoId={seleccionadoId}
      onSeleccionar={onSeleccionar}
      unidad={PERSONAS}
      etiqueta="Equipos"
      buscarEtiqueta="Buscar equipo"
    />
  )
  if (!nivel.padre) return tarjetas
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onVolver}
        className="inline-flex min-h-[44px] items-center gap-1 self-start rounded-md px-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Volver a {nivel.padre.label}
      </button>
      {tarjetas}
    </div>
  )
}
