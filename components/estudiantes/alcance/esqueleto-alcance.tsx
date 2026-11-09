/**
 * Estudiantes — the loading frame of the wide screens (Grupos, Promover
 * temporada, Reportes; docs/design-system/patterns.md#empty-and-loading-states):
 * the same `MarcoAlcance` with the title, a summary bar, the «barra de
 * alcance» rows, the toolbar and skeleton rows in the data region, so the
 * screen does not jump when the data arrives. Server-safe.
 */
import type { ReactElement } from 'react'

import { SkeletonSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'

import { BarraAlcance } from './barra-alcance'
import { MarcoAlcance } from './marco-alcance'

export interface EsqueletoAlcanceProps {
  readonly titulo: string
  /** Rows of the scope bar per section. */
  readonly secciones?: readonly number[]
  /** Width of the toolbar placeholders. */
  readonly herramientas?: readonly string[]
}

export function EsqueletoAlcance({ titulo, secciones = [4, 3], herramientas = ['280px', '140px', '120px', '180px'] }: EsqueletoAlcanceProps): ReactElement {
  return (
    <MarcoAlcance
      migas={null}
      titulo={titulo}
      resumen={<SkeletonSistema ancho="420px" alto="18px" className="mt-1 inline-block max-w-full align-middle" />}
      barra={
        <BarraAlcance etiqueta="Cargando">
          {secciones.map((filas, i) => (
            <div key={i} className="space-y-2 pt-3 pr-3 pb-3 pl-4">
              <SkeletonSistema ancho="96px" alto="12px" />
              {[...Array(filas)].map((_, j) => (
                <SkeletonSistema key={j} alto="32px" />
              ))}
            </div>
          ))}
        </BarraAlcance>
      }
      movil={
        <div className="px-1">
          <p className="text-[28px] leading-[1.1] font-bold tracking-[-0.03em] text-foreground">{titulo}</p>
          <SkeletonSistema ancho="260px" alto="18px" className="mt-2 max-w-full" />
        </div>
      }
    >
      <div className="hidden shrink-0 flex-wrap items-center gap-2.5 px-6 pt-3 pb-2.5 md:flex">
        {herramientas.map((ancho, i) => (
          <SkeletonSistema key={i} ancho={ancho} alto="36px" className="rounded-xl" />
        ))}
      </div>
      <SkeletonSistema alto="44px" className="rounded-xl md:hidden" />
      <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:mx-6 md:min-h-0 md:flex-1 md:rounded-md md:border md:border-border">
        <SkeletonLista />
      </div>
    </MarcoAlcance>
  )
}
