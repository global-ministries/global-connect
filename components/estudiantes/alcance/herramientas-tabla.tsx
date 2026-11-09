'use client'

/**
 * Estudiantes — the one-row toolbar pieces over a `TablaDensa` (`.tb` of
 * artboards 11, 13 and 15; layout.md › Toolbar):
 * - `BuscadorBarra`: the 36px search (280px, shrinks to 180px).
 * - `MenuColumnas`: «Columnas n/m ▾» (planned `MenuColumnas`, as the local one
 *   of components/dps/programacion-client.tsx): a checkbox menu that stays
 *   open to pick several; the frozen first column is listed checked and
 *   disabled, and at least one other column stays on. `Escape` closes.
 * - `DENSIDADES`: the options of the «Condensado | Normal» `ControlSegmentado`.
 */
import type { ReactElement } from 'react'
import { ChevronDown, Columns3, Search } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

import type { Densidad } from './tabla-densa'

export const DENSIDADES = [
  { valor: 'condensado', etiqueta: 'Condensado' },
  { valor: 'normal', etiqueta: 'Normal' },
] as const satisfies readonly { valor: Densidad; etiqueta: string }[]

export interface BuscadorBarraProps {
  readonly valor: string
  readonly onCambio: (valor: string) => void
  readonly placeholder: string
  readonly etiqueta: string
}

export function BuscadorBarra({ valor, onCambio, placeholder, etiqueta }: BuscadorBarraProps): ReactElement {
  return (
    <div className="relative min-w-[180px] flex-[0_1_280px]">
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        aria-label={etiqueta}
        placeholder={placeholder}
        autoComplete="off"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className="h-9 w-full rounded-xl border border-border bg-card pr-2.5 pl-8 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/20 pointer-coarse:h-11"
      />
    </div>
  )
}

export interface ColumnaElegible {
  readonly id: string
  readonly etiqueta: string
}

export interface MenuColumnasProps {
  /** The frozen first column (always on). */
  readonly fija: string
  readonly columnas: readonly ColumnaElegible[]
  readonly ocultas: ReadonlySet<string>
  readonly onCambio: (ocultas: ReadonlySet<string>) => void
}

export function MenuColumnas({ fija, columnas, ocultas, onCambio }: MenuColumnasProps): ReactElement {
  const visibles = columnas.filter((c) => !ocultas.has(c.id)).length
  function alternar(id: string, visible: boolean): void {
    const siguiente = new Set(ocultas)
    if (visible) siguiente.delete(id)
    else if (visibles > 1) siguiente.add(id)
    onCambio(siguiente)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <BotonSistema variante="outline" tamaño="sm" icono={Columns3}>
          Columnas{' '}
          <span className="font-mono tabular-nums">
            {visibles + 1}/{columnas.length + 1}
          </span>
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </BotonSistema>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" aria-label="Columnas visibles" className="min-w-56 bg-card shadow-sheet">
        <DropdownMenuCheckboxItem checked disabled className="min-h-8 text-[13px] pointer-coarse:min-h-11">
          {fija}
        </DropdownMenuCheckboxItem>
        {columnas.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.id}
            checked={!ocultas.has(c.id)}
            onCheckedChange={(v) => alternar(c.id, v === true)}
            onSelect={(e) => e.preventDefault()}
            className="min-h-8 text-[13px] pointer-coarse:min-h-11"
          >
            {c.etiqueta}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
