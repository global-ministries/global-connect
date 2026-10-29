'use client'

/**
 * Mi equipo — the scope cards (prototype `.scope`; S11 decision 3): the next
 * level of the tree under the current one. Tapping a card enters it (an área
 * shows its own cards, an equipo is a leaf, where the section hides). There
 * is no "Toda la dirección" card: the breadcrumbs and the phone "‹ padre" go
 * up. As in Servidores each card carries its responsible on one line, its
 * flags ("N por activar", "N sin cuenta") and the stacked etapa bar; the
 * numbers follow every filter but the level (calcularVistaMiEquipo). Above
 * `MAX_EQUIPOS_EN_TARJETAS` cards they become a compact list with its own
 * search; on phones, inset grouped rows.
 */
import type { ReactElement } from 'react'

import { TarjetasFiltro, type InsigniaTarjeta, type TarjetaFiltro } from '@/components/ui/TarjetasFiltro'
import { ESTADO_LABELS } from '@/components/dream-team/labels'
import { TONO_ESTADO } from '@/components/dream-team/servidores/lista-servidores'
import type { TarjetaMiEquipo, VistaMiEquipo } from '@/lib/platform/dream-team/mi-equipo-filtros'
import type { DreamTeamEstado } from '@/lib/platform/dream-team/types'

const PERSONAS = { singular: 'persona', plural: 'personas' } as const

/** The order of the etapa bar segments (prototype: the serving ones first). */
const ORDEN_BARRA: readonly DreamTeamEstado[] = ['activo', 'en_orientacion', 'postulado', 'en_pausa', 'inactivo', 'retirado']

/** "Áreas" when any card enters a subtree, "Equipos" otherwise. */
export function etiquetaNivelMiEquipo(tarjetas: readonly TarjetaMiEquipo[]): 'Áreas' | 'Equipos' {
  return tarjetas.some((tarjeta) => tarjeta.esArea) ? 'Áreas' : 'Equipos'
}

function aTarjeta(tarjeta: TarjetaMiEquipo): TarjetaFiltro {
  const insignias: InsigniaTarjeta[] = []
  if (tarjeta.porActivar > 0) insignias.push({ texto: `${tarjeta.porActivar} por activar`, tono: 'info' })
  if (tarjeta.sinCuenta > 0) insignias.push({ texto: `${tarjeta.sinCuenta} sin cuenta`, tono: 'warning' })
  return {
    id: tarjeta.id,
    label: tarjeta.label,
    subtitulo: tarjeta.responsable,
    // One line on the card: first name + first surname; the full name stays in title (decisions 2026-10-28, 5).
    subtituloCorto: tarjeta.responsableCorto ?? undefined,
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

export interface TarjetasAlcanceProps {
  readonly vista: VistaMiEquipo
  /** Enters the level of the tapped card. */
  readonly onEntrar: (nivel: string) => void
}

export function TarjetasAlcance({ vista, onEntrar }: TarjetasAlcanceProps): ReactElement {
  const nivel = etiquetaNivelMiEquipo(vista.tarjetas)
  return (
    <TarjetasFiltro
      items={vista.tarjetas.map(aTarjeta)}
      modoCompacto={vista.modoCompacto}
      // Nothing is picked: every card is a level below the current one.
      seleccionadoId=""
      onSeleccionar={onEntrar}
      unidad={PERSONAS}
      etiqueta={nivel}
      buscarEtiqueta={nivel === 'Áreas' ? 'Buscar área' : 'Buscar equipo'}
      presentacion="alcance"
    />
  )
}
