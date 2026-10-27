/**
 * PuntoEstado — the status dot plus an optional label (docs/design-system/
 * components.md, "Status dot"; prototype `.d`, `.estado`). A status is never
 * color alone: the dot is decorative and the label carries the meaning. On
 * phones the label may hide visually (`ocultarEtiquetaEnMovil`), but it stays
 * in the accessible name.
 *
 * Server-safe: no hooks, no handlers.
 */
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

export type TonoEstado = 'success' | 'warning' | 'info' | 'danger' | 'muted'

/** Fill of each tone: dots, proportion bars. Not text-safe (see foundations.md). */
export const FONDO_TONO: Record<TonoEstado, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  danger: 'bg-danger',
  muted: 'bg-muted-foreground',
}

const ANILLO_TONO: Record<TonoEstado, string> = {
  success: 'ring-success/20',
  warning: 'ring-warning/20',
  info: 'ring-info/20',
  danger: 'ring-danger/20',
  muted: 'ring-muted-foreground/20',
}

export interface PuntoEstadoProps {
  readonly tono: TonoEstado
  readonly etiqueta?: string
  /** Hide the label below `md`; screen readers still read it. */
  readonly ocultarEtiquetaEnMovil?: boolean
  readonly className?: string
}

export function PuntoEstado({ tono, etiqueta, ocultarEtiquetaEnMovil = false, className }: PuntoEstadoProps): ReactElement {
  return (
    <span className={cn('inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-muted-foreground', className)}>
      <span
        data-punto=""
        aria-hidden="true"
        className={cn('inline-block size-2 shrink-0 rounded-full ring-4', FONDO_TONO[tono], ANILLO_TONO[tono])}
      />
      {etiqueta && <span className={cn(ocultarEtiquetaEnMovil && 'sr-only md:not-sr-only')}>{etiqueta}</span>}
    </span>
  )
}
