'use client'

/**
 * Estudiantes — the planning style frame of the attendance screens
 * (odd/tasks/estudiantes-estilo-dps.md, E4a; artboards 01–07 of
 * design/estudiantes-dps, "Decisiones comunes"), composed here until the
 * planned `EncabezadoAmplio` of docs/design-system/components.md exists:
 *
 * - `MarcoPlanificacion`: the page past PaginaSistema's gutters, as
 *   components/grupos-vida/planner/marco-planner.tsx; `relative` so `sr-only`
 *   text cannot stretch the document under the shell (L34 of DPS).
 * - `EncabezadoPlanificacion`: from md the header band (`bg-card`, bottom
 *   border, 24px gutters, h1 24px / 650, the date line, the summary and its
 *   4px bar, 36px actions at the right). On a phone there is no band: the
 *   back control (and one icon action), the eyebrow, the large title (h2: the
 *   shell's phone header holds the page h1) and the same lines under it.
 * - `BarraHerramientasPlanificacion`: the toolbar under the band, sticky
 *   from md under the 64px desktop header; it publishes its height as
 *   `--alto-herramientas` so the section bands stick right under it.
 * - `ResumenPlanificacion` and `BarraProgreso`: the summary line and the bar.
 */
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { PaginaSistema } from '@/components/ui/sistema-diseno'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { cn } from '@/lib/utils'

export interface AtrasPlanificacion {
  readonly etiqueta: string
  readonly href?: string
  readonly onClick?: () => void
}

export function MarcoPlanificacion({ migas, children }: { readonly migas: ReactNode; readonly children: ReactNode }): ReactElement {
  return (
    <PaginaSistema breadcrumbs={migas} className="relative">
      {/* Past the page gutters of PaginaSistema (p-4 sm:p-6 lg:px-12 lg:py-8). */}
      <div data-marco-planificacion="" className="-m-4 pb-6 sm:-m-6 md:pb-0 lg:-mx-12 lg:-my-8">
        {children}
      </div>
    </PaginaSistema>
  )
}

export interface EncabezadoPlanificacionProps {
  readonly titulo: string
  /** Phone eyebrow above the large title ("Transit · Grupos de Chicas"). */
  readonly antetitulo?: string
  /** Phone back control ("‹ Estudiantes"); the desktop header has the crumbs. */
  readonly atras?: AtrasPlanificacion | null
  /** One phone icon action at the right of the back row (Filtros). */
  readonly accionMovil?: ReactNode
  /** Band actions: at the right from md, under the title on a phone. */
  readonly acciones?: ReactNode
  /** The date line, the summary and its bar. */
  readonly children?: ReactNode
}

export function EncabezadoPlanificacion({ titulo, antetitulo, atras, accionMovil, acciones, children }: EncabezadoPlanificacionProps): ReactElement {
  return (
    <header className="flex flex-wrap items-start gap-x-5 gap-y-3 px-4 pt-3 pb-3 sm:px-6 md:border-b md:border-border md:bg-card md:pt-4 md:pb-3.5">
      <div className="min-w-0 flex-1 basis-80">
        {(atras || accionMovil) && (
          <div className="-mx-2 mb-1 flex min-h-11 items-center justify-between gap-2 md:hidden">
            {atras ? <BotonAtrasMovil atras={atras} className="max-w-[75%]" /> : <span />}
            {accionMovil}
          </div>
        )}
        {antetitulo && <p className="truncate px-1 text-[13px] text-muted-foreground md:hidden">{antetitulo}</p>}
        <TituloGrande titulo={titulo} nivel={2} className="break-words" />
        <h1 className="hidden break-words text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground md:block">{titulo}</h1>
        {children && <div className="mt-2.5 space-y-2.5 px-1 md:mt-2 md:px-0">{children}</div>}
      </div>
      {acciones && <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">{acciones}</div>}
    </header>
  )
}

/** The summary line: 15px muted, the numbers in `strong`. */
export function ResumenPlanificacion({ children, vivo = false }: { readonly children: ReactNode; readonly vivo?: boolean }): ReactElement {
  return (
    <p aria-live={vivo ? 'polite' : undefined} className="text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
      {children}
    </p>
  )
}

/** The 4px `success` bar under the summary (marked of all). Decorative: the summary says it. */
export function BarraProgreso({ valor, total }: { readonly valor: number; readonly total: number }): ReactElement {
  const ancho = total > 0 ? Math.min(100, (valor / total) * 100) : 0
  return (
    <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-muted md:max-w-[420px]">
      <span
        className="block h-full bg-success transition-[width] duration-300 ease-[var(--ease-out-quint)] motion-reduce:transition-none"
        style={{ width: `${ancho}%` }}
      />
    </div>
  )
}

/** The date line of the band: the date pill, the meta and the live indicator. */
export function LineaFecha({ children }: { readonly children: ReactNode }): ReactElement {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{children}</div>
}

/** The muted 13px meta next to the date pill ("9:00 · líder Andrea Molina"). */
export function MetaFecha({ icono: Icono, children }: { readonly icono?: LucideIcon; readonly children: ReactNode }): ReactElement {
  return (
    <p className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
      {Icono && <Icono aria-hidden="true" className="size-3.5 shrink-0" />}
      <span className="min-w-0">{children}</span>
    </p>
  )
}

export function BarraHerramientasPlanificacion({ children, className }: { readonly children: ReactNode; readonly className?: string }): ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const barra = ref.current
    const marco = barra?.closest<HTMLElement>('[data-marco-planificacion]')
    if (!barra || !marco || typeof ResizeObserver !== 'function') return
    const medir = () => marco.style.setProperty('--alto-herramientas', `${barra.offsetHeight}px`)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(barra)
    return () => observador.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col gap-2.5 px-4 pb-3 sm:px-6',
        'md:sticky md:top-16 md:z-[4] md:flex-row md:flex-wrap md:items-center md:gap-x-4 md:border-b md:border-border md:bg-background md:py-2.5',
        className,
      )}
    >
      {children}
    </div>
  )
}
