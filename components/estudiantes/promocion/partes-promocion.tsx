/**
 * Estudiantes › Promover temporada — small shared pieces of the screen
 * (artboards 09 / 10 of design/estudiantes-asistencia):
 * - `AvisoPromocion`: the inline notices of the decision cards and the page.
 *   `info` and `marca` are `AvisoFormulario`; the warning look (`.aviso.warn`)
 *   is composed here on the status tokens because `AvisoFormulario` has no
 *   warning tone yet (gap in docs/design-system/components.md, "Planned
 *   components").
 * - `ConNumeros`: a sentence of the view model with its numbers in mono.
 */
import type { ReactElement, ReactNode } from 'react'
import { AlertTriangle, Info, UsersRound } from 'lucide-react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { cn } from '@/lib/utils'

export interface AvisoPromocionProps {
  readonly tono: 'info' | 'marca' | 'warning'
  readonly titulo?: string | null
  readonly children?: ReactNode
  readonly className?: string
}

export function AvisoPromocion({ tono, titulo, children, className }: AvisoPromocionProps): ReactElement {
  const Icono = tono === 'warning' ? AlertTriangle : tono === 'marca' ? UsersRound : Info
  const contenido = (
    <div className="flex min-w-0 gap-3">
      <Icono aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', tono === 'warning' ? 'text-warning-text' : tono === 'info' ? 'text-info-text' : 'text-brand-text')} />
      <div className="min-w-0 space-y-1">
        {titulo && <p className="font-semibold text-foreground">{titulo}</p>}
        {children}
      </div>
    </div>
  )
  if (tono === 'warning') {
    return <div className={cn('rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground', className)}>{contenido}</div>
  }
  return (
    <AvisoFormulario tono={tono} className={className}>
      {contenido}
    </AvisoFormulario>
  )
}

/** Renders `texto` with every number in `font-mono tabular-nums`. */
export function ConNumeros({ texto }: { readonly texto: string }): ReactElement {
  return (
    <>
      {texto.split(/(\d+)/).map((parte, i) =>
        /^\d+$/.test(parte) ? (
          <span key={i} className="font-mono tabular-nums">
            {parte}
          </span>
        ) : (
          parte
        ),
      )}
    </>
  )
}
