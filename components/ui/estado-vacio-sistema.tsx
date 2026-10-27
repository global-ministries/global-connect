/**
 * EstadoVacioSistema and SkeletonLista — the canonical empty state and loading
 * rows (docs/design-system/patterns.md, "Empty and loading states"; prototype
 * `.empty`, `.skel`). Both render inside the list container: no card of their
 * own, centered and muted.
 *
 * Deliberately NOT a client component. Server pages hand it a lucide icon
 * component through `icono`; a `'use client'` directive here would make that
 * throw "Functions cannot be passed directly to Client Components" (React
 * #441), as it did for components/dream-team/estado-vacio.tsx on 2026-09-26.
 */
import { isValidElement, type ComponentType, type ReactElement, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface EstadoVacioSistemaProps {
  /** A component (lucide icon) or an already-built element. */
  readonly icono?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> | ReactElement
  readonly titulo: string
  /** One line of guidance: the primary action, or "Limpiar todo". */
  readonly subtitulo?: string
  readonly accion?: ReactNode
  readonly className?: string
}

function Icono({ icono }: { readonly icono: NonNullable<EstadoVacioSistemaProps['icono']> }): ReactElement {
  if (isValidElement(icono)) {
    return (
      <span aria-hidden="true" className="text-muted-foreground/40">
        {icono}
      </span>
    )
  }
  const Componente = icono
  return <Componente aria-hidden className="size-10 text-muted-foreground/40" />
}

export function EstadoVacioSistema({ icono, titulo, subtitulo, accion, className }: EstadoVacioSistemaProps): ReactElement {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-5 py-14 text-center', className)}>
      {icono && <Icono icono={icono} />}
      <div className="max-w-md">
        <p className="text-base font-semibold text-foreground">{titulo}</p>
        {subtitulo && <p className="mt-1.5 text-sm text-muted-foreground">{subtitulo}</p>}
      </div>
      {accion && <div className="mt-1">{accion}</div>}
    </div>
  )
}

export interface SkeletonListaProps {
  /** Placeholder rows; patterns.md asks for 6. */
  readonly filas?: number
  readonly className?: string
}

export function SkeletonLista({ filas = 6, className }: SkeletonListaProps): ReactElement {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">Cargando</span>
      {Array.from({ length: filas }, (_, i) => (
        <div
          key={i}
          data-fila-skeleton=""
          aria-hidden="true"
          className="flex h-[72px] items-center gap-3 border-b border-border/60 px-4 last:border-b-0"
        >
          <div className="size-10 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="h-3.5 w-2/5 animate-pulse rounded-md bg-muted" />
            <div className="h-3 w-3/5 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}
