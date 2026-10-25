'use client'

/**
 * Mi equipo — the team picker: "Toda la dirección" plus one selectable card per
 * team, rendered by the shared KPI filter cards (components/ui/TarjetasFiltro).
 * This file only maps the Mi equipo view model onto them.
 */
import type { ReactElement } from 'react'

import { TarjetasFiltro, type TarjetaFiltro } from '@/components/ui/TarjetasFiltro'
import type { ResponsableVista, TarjetaEquipo } from '@/lib/platform/dream-team/mi-equipo-vista'

export interface TarjetasEquiposProps {
  readonly todaLaDireccion: TarjetaEquipo
  readonly equipos: readonly TarjetaEquipo[]
  readonly modoCompacto: boolean
  readonly seleccionadoId: string
  readonly onSeleccionar: (equipoId: string) => void
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

export function TarjetasEquipos({
  todaLaDireccion,
  equipos,
  modoCompacto,
  seleccionadoId,
  onSeleccionar,
}: TarjetasEquiposProps): ReactElement {
  return (
    <TarjetasFiltro
      todas={aTarjeta(todaLaDireccion)}
      items={equipos.map(aTarjeta)}
      modoCompacto={modoCompacto}
      seleccionadoId={seleccionadoId}
      onSeleccionar={onSeleccionar}
      unidad={PERSONAS}
      etiqueta="Equipos"
      buscarEtiqueta="Buscar equipo"
    />
  )
}
