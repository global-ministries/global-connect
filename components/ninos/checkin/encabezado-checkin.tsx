/**
 * Niños › Check-in — breadcrumbs, hero and summary line
 * ("Barquisimeto · 70 niños adentro · 1 salón lleno · 3 familias en camino").
 * Phone: large title (`TituloGrande`); md and up: the 24px hero `h1`.
 */
import type { ReactElement } from 'react'

import { TituloGrande } from '@/components/ui/barra-navegacion-movil'
import type { ResumenCheckin } from '@/lib/platform/ninos/checkin-vista'

const palabra = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)

export function MigasCheckin(): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
        <li className="truncate px-2 py-1.5 text-muted-foreground">Niños</li>
        <li className="flex min-w-0 items-center gap-0.5">
          <span aria-hidden="true" className="px-0.5 text-muted-foreground">
            /
          </span>
          <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">
            Check-in
          </span>
        </li>
      </ol>
    </nav>
  )
}

export function ResumenLinea({ campus, resumen }: { readonly campus: string | null; readonly resumen: ResumenCheckin }): ReactElement {
  const { adentro, llenos, enCamino } = resumen
  return (
    <>
      {campus && <>{campus} · </>}
      <strong className="font-mono font-semibold tabular-nums">{adentro}</strong> {palabra(adentro, 'niño adentro', 'niños adentro')} ·{' '}
      <strong className="font-mono font-semibold tabular-nums">{llenos}</strong> {palabra(llenos, 'salón lleno', 'salones llenos')} ·{' '}
      <strong className="font-mono font-semibold tabular-nums">{enCamino}</strong> {palabra(enCamino, 'familia en camino', 'familias en camino')}
    </>
  )
}

export function EncabezadoCheckin({ campus, resumen }: { readonly campus: string | null; readonly resumen: ResumenCheckin }): ReactElement {
  const linea = <ResumenLinea campus={campus} resumen={resumen} />
  return (
    <div data-testid="resumen-checkin">
      <div className="md:hidden">
        <TituloGrande titulo="Check-in" resumen={linea} />
      </div>
      <div className="hidden min-w-0 md:block">
        <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">Check-in</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:text-foreground">{linea}</p>
      </div>
    </div>
  )
}
