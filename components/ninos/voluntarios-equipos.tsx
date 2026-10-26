'use client'

/**
 * Voluntarios — the team cards of the selected area: "Todos los equipos" plus
 * one card per equipo of the loaded roster, rendered by the shared KPI filter
 * cards (components/ui/TarjetasFiltro). Each card counts the volunteers and
 * badges the expected ones still unmarked; picking one narrows the list.
 */
import type { ReactElement } from 'react'

import { TarjetasFiltro, type TarjetaFiltro } from '@/components/ui/TarjetasFiltro'
import { MAX_EQUIPOS_EN_TARJETAS } from '@/lib/platform/dream-team/mi-equipo-vista'
import { TODOS_LOS_EQUIPOS, type ResumenEquipo } from '@/lib/platform/ninos/voluntarios'

const VOLUNTARIOS = { singular: 'voluntario', plural: 'voluntarios' } as const

function aTarjeta(id: string, label: string, total: number, sinMarcar: number): TarjetaFiltro {
  return { id, label, subtitulo: null, total, badge: sinMarcar > 0 ? `${sinMarcar} sin marcar` : null }
}

export function TarjetasEquiposVoluntarios({
  equipos,
  total,
  sinMarcar,
  seleccionadoId,
  onSeleccionar,
}: {
  readonly equipos: readonly ResumenEquipo[]
  /** Every volunteer of the area. */
  readonly total: number
  /** Expected volunteers of the area still unmarked. */
  readonly sinMarcar: number
  readonly seleccionadoId: string
  readonly onSeleccionar: (equipoId: string) => void
}): ReactElement {
  return (
    <TarjetasFiltro
      todas={aTarjeta(TODOS_LOS_EQUIPOS, 'Todos los equipos', total, sinMarcar)}
      items={equipos.map((e) => aTarjeta(e.equipoId, e.equipo, e.total, e.sinMarcar))}
      modoCompacto={equipos.length > MAX_EQUIPOS_EN_TARJETAS}
      seleccionadoId={seleccionadoId}
      onSeleccionar={onSeleccionar}
      unidad={VOLUNTARIOS}
      etiqueta="Equipos"
      buscarEtiqueta="Buscar equipo"
    />
  )
}
