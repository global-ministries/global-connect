'use client'

/**
 * Estudiantes › En vivo — "● En vivo · Actualizado hace 10 s" (gap G4 of
 * design/estudiantes-asistencia, `IndicadorEnVivo` under "Planned
 * components" in docs/design-system/components.md). `PuntoEstado` success
 * while it refreshes, muted while the tab is hidden or the last refresh
 * failed (the label says which). The counter ticks every second here, so
 * only this line re-renders, and it is not a live region: changes are
 * announced elsewhere (the new-visitor toast), never the counter.
 */
import { useEffect, useState, type ReactElement } from 'react'

import { PuntoEstado } from '@/components/ui/punto-estado'
import { indicadorVivo } from '@/lib/platform/estudiantes/vivo-vista'
import { cn } from '@/lib/utils'

export interface IndicadorEnVivoProps {
  /** Epoch ms of the last data. */
  readonly actualizadoAt: number
  readonly oculto: boolean
  readonly fallo: boolean
  readonly className?: string
}

export function IndicadorEnVivo({ actualizadoAt, oculto, fallo, className }: IndicadorEnVivoProps): ReactElement {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1_000)
    return () => window.clearInterval(id)
  }, [])

  const { tono, texto } = indicadorVivo({ segundos: Math.max(0, (ahora - actualizadoAt) / 1_000), oculto, fallo })
  return (
    <p data-slot="indicador-en-vivo" className={cn('min-w-0', className)}>
      <PuntoEstado tono={tono} etiqueta={texto} />
    </p>
  )
}
