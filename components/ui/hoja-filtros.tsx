'use client'

/**
 * HojaFiltros — the filters sheet of a list screen (docs/design-system/
 * patterns.md#toolbar-and-filters-sheet; prototype `#fsheet`): a
 * `DetalleResponsivo` (side panel from md, bottom sheet below) with filter
 * groups and a footer "Limpiar" | "Ver N personas". Filters apply live, so
 * "Ver N" only closes; N is what the list shows now.
 *
 * ```tsx
 * <HojaFiltros abierta={abierta} onCambioAbierta={setAbierta} resultados={visibles.length}
 *   unidad={{ singular: 'persona', plural: 'personas' }} onLimpiar={limpiar}>
 *   <GrupoFiltro titulo="Etapa"><GrupoPastillas etiqueta="Etapa">…</GrupoPastillas></GrupoFiltro>
 *   <GrupoFiltro titulo="Más filtros"><SelectsFiltro><SelectSistema label="Rol" … /></SelectsFiltro></GrupoFiltro>
 * </HojaFiltros>
 * ```
 */
import * as React from 'react'

import { cn } from '@/lib/utils'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonSistema } from '@/components/ui/sistema-diseno'

export interface HojaFiltrosProps {
  readonly abierta: boolean
  readonly onCambioAbierta: (abierta: boolean) => void
  readonly titulo?: string
  /** Items the list shows with the current filters. */
  readonly resultados: number
  /** Noun for "Ver N …", e.g. { singular: 'persona', plural: 'personas' }. */
  readonly unidad: { readonly singular: string; readonly plural: string }
  /** Empties the filters this sheet holds; the sheet stays open. */
  readonly onLimpiar: () => void
  readonly children: React.ReactNode
}

export function HojaFiltros({
  abierta,
  onCambioAbierta,
  titulo = 'Filtros',
  resultados,
  unidad,
  onLimpiar,
  children,
}: HojaFiltrosProps) {
  return (
    <DetalleResponsivo
      abierto={abierta}
      onCambioAbierto={onCambioAbierta}
      titulo={titulo}
      pie={
        <>
          <BotonSistema type="button" variante="outline" onClick={onLimpiar} className="flex-1">
            Limpiar
          </BotonSistema>
          <BotonSistema type="button" onClick={() => onCambioAbierta(false)} className="flex-1">
            Ver {resultados} {resultados === 1 ? unidad.singular : unidad.plural}
          </BotonSistema>
        </>
      }
    >
      <div className="grid gap-6">{children}</div>
    </DetalleResponsivo>
  )
}

export interface GrupoFiltroProps {
  /** Uppercase group label, also the group's accessible name. */
  readonly titulo: string
  readonly children: React.ReactNode
  readonly className?: string
}

/** One block of the sheet (prototype `.group`): a small uppercase label over its controls. */
export function GrupoFiltro({ titulo, children, className }: GrupoFiltroProps) {
  const id = React.useId()
  return (
    <div role="group" aria-labelledby={id} className={cn('grid gap-2.5', className)}>
      <span id={id} className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {titulo}
      </span>
      {children}
    </div>
  )
}

/** Selects for long lists (Rol, Turno, Inicio; prototype `.selects`): 3 columns from md, 1 on phone. */
export function SelectsFiltro({ children, className }: { readonly children: React.ReactNode; readonly className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-2.5 md:grid-cols-3', className)}>{children}</div>
}
