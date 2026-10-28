'use client'

/**
 * Servidores — the scope cards above the list (prototype `.scope`): without a
 * dirección, one card per dirección (tapping one enters it); with one, the
 * next level of its tree (an área card enters the área, an equipo card picks
 * the equipo). There is no "Toda la dirección" card: the breadcrumbs and the
 * phone back button go up, and the screen hides the cards at a leaf equipo. They replace the Equipo
 * selector; the numbers follow every other filter (see `calcularTarjetas` in
 * lib/platform/dream-team/servidores-vista.ts). As in the prototype each card
 * carries its flags ("N por activar", "N sin cuenta") and the stacked etapa
 * bar, and on phones the cards are inset grouped rows.
 */
import type { ReactElement } from 'react'

import { TarjetasFiltro, type InsigniaTarjeta, type TarjetaFiltro } from '@/components/ui/TarjetasFiltro'
import { ESTADO_LABELS } from '@/components/dream-team/labels'
import type { DreamTeamEstado } from '@/lib/platform/dream-team/types'
import {
  parcheElegirTarjeta,
  type FiltrosServidores,
  type TarjetaConteo,
  type VistaServidores,
} from '@/lib/platform/dream-team/servidores-vista'

import { TONO_ESTADO } from './lista-servidores'

export interface TarjetasUbicacionProps {
  readonly vista: VistaServidores
  readonly onCambio: (parche: Partial<FiltrosServidores>) => void
}

const PERSONAS = { singular: 'persona', plural: 'personas' } as const

/** The order of the etapa bar segments (prototype: the serving ones first). */
const ORDEN_BARRA: readonly DreamTeamEstado[] = ['activo', 'en_orientacion', 'postulado', 'en_pausa', 'inactivo', 'retirado']

/** The level the cards stand for: "Áreas" when any card enters a subtree. */
export function etiquetaNivel(tarjetas: VistaServidores['tarjetas']): 'Direcciones' | 'Áreas' | 'Equipos' {
  if (tarjetas.nivel === 'direcciones') return 'Direcciones'
  return tarjetas.items.some((tarjeta) => tarjeta.esArea) ? 'Áreas' : 'Equipos'
}

function aTarjeta(tarjeta: TarjetaConteo): TarjetaFiltro {
  const insignias: InsigniaTarjeta[] = []
  if (tarjeta.porActivar > 0) insignias.push({ texto: `${tarjeta.porActivar} por activar`, tono: 'info' })
  if (tarjeta.sinCuenta > 0) insignias.push({ texto: `${tarjeta.sinCuenta} sin cuenta`, tono: 'warning' })
  return {
    id: tarjeta.id,
    label: tarjeta.label,
    subtitulo: tarjeta.responsable,
    total: tarjeta.personas,
    badge: null,
    insignias,
    barraEtapas: ORDEN_BARRA.map((estado) => ({
      tono: TONO_ESTADO[estado],
      valor: tarjeta.porEtapa[estado],
      etiqueta: ESTADO_LABELS[estado],
    })),
  }
}

export function TarjetasUbicacion({ vista, onCambio }: TarjetasUbicacionProps): ReactElement {
  const { tarjetas, opciones } = vista
  const porDireccion = tarjetas.nivel === 'direcciones'
  const nivel = etiquetaNivel(tarjetas)
  return (
    <TarjetasFiltro
      items={tarjetas.items.map(aTarjeta)}
      modoCompacto={tarjetas.modoCompacto}
      seleccionadoId={tarjetas.seleccionadaId}
      onSeleccionar={(id) => onCambio(parcheElegirTarjeta(tarjetas, id, opciones))}
      unidad={PERSONAS}
      etiqueta={nivel}
      buscarEtiqueta={porDireccion ? 'Buscar dirección' : nivel === 'Áreas' ? 'Buscar área' : 'Buscar equipo'}
      presentacion="alcance"
    />
  )
}
