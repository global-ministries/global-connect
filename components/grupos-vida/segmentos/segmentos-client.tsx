'use client'

/**
 * Grupos de Vida — client island for /grupos-vida/segmentos.
 *
 * Every number and every message comes from the pure view model
 * (lib/platform/grupos-vida/segmentos-vista.ts); the server page (RSC) loads the
 * rows and hands this island plain serializable data. The island renders the
 * rows, one per segment, and the footer with the totals.
 */
import type { ReactElement } from 'react'

import type { VistaSegmentos } from '@/lib/platform/grupos-vida/segmentos-vista'
import { FilaSegmentoLista } from './fila-segmento'

export interface SegmentosClientProps {
  readonly vista: VistaSegmentos
  /** Only admin creates, edits and deletes segments. */
  readonly puedeGestionar: boolean
}

export function SegmentosClient({ vista, puedeGestionar }: SegmentosClientProps): ReactElement {
  const segmentos = vista.filas.map((fila) => ({ id: fila.id, nombre: fila.nombre }))

  return (
    <>
      <ul aria-label="Segmentos" className="flex flex-col gap-3 md:gap-2.5">
        {vista.filas.map((fila) => (
          <FilaSegmentoLista key={fila.id} fila={fila} puedeGestionar={puedeGestionar} segmentos={segmentos} />
        ))}
      </ul>
      <p className="flex min-h-[44px] items-center px-1 text-[13px] text-muted-foreground">{vista.pie}</p>
    </>
  )
}
