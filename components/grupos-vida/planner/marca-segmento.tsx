'use client'

/**
 * Planner — "Terminé mi segmento" of a lane (S14, S17; artboard 08). For
 * whoever edits the segment (its director de etapa; admin, pastor and
 * director general for every segment). Disabled, with the reason as its
 * description, until the segment has groups and 0 blockers
 * (puedeMarcarSegmento, the same check as planner_marcar_segmento). Once
 * marked: "Terminado por <nombre>" and "Desmarcar". Any later step on the
 * segment removes the mark on the server (S17); the refresh shows it. With
 * unsaved changes in the segment (S24) it waits: "Guarda tus cambios
 * primero". Marking itself saves at once.
 */
import { useId, type ReactElement } from 'react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { puedeMarcarSegmento, type SegmentoPublicacion } from '@/lib/platform/grupos-vida/planner'

import { usePasos } from './contexto-pasos'

export function MarcaSegmento({ segmento }: { readonly segmento: SegmentoPublicacion }): ReactElement | null {
  const pasos = usePasos()
  const idMotivo = useId()
  if (!pasos) return null

  if (segmento.terminado) {
    const quien = segmento.marcado_por?.nombre
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <PuntoEstado tono="success" etiqueta={quien ? `Terminado por ${quien}` : 'Terminado'} />
        <BotonSistema
          type="button"
          variante="ghost"
          tamaño="sm"
          aria-label={`Desmarcar ${segmento.nombre} como terminado`}
          onClick={() => pasos.marcar(segmento, false)}
        >
          Desmarcar
        </BotonSistema>
      </span>
    )
  }

  const { puede, motivo } = pasos.pendiente.enSegmento(segmento.id) > 0 ? { puede: false, motivo: 'Guarda tus cambios primero' } : puedeMarcarSegmento(segmento)
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <BotonSistema
        type="button"
        variante="outline"
        tamaño="sm"
        aria-disabled={!puede}
        aria-describedby={motivo ? idMotivo : undefined}
        onClick={() => puede && pasos.marcar(segmento, true)}
      >
        Terminé mi segmento
      </BotonSistema>
      {motivo && (
        <span id={idMotivo} className="text-xs text-muted-foreground">
          {motivo}
        </span>
      )}
    </span>
  )
}
