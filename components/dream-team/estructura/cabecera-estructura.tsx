'use client'

/**
 * Estructura — what sits above the tabs (S12; prototype `.crumbs`,
 * `.hero-fila`, `.large`): the desktop breadcrumbs "Dream Team / Estructura",
 * and the title with its summary "4 direcciones · 22 equipos activos · 199
 * personas sirviendo": the hero h1 (24px) from md, the phone large title (an
 * h2: the shell's phone header holds the page h1) below.
 */
import type { ReactElement, ReactNode } from 'react'

import { TituloGrande } from '@/components/ui/barra-navegacion-movil'
import type { ResumenOrganigrama } from '@/lib/platform/dream-team/estructura-organigrama'

export function MigasEstructura(): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
        <li className="px-2 py-1.5 text-muted-foreground">Dream Team</li>
        <li aria-hidden="true" className="px-0.5 text-muted-foreground/60">
          /
        </li>
        <li aria-current="page" className="px-2 py-1.5 font-semibold text-foreground">
          Estructura
        </li>
      </ol>
    </nav>
  )
}

function contar(cantidad: number, uno: string, varios: string): ReactNode {
  return (
    <>
      <strong className="font-mono font-semibold tabular-nums">{cantidad}</strong> {cantidad === 1 ? uno : varios}
    </>
  )
}

export function ResumenEstructura({ resumen }: { readonly resumen: ResumenOrganigrama }): ReactElement {
  return (
    <>
      {contar(resumen.direcciones, 'dirección', 'direcciones')} ·{' '}
      {contar(resumen.equiposActivos, 'equipo activo', 'equipos activos')} ·{' '}
      {contar(resumen.personas, 'persona sirviendo', 'personas sirviendo')}
    </>
  )
}

/** The title and its summary; `pestanas` (the tab list) sits at its right from md, under it on phones. */
export function CabeceraEstructura({
  resumen,
  pestanas,
}: {
  readonly resumen: ResumenOrganigrama
  readonly pestanas: ReactNode
}): ReactElement {
  const texto = <ResumenEstructura resumen={resumen} />
  return (
    <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-x-6">
      <TituloGrande titulo="Estructura" nivel={2} resumen={texto} />
      <div className="hidden min-w-0 md:block">
        <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">Estructura</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:text-foreground">{texto}</p>
      </div>
      {pestanas}
    </div>
  )
}
