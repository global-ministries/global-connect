/**
 * Estudiantes — the wide frame of Grupos, Promover temporada and Reportes
 * (planning style, docs/design-system/layout.md › Wide layout; artboards
 * 11–16 of design/estudiantes-dps, S7 of odd/tasks/estudiantes-estilo-dps.md).
 *
 * From md: the header band (`bg-card border-b`, h1 24px / 650, the summary
 * line at 15px, 36px actions at the right), then the «barra de alcance»
 * (`BarraAlcance`, B1) at the left and the view at the right, filling the
 * viewport under the desktop header; only the data region and the bar
 * scroll. `panel` makes room for the docked panel (B4, from 1280px):
 * 480px, or 640px for the person card of Reportes, which also folds the bar
 * (the caller leaves `barra` out while it is open, D9).
 *
 * Below md there is no band: `movil` holds the phone header (back row and
 * large title, mobile.md) and the view follows in the page gutters. Like
 * the planner pages, the frame steps past PaginaSistema's gutters from md.
 * Server-safe.
 */
import type { ReactElement, ReactNode, Ref } from 'react'

import { PaginaSistema } from '@/components/ui/sistema-diseno'
import { CLASE_RESUMEN_PAGINA, CLASE_TITULO_PAGINA } from '@/components/grupos-vida/planner/marco-planner'
import { cn } from '@/lib/utils'

export type AnchoPanel = 'md' | 'lg'

export interface MarcoAlcanceProps {
  readonly migas: ReactNode
  readonly titulo: string
  readonly tituloRef?: Ref<HTMLHeadingElement>
  /** The summary line under the h1 (numbers in `strong`). */
  readonly resumen: ReactNode
  /** 36px actions at the right of the band (desktop). */
  readonly acciones?: ReactNode
  /** The «barra de alcance» (desktop); leave it out to fold it. */
  readonly barra?: ReactNode
  /** The docked panel that is open, if any: the view leaves it room from 1280px. */
  readonly panel?: AnchoPanel | null
  /** The phone header (back row, large title and summary). */
  readonly movil: ReactNode
  /** A footer fixed under the view (Promover temporada). */
  readonly pie?: ReactNode
  readonly children: ReactNode
}

export function MarcoAlcance({ migas, titulo, tituloRef, resumen, acciones, barra, panel = null, movil, pie, children }: MarcoAlcanceProps): ReactElement {
  return (
    <PaginaSistema breadcrumbs={migas} className="pb-28 md:pb-0">
      {/* Past the page gutters of PaginaSistema (sm:p-6 lg:px-12 lg:py-8) from md, as plan-client.tsx. */}
      <div
        data-testid="marco-alcance"
        className={cn(
          'max-md:space-y-5 md:-m-6 md:flex md:h-[calc(100dvh-4rem)] md:min-h-[32rem] md:flex-col lg:-mx-12 lg:-my-8',
          panel === 'md' && 'xl:pr-[480px]',
          panel === 'lg' && 'xl:pr-[640px]',
        )}
      >
        <header className="hidden shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border bg-card px-6 pt-4 pb-3 md:flex">
          <div className="min-w-0 flex-1 basis-80 space-y-1">
            <h1 ref={tituloRef} tabIndex={-1} className={cn(CLASE_TITULO_PAGINA, 'focus:outline-none')}>
              {titulo}
            </h1>
            <p className={CLASE_RESUMEN_PAGINA}>{resumen}</p>
          </div>
          {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </header>

        <div className="space-y-4 md:hidden">{movil}</div>

        <div className="md:flex md:min-h-0 md:flex-1">
          {barra}
          <div className="min-w-0 space-y-4 md:flex md:min-h-0 md:flex-1 md:flex-col md:space-y-0">{children}</div>
        </div>

        {pie}
      </div>
    </PaginaSistema>
  )
}
