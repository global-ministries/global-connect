'use client'

/**
 * Servidores — the KPI cards above the list, the same pattern as Mi equipo:
 * without a dirección, one card per dirección (tapping one enters it); with
 * one, "Toda la dirección" plus one card per equipo. They replace the Equipo
 * selector; the numbers follow every other filter (see `calcularTarjetas` in
 * lib/platform/dream-team/servidores-vista.ts).
 */
import type { ReactElement } from 'react'

import { TarjetasFiltro, type TarjetaFiltro } from '@/components/ui/TarjetasFiltro'
import {
  parcheElegirTarjeta,
  type FiltrosServidores,
  type TarjetaConteo,
  type VistaServidores,
} from '@/lib/platform/dream-team/servidores-vista'

export interface TarjetasUbicacionProps {
  readonly vista: VistaServidores
  readonly onCambio: (parche: Partial<FiltrosServidores>) => void
}

const PERSONAS = { singular: 'persona', plural: 'personas' } as const

function aTarjeta(tarjeta: TarjetaConteo): TarjetaFiltro {
  return {
    id: tarjeta.id,
    label: tarjeta.label,
    subtitulo: tarjeta.responsable,
    total: tarjeta.personas,
    badge: tarjeta.porActivar > 0 ? `${tarjeta.porActivar} por activar` : null,
  }
}

export function TarjetasUbicacion({ vista, onCambio }: TarjetasUbicacionProps): ReactElement {
  const { tarjetas, opciones } = vista
  const porDireccion = tarjetas.nivel === 'direcciones'
  return (
    <TarjetasFiltro
      todas={aTarjeta(tarjetas.todas)}
      items={tarjetas.items.map(aTarjeta)}
      modoCompacto={tarjetas.modoCompacto}
      seleccionadoId={tarjetas.seleccionadaId}
      onSeleccionar={(id) => onCambio(parcheElegirTarjeta(tarjetas.nivel, id, opciones.equipos))}
      unidad={PERSONAS}
      etiqueta={porDireccion ? 'Direcciones' : 'Equipos'}
      buscarEtiqueta={porDireccion ? 'Buscar dirección' : 'Buscar equipo'}
    />
  )
}
