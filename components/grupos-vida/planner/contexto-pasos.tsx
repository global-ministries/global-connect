'use client'

/**
 * Planner — what the board components need from the saved steps (T5b of
 * odd/tasks/planner-gdv.md): the actions of usePasosPlanner
 * (pasos-planner.tsx) through a context, and the drop zones. Without a
 * provider (a card or the bank rendered alone) the components stay
 * read-only. No server actions here, so the components stay testable alone.
 */
import { createContext, useContext, useState, type DragEvent } from 'react'

import type { GrupoTablero, SegmentoPlanner, SegmentoPublicacion, SugerenciaLocalidad } from '@/lib/platform/grupos-vida/planner'

import type { RolDestino } from './modelo'

/** What is being placed: one person, or the two of a couple row. */
export interface Carga {
  readonly ids: readonly string[]
  readonly nombre: string
  /** Where they come from: a member of a card can also go back to the bank. */
  readonly desdeGrupo: boolean
}

export interface PeticionUbicar {
  readonly carga: Carga
  readonly grupoId: string | null
  readonly rol: RolDestino
}

export type EstadoGuardado =
  | { readonly tipo: 'listo'; readonly en: number | null }
  | { readonly tipo: 'guardando' }
  | { readonly tipo: 'error'; readonly mensaje: string }

export interface PasosPlanner {
  readonly editable: (segmentoId: string) => boolean
  readonly pedirUbicar: (carga: Carga, inicial?: { readonly grupoId: string; readonly rol: RolDestino }) => void
  readonly arrastrar: (carga: Carga, evento: DragEvent) => void
  readonly terminarArrastre: () => void
  readonly arrastrando: boolean
  /** Drop the dragged people on a group (in that role) or, with null, on the bank. */
  readonly soltar: (grupo: GrupoTablero | null, rol: RolDestino) => void
  readonly usarLocalidad: (grupo: GrupoTablero, sugerencia: SugerenciaLocalidad) => void
  /** Opens the group panel (02); only for a group on the board (S10: read-only when the actor does not edit it). */
  readonly abrirGrupo: (grupoId: string) => void
  readonly grupoVisible: (grupoId: string) => boolean
  readonly pedirEliminar: (grupo: GrupoTablero) => void
  readonly pedirNuevoGrupo: (segmento: SegmentoPlanner) => void
  /** The publish state of a segment (S14); null when it has no groups or the state could not be read. */
  readonly segmento: (segmentoId: string) => SegmentoPublicacion | null
  readonly marcar: (segmento: SegmentoPublicacion, terminado: boolean) => void
}

const PasosPlannerContext = createContext<PasosPlanner | null>(null)

export const PasosPlannerProvider = PasosPlannerContext.Provider

/** The board actions, or null when the component is rendered read-only. */
export const usePasos = (): PasosPlanner | null => useContext(PasosPlannerContext)

/** Drop zone props for a group (card or role section) or the bank, with the hover state. */
export function useZonaSoltar(grupo: GrupoTablero | null, rol: RolDestino) {
  const pasos = usePasos()
  const [sobre, setSobre] = useState(false)
  const activa = pasos !== null && (grupo === null || pasos.editable(grupo.segmento_id))
  if (!activa) return { sobre: false, props: {} }
  return {
    sobre,
    props: {
      onDragOver: (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        if (!sobre) setSobre(true)
      },
      onDragLeave: () => setSobre(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setSobre(false)
        pasos.soltar(grupo, rol)
      },
    },
  }
}

