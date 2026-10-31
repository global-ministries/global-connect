'use client'

/**
 * Estudiantes — gap G1 of design/estudiantes-asistencia/README.md
 * (`MarcaAsistencia`, listed under "Planned components" in
 * docs/design-system/components.md): the per-row Presente / Ausente pair of
 * the leader list. It takes the `ControlSegmentado` frame and pressed state
 * (card surface, border, the pressed segment inverted) with two 44px
 * icon-only segments; each has an `aria-label` and `aria-pressed`, and a
 * second tap on the pressed one clears the mark (the caller decides that).
 * It sits above the `ListaResponsiva` row button (`relative z-10`).
 */
import type { ReactElement } from 'react'
import { Check, X } from 'lucide-react'

import type { Marca } from '@/lib/platform/estudiantes/lista-datos'
import { cn } from '@/lib/utils'

export interface MarcaAsistenciaProps {
  /** The person's name, for the group label ("Asistencia de Camila Herrera"). */
  readonly nombre: string
  readonly valor: Marca | null
  readonly onMarcar: (toque: Marca) => void
  readonly className?: string
}

const SEGMENTOS: readonly { readonly valor: Marca; readonly etiqueta: string; readonly Icono: typeof Check }[] = [
  { valor: 'presente', etiqueta: 'Presente', Icono: Check },
  { valor: 'ausente', etiqueta: 'Ausente', Icono: X },
]

export function MarcaAsistencia({ nombre, valor, onMarcar, className }: MarcaAsistenciaProps): ReactElement {
  return (
    <div
      role="group"
      aria-label={`Asistencia de ${nombre}`}
      className={cn('relative z-10 inline-flex shrink-0 rounded-xl border border-border bg-card p-[3px]', className)}
    >
      {SEGMENTOS.map(({ valor: segmento, etiqueta, Icono }) => {
        const pulsado = valor === segmento
        return (
          <button
            key={segmento}
            type="button"
            aria-label={etiqueta}
            aria-pressed={pulsado}
            onClick={() => onMarcar(segmento)}
            className={cn(
              'focus-ring grid size-11 place-items-center rounded-md transition-colors touch-manipulation md:size-10 pointer-coarse:size-11',
              pulsado ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icono aria-hidden="true" className="size-5" />
          </button>
        )
      })}
    </div>
  )
}
