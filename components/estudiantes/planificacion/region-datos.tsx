/**
 * Estudiantes — the data region of the planning style screens
 * (odd/tasks/estudiantes-estilo-dps.md, E4a; `.wrap`, `.tbl`, `.colh`,
 * `.band`, `.drow` and `.ft` of design/estudiantes-dps 01–07): gap EA2 of
 * README-tanda-a.md, a list with sticky section bands on every width, local
 * here until the system has it.
 *
 * - `RegionDatos`: 24px gutters from md (none on a phone: the list bleeds).
 * - `TablaPlanificacion`: one `bg-card` surface, rounded with a border from
 *   md, hairlines top and bottom on a phone. `overflow-clip` (no scroll
 *   container) keeps the bands sticky to the page scroll.
 * - `CabeceraColumnas`: the column titles, desktop only and decorative.
 * - `BandaSeccion`: the sticky `bg-muted` band of a section (h2, a mono
 *   count, a hint, a trailing text action) under the toolbar from md, under
 *   the phone bar below.
 * - `CLASE_LINEA` and `CLASE_FILA`: a row: 56px with an inset hairline past
 *   the 32px avatar on a phone; from md a 44px grid row (the screen sets its
 *   columns).
 * - `PieRegion`: the footer line ("15 en la lista · …", "Orden: …").
 * Server-safe.
 */
import type { ReactElement, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** A text action in a band or a toolbar ("Marcar todos", "Otra fecha"): brand text, 44px to the touch. */
export const CLASE_ACCION_TEXTO =
  'focus-ring inline-flex min-h-8 shrink-0 touch-manipulation items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-brand-text transition-colors hover:bg-accent disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent pointer-coarse:min-h-11'

/** The hairline above every row but the first (on the `li`): inset past the avatar on a phone. */
export const CLASE_LINEA =
  'relative before:absolute before:top-0 before:right-0 before:left-[60px] before:h-px before:bg-border/60 first:before:hidden md:before:left-0'

export const CLASE_FILA = 'flex min-h-14 w-full min-w-0 items-center gap-3 py-1 pr-2 pl-4 text-left md:grid md:min-h-11 md:pl-3 md:hover:bg-accent/60'

/** Avatar of a row: 24px from md, 32px on a phone (AvatarIniciales `className`). */
export const CLASE_AVATAR_FILA = 'max-md:size-8 max-md:text-xs'

export function RegionDatos({ children, className }: { readonly children: ReactNode; readonly className?: string }): ReactElement {
  return <div className={cn('min-w-0 space-y-3 md:px-6 md:pt-4 md:pb-10', className)}>{children}</div>
}

export function TablaPlanificacion({ children, className }: { readonly children: ReactNode; readonly className?: string }): ReactElement {
  return (
    <div
      className={cn(
        'min-w-0 overflow-clip border-y border-border bg-card md:rounded-md md:border [&>section+section]:border-t [&>section+section]:border-border',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CabeceraColumnas({ children, className }: { readonly children: ReactNode; readonly className?: string }): ReactElement {
  return (
    <div aria-hidden="true" className={cn('hidden min-h-[34px] items-center gap-3 border-b border-border px-3 text-xs font-semibold text-muted-foreground md:grid', className)}>
      {children}
    </div>
  )
}

export interface BandaSeccionProps {
  readonly id: string
  readonly titulo: string
  /** Mono count after the title ("9/12"). */
  readonly cuenta?: ReactNode
  readonly pista?: ReactNode
  /** Trailing text action (`CLASE_ACCION_TEXTO`). */
  readonly accion?: ReactNode
}

export function BandaSeccion({ id, titulo, cuenta, pista, accion }: BandaSeccionProps): ReactElement {
  return (
    <div className="sticky top-0 z-[2] flex min-h-9 min-w-0 items-center gap-2.5 border-b border-border bg-muted pr-1.5 pl-4 text-[13px] md:top-[calc(4rem+var(--alto-herramientas,0px))] md:min-h-8 md:pl-3 md:text-xs">
      <h2 id={id} className="min-w-0 truncate font-[650] md:tracking-[0.02em]">
        {titulo}
      </h2>
      {cuenta !== undefined && <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{cuenta}</span>}
      {pista && <span className="min-w-0 truncate text-muted-foreground">{pista}</span>}
      {accion && <span className="ml-auto flex shrink-0 items-center">{accion}</span>}
    </div>
  )
}

/** "Nadie con este filtro." under a band. */
export function VacioSeccion({ children }: { readonly children: ReactNode }): ReactElement {
  return <p className="px-4 py-3.5 text-[13px] text-muted-foreground md:px-3">{children}</p>
}

export function PieRegion({ children }: { readonly children: ReactNode }): ReactElement {
  return <div className="flex flex-wrap items-center justify-between gap-2 px-4 text-xs text-muted-foreground md:px-0.5">{children}</div>
}
