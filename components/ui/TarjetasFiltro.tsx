'use client'

/**
 * KPI cards that ARE the filter: a first "all" card plus one selectable card
 * per category, each with its count, an optional responsible line and an
 * optional badge. Every card is a real `<button aria-pressed>`. Used by Mi
 * equipo (teams of a dirección) and Servidores (direcciones, then equipos), so
 * every list that filters by a small category looks and behaves the same.
 *
 * ONE set of buttons serves every width: a horizontally scrollable row of
 * pills on phones, a responsive grid of cards from `md` up (2 → 3 → 5
 * columns as the screen grows). With many categories (`modoCompacto`, e.g.
 * Grupos de Vida) the cards give way to a compact scrollable list with its own
 * filter.
 */
import { useState, type ReactElement } from 'react'
import { Search } from 'lucide-react'

import { BadgeSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'

export interface TarjetaFiltro {
  readonly id: string
  readonly label: string
  /** Second line, e.g. "Coordina Edith Pérez"; hidden on phones. */
  readonly subtitulo: string | null
  readonly total: number
  /** Optional info badge, e.g. "2 por activar". */
  readonly badge: string | null
}

export interface TarjetasFiltroProps {
  /** The first card, the one that removes the filter ("Toda la dirección"). */
  readonly todas: TarjetaFiltro
  readonly items: readonly TarjetaFiltro[]
  readonly modoCompacto: boolean
  readonly seleccionadoId: string
  readonly onSeleccionar: (id: string) => void
  /** The unit next to the big number. */
  readonly unidad: { readonly singular: string; readonly plural: string }
  /** Accessible name of the group, e.g. "Equipos". */
  readonly etiqueta: string
  /** Placeholder (and accessible name) of the compact-mode filter, e.g. "Buscar equipo". */
  readonly buscarEtiqueta: string
}

/** Lowercase, without accents, trimmed: what the compact-mode filter compares. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

const ANILLO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function claseSeleccion(activo: boolean): string {
  return activo
    ? 'border-brand bg-brand-tint'
    : 'border-border bg-card hover:bg-accent'
}

function TarjetaBoton({
  tarjeta,
  activo,
  onSeleccionar,
  unidad,
}: {
  readonly tarjeta: TarjetaFiltro
  readonly activo: boolean
  readonly onSeleccionar: (id: string) => void
  readonly unidad: TarjetasFiltroProps['unidad']
}): ReactElement {
  const responsable = tarjeta.subtitulo
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={() => onSeleccionar(tarjeta.id)}
      className={cn(
        'flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border-[1.5px] px-4 text-left transition-colors',
        'md:min-h-[148px] md:shrink md:flex-col md:items-stretch md:justify-between md:gap-3 md:rounded-2xl md:p-4',
        claseSeleccion(activo),
        ANILLO,
      )}
    >
      <span className="flex min-w-0 flex-col md:gap-1.5">
        <span className="whitespace-nowrap text-sm font-semibold text-foreground md:whitespace-normal md:text-base">
          {tarjeta.label}
        </span>
        {responsable && <span className="hidden text-sm text-muted-foreground md:block">{responsable}</span>}
      </span>
      <span className="flex items-baseline gap-1.5 md:items-end md:justify-between">
        <span className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold tabular-nums text-foreground md:text-3xl">
            <span aria-hidden="true" className="md:hidden">
              ·{' '}
            </span>
            {tarjeta.total}
          </span>
          <span className="hidden text-sm text-muted-foreground md:inline">{tarjeta.total === 1 ? unidad.singular : unidad.plural}</span>
        </span>
        {tarjeta.badge && (
          <BadgeSistema variante="info" tamaño="sm" className="hidden md:inline-flex">
            {tarjeta.badge}
          </BadgeSistema>
        )}
      </span>
    </button>
  )
}

function FilaCompacta({
  tarjeta,
  activo,
  onSeleccionar,
}: {
  readonly tarjeta: TarjetaFiltro
  readonly activo: boolean
  readonly onSeleccionar: (id: string) => void
}): ReactElement {
  const responsable = tarjeta.subtitulo
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={() => onSeleccionar(tarjeta.id)}
      className={cn(
        'flex min-h-[44px] w-full items-center justify-between gap-3 border-l-2 px-4 py-2 text-left transition-colors',
        activo ? 'border-l-brand bg-brand-tint' : 'border-l-transparent hover:bg-accent',
        ANILLO,
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{tarjeta.label}</span>
        {responsable && <span className="block truncate text-xs text-muted-foreground">{responsable}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {tarjeta.badge && (
          <BadgeSistema variante="info" tamaño="sm">
            {tarjeta.badge}
          </BadgeSistema>
        )}
        <span className="text-sm font-semibold tabular-nums text-foreground">{tarjeta.total}</span>
      </span>
    </button>
  )
}

export function TarjetasFiltro({
  todas,
  items,
  modoCompacto,
  seleccionadoId,
  onSeleccionar,
  unidad,
  etiqueta,
  buscarEtiqueta,
}: TarjetasFiltroProps): ReactElement {
  const [filtro, setFiltro] = useState('')

  if (modoCompacto) {
    const consulta = normalizar(filtro)
    // While filtering, only matching cards are listed (the "all" card only when not filtering).
    const visibles = items.filter((item) => consulta === '' || normalizar(item.label).includes(consulta))
    return (
      <div className="space-y-3">
        <div className="max-w-sm">
          <InputSistema
            type="search"
            icono={Search}
            aria-label={buscarEtiqueta}
            placeholder={buscarEtiqueta}
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        </div>
        <div
          role="group"
          aria-label={etiqueta}
          className="max-h-72 divide-y divide-border overflow-y-auto rounded-2xl border border-border bg-card"
        >
          {consulta === '' && (
            <FilaCompacta tarjeta={todas} activo={seleccionadoId === todas.id} onSeleccionar={onSeleccionar} />
          )}
          {visibles.map((item) => (
            <FilaCompacta key={item.id} tarjeta={item} activo={seleccionadoId === item.id} onSeleccionar={onSeleccionar} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      role="group"
      aria-label={etiqueta}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-3 xl:grid-cols-5"
    >
      <TarjetaBoton tarjeta={todas} activo={seleccionadoId === todas.id} onSeleccionar={onSeleccionar} unidad={unidad} />
      {items.map((item) => (
        <TarjetaBoton key={item.id} tarjeta={item} activo={seleccionadoId === item.id} onSeleccionar={onSeleccionar} unidad={unidad} />
      ))}
    </div>
  )
}
