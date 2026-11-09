/**
 * Estudiantes — the loading skeleton of a planning style screen
 * (docs/design-system/patterns.md#empty-and-loading-states): it keeps the
 * frame of marco-planificacion.tsx — the band (title, date pill, summary
 * and bar), the toolbar (segmented filter and search), the side bar when
 * the screen has one, and the data region with six skeleton rows — so
 * nothing jumps when the data arrives.
 */
import type { ReactElement } from 'react'

import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'
import { cn } from '@/lib/utils'

export interface EsqueletoPlanificacionProps {
  /** The desktop h1 when the screen knows it (the phone header holds the page h1). */
  readonly titulo?: string
  /** The width of the side bar from `lg` (En vivo, Voluntarios), if any. */
  readonly barraLateral?: 'vivo' | 'voluntarios'
}

export function EsqueletoPlanificacion({ titulo, barraLateral }: EsqueletoPlanificacionProps): ReactElement {
  return (
    <PaginaSistema className="relative">
      <div className="-m-4 sm:-m-6 lg:-mx-12 lg:-my-8">
        <div className="space-y-2.5 px-4 pt-3 pb-3 sm:px-6 md:border-b md:border-border md:bg-card md:pt-4 md:pb-3.5">
          {titulo && <h1 className="hidden text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground md:block">{titulo}</h1>}
          <SkeletonSistema ancho="220px" alto="28px" className={cn(titulo && 'md:hidden')} />
          <SkeletonSistema ancho="200px" alto="30px" className="rounded-full" />
          <SkeletonSistema ancho="360px" alto="18px" className="max-w-full" />
          <SkeletonSistema ancho="420px" alto="4px" className="max-w-full rounded-full" />
        </div>
        <div
          className={cn(
            barraLateral === 'vivo' && 'lg:grid lg:grid-cols-[260px_minmax(0,1fr)]',
            barraLateral === 'voluntarios' && 'lg:grid lg:grid-cols-[240px_minmax(0,1fr)]',
          )}
        >
          {barraLateral && (
            <div className="hidden space-y-2 border-r border-border bg-card p-4 lg:block">
              {[...Array(4)].map((_, i) => (
                <SkeletonSistema key={i} alto="40px" />
              ))}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-col gap-2.5 px-4 pb-3 sm:px-6 md:flex-row md:border-b md:border-border md:py-2.5">
              <SkeletonSistema alto="44px" className="rounded-xl md:w-[360px]" />
              <SkeletonSistema alto="44px" className="rounded-xl md:w-60" />
            </div>
            <div className="md:px-6 md:pt-4">
              <div className="min-w-0 overflow-hidden border-y border-border bg-card md:rounded-md md:border">
                <SkeletonLista />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PaginaSistema>
  )
}
