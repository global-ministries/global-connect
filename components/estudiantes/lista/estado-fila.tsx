/**
 * Estudiantes — the status dot of a leader list row and the "Historial" dots
 * (the last meetings with marks, oldest first). Status never relies on color
 * alone: the dot comes with its label, and the history carries a text
 * ("3 de 4") plus a screen-reader sentence.
 */
import type { ReactElement } from 'react'

import { FONDO_TONO, type TonoEstado } from '@/components/ui/punto-estado'
import type { EstadoFila, PuntosHistorial } from '@/lib/platform/estudiantes/lista-vista'
import { cn } from '@/lib/utils'

export const TONO_ESTADO: Readonly<Record<EstadoFila, { readonly tono: TonoEstado; readonly etiqueta: string }>> = {
  presente: { tono: 'success', etiqueta: 'Presente' },
  ausente: { tono: 'danger', etiqueta: 'Ausente' },
  sin: { tono: 'muted', etiqueta: 'Sin marcar' },
  nueva: { tono: 'info', etiqueta: 'Visitante' },
}

const TEXTO_MARCA = { presente: 'presente', ausente: 'ausente' } as const

export function PuntosAsistencia({ historial }: { readonly historial: PuntosHistorial }): ReactElement {
  if (historial.total === 0) return <span className="text-sm text-muted-foreground">—</span>
  const frase = historial.puntos.map((p) => (p.estado ? TEXTO_MARCA[p.estado] : 'sin marcar')).join(', ')
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="inline-flex gap-1">
        {historial.puntos.map((p, i) => (
          <span
            key={`${p.fecha}-${i}`}
            className={cn('size-2 rounded-full', p.estado === 'presente' ? FONDO_TONO.success : p.estado === 'ausente' ? FONDO_TONO.danger : 'border border-border')}
          />
        ))}
      </span>
      <span aria-hidden="true" className="font-mono text-sm tabular-nums text-foreground">{`${historial.presentes} de ${historial.total}`}</span>
      <span className="sr-only">{`Últimas ${historial.total} reuniones: ${frase}`}</span>
    </span>
  )
}
