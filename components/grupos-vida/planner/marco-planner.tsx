/**
 * Planner — the page frame of the planner's own pages (publish review, new
 * season assistant, closing diagnosis) in the planning style (S25,
 * docs/design-system/layout.md › Wide layout): the header band of the board
 * (`bg-card border-b`, 24px gutters, h1 24px / 650, summary 15px, 36px
 * actions at the right) and the content under it with the same 24px
 * gutters, past PaginaSistema's page gutters. On a phone there is no band:
 * the title is the large title (28px / 700) with its summary as the first
 * block (mobile.md), the actions under it. Server-safe.
 */
import type { ReactElement, ReactNode } from 'react'

import { PaginaSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'

/** h1 of a planner page: the phone large title, 24px / 650 from md. */
export const CLASE_TITULO_PAGINA =
  'text-[28px] font-bold leading-[1.15] tracking-[-0.03em] text-foreground md:text-2xl md:font-[650] md:tracking-[-0.02em]'

/** The summary line under the h1: 15px muted, numbers in `strong`. */
export const CLASE_RESUMEN_PAGINA = 'text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground'

export interface MarcoPlannerProps {
  readonly migas: ReactNode
  /** The h1 and its summary (CLASE_TITULO_PAGINA, CLASE_RESUMEN_PAGINA), or any title block. */
  readonly encabezado: ReactNode
  /** 36px actions at the right of the band. */
  readonly acciones?: ReactNode
  readonly children: ReactNode
  readonly className?: string
}

export function MarcoPlanner({ migas, encabezado, acciones, children, className }: MarcoPlannerProps): ReactElement {
  return (
    <PaginaSistema breadcrumbs={migas}>
      {/* Past the page gutters of PaginaSistema (p-4 sm:p-6 lg:px-12 lg:py-8). */}
      <div className="-m-4 sm:-m-6 lg:-mx-12 lg:-my-8">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pt-4 sm:px-6 md:border-b md:border-border md:bg-card md:pb-3.5">
          <div className="min-w-0 flex-1 basis-80 space-y-1">{encabezado}</div>
          {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </header>
        <div className={cn('space-y-6 px-4 pt-5 pb-8 sm:px-6 md:pt-6', className)}>{children}</div>
      </div>
    </PaginaSistema>
  )
}
