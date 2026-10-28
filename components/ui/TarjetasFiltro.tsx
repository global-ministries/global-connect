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
 *
 * Scope cards (`presentacion="alcance"`, prototype `.scope` / `.node`, used by
 * Servidores) add a chevron, an auto-fill grid of cards from `md` and inset
 * grouped rows on phones (name, responsible, count, chevron; flags on a second
 * line). Any card may carry flags (`insignias`) and a stacked etapa bar
 * (`barraEtapas`); without them a card renders exactly as before.
 */
import { useState, type ReactElement } from 'react'
import { ChevronRight, Search } from 'lucide-react'

import { FONDO_TONO, type TonoEstado } from '@/components/ui/punto-estado'
import { BadgeSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'

/** A flag on a card, e.g. `{ texto: '3 sin cuenta', tono: 'warning' }`. */
export interface InsigniaTarjeta {
  readonly texto: string
  readonly tono: 'info' | 'warning' | 'danger' | 'success'
}

/** One segment of the stacked etapa bar: its tone, its count and (for screen readers) its name. */
export interface SegmentoBarraEtapas {
  readonly tono: TonoEstado
  readonly valor: number
  readonly etiqueta?: string
}

export interface TarjetaFiltro {
  readonly id: string
  readonly label: string
  /** Second line, e.g. "Coordina Edith Pérez"; hidden on phones. */
  readonly subtitulo: string | null
  readonly total: number
  /** Optional info badge, e.g. "2 por activar". */
  readonly badge: string | null
  /** Flags under the count; in the scope presentation only the non-info ones show on phones. */
  readonly insignias?: readonly InsigniaTarjeta[]
  /** The stacked etapa bar at the bottom of the card (hidden on phones and in compact mode). */
  readonly barraEtapas?: readonly SegmentoBarraEtapas[]
}

export interface TarjetasFiltroProps {
  /**
   * The first card, the one that removes the filter ("Toda la dirección").
   * Optional: scope cards of a tree omit it (the breadcrumbs go back up).
   */
  readonly todas?: TarjetaFiltro
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
  /**
   * `filtro` (default): pills on phones, 2 → 3 → 5 column grid from `md`.
   * `alcance`: scope cards of a tree (chevron, auto-fill grid ≥ 240px from
   * `md`, inset grouped rows on phones).
   */
  readonly presentacion?: 'filtro' | 'alcance'
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

const CLASE_INSIGNIA: Record<InsigniaTarjeta['tono'], string> = {
  info: 'border-info/40 bg-info/10 text-info-text',
  warning: 'border-warning/40 bg-warning/10 text-warning-text',
  danger: 'border-danger/40 bg-danger/10 text-danger-text',
  success: 'border-success/40 bg-success/10 text-success-text',
}

function Insignia({ insignia, ocultarEnMovil = false }: { readonly insignia: InsigniaTarjeta; readonly ocultarEnMovil?: boolean }): ReactElement {
  return (
    <span
      data-insignia=""
      className={cn(
        'inline-flex h-5 items-center whitespace-nowrap rounded-md border px-1.5 text-[11px] font-medium md:h-[22px] md:px-2 md:text-xs',
        CLASE_INSIGNIA[insignia.tono],
        ocultarEnMovil && 'hidden md:inline-flex',
      )}
    >
      {insignia.texto}
    </span>
  )
}

/** The stacked bar is decorative; the etapas are also said in words for screen readers. */
function BarraEtapas({
  segmentos,
  className,
}: {
  readonly segmentos: readonly SegmentoBarraEtapas[]
  readonly className?: string
}): ReactElement | null {
  const visibles = segmentos.filter((segmento) => segmento.valor > 0)
  const total = visibles.reduce((suma, segmento) => suma + segmento.valor, 0)
  if (total === 0) return null
  const enPalabras = visibles
    .filter((segmento) => segmento.etiqueta)
    .map((segmento) => `${segmento.etiqueta} ${segmento.valor}`)
    .join(', ')
  return (
    <>
      <span data-barra-etapas="" aria-hidden="true" className={cn('hidden h-1.5 overflow-hidden rounded-full bg-border/60 md:flex', className)}>
        {visibles.map((segmento, i) => (
          <span key={i} className={cn('block h-full', FONDO_TONO[segmento.tono])} style={{ width: `${(segmento.valor / total) * 100}%` }} />
        ))}
      </span>
      {enPalabras && <span className="sr-only">{enPalabras}</span>}
    </>
  )
}

/**
 * A scope card: on phones an inset grouped row (name and responsible, count,
 * chevron; flags on a second line), from `md` a card (name and responsible
 * with the chevron, count and unit, flags, etapa bar).
 */
function TarjetaAlcance({
  tarjeta,
  activo,
  primera,
  onSeleccionar,
  unidad,
}: {
  readonly tarjeta: TarjetaFiltro
  readonly activo: boolean
  readonly primera: boolean
  readonly onSeleccionar: (id: string) => void
  readonly unidad: TarjetasFiltroProps['unidad']
}): ReactElement {
  const insignias = tarjeta.insignias ?? []
  const soloInfo = insignias.every((insignia) => insignia.tono === 'info')
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={() => onSeleccionar(tarjeta.id)}
      className={cn(
        'relative grid min-h-16 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-2.5 gap-y-1 px-3.5 py-3 text-left transition-colors touch-manipulation active:bg-accent',
        'md:grid-cols-[minmax(0,1fr)_1rem] md:items-start md:gap-3.5 md:rounded-2xl md:border md:p-4 md:active:bg-transparent',
        activo ? 'bg-brand-tint md:border-brand' : 'md:border-border/60 md:bg-card md:hover:border-border md:hover:bg-accent',
        !primera && 'before:absolute before:top-0 before:right-0 before:left-3.5 before:h-px before:bg-border/60 md:before:hidden',
        ANILLO,
      )}
    >
      <span className="col-start-1 row-start-1 min-w-0">
        <span className="block truncate text-base font-medium text-foreground md:whitespace-normal md:text-[15px] md:font-semibold">
          {tarjeta.label}
        </span>
        {tarjeta.subtitulo && (
          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground md:mt-1">{tarjeta.subtitulo}</span>
        )}
      </span>
      <span className="col-start-2 row-start-1 flex items-baseline justify-self-end md:col-span-2 md:col-start-1 md:row-start-2 md:justify-self-start">
        <span className="font-mono text-[17px] font-medium tabular-nums text-muted-foreground md:text-[26px] md:font-semibold md:leading-none md:text-foreground">
          {tarjeta.total}
        </span>
        <span className="ml-1.5 hidden text-[13px] text-muted-foreground md:inline">
          {tarjeta.total === 1 ? unidad.singular : unidad.plural}
        </span>
      </span>
      <ChevronRight
        data-chevron=""
        aria-hidden="true"
        className="col-start-3 row-start-1 size-4 text-muted-foreground/70 md:col-start-2 md:mt-0.5"
      />
      <span
        className={cn(
          'col-start-1 row-start-2 flex flex-wrap gap-1.5 md:col-span-2 md:row-start-3 md:min-h-[22px]',
          soloInfo && 'hidden md:flex',
        )}
      >
        {insignias.map((insignia) => (
          <Insignia key={insignia.texto} insignia={insignia} ocultarEnMovil={insignia.tono === 'info'} />
        ))}
      </span>
      {tarjeta.barraEtapas && <BarraEtapas segmentos={tarjeta.barraEtapas} className="md:col-span-2 md:row-start-4" />}
    </button>
  )
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
      {tarjeta.insignias && tarjeta.insignias.length > 0 && (
        <span className="hidden flex-wrap gap-1.5 md:flex">
          {tarjeta.insignias.map((insignia) => (
            <Insignia key={insignia.texto} insignia={insignia} />
          ))}
        </span>
      )}
      {tarjeta.barraEtapas && <BarraEtapas segmentos={tarjeta.barraEtapas} />}
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
        {tarjeta.insignias?.map((insignia) => (
          <Insignia key={insignia.texto} insignia={insignia} />
        ))}
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
  presentacion = 'filtro',
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
          {consulta === '' && todas && (
            <FilaCompacta tarjeta={todas} activo={seleccionadoId === todas.id} onSeleccionar={onSeleccionar} />
          )}
          {visibles.map((item) => (
            <FilaCompacta key={item.id} tarjeta={item} activo={seleccionadoId === item.id} onSeleccionar={onSeleccionar} />
          ))}
        </div>
      </div>
    )
  }

  if (presentacion === 'alcance') {
    return (
      <div
        role="group"
        aria-label={etiqueta}
        className="min-w-0 overflow-hidden rounded-2xl bg-card md:grid md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] md:gap-3 md:overflow-visible md:rounded-none md:bg-transparent"
      >
        {(todas ? [todas, ...items] : items).map((tarjeta, i) => (
          <TarjetaAlcance
            key={tarjeta.id || 'todas'}
            tarjeta={tarjeta}
            activo={seleccionadoId === tarjeta.id}
            primera={i === 0}
            onSeleccionar={onSeleccionar}
            unidad={unidad}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      role="group"
      aria-label={etiqueta}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-3 xl:grid-cols-5"
    >
      {todas && <TarjetaBoton tarjeta={todas} activo={seleccionadoId === todas.id} onSeleccionar={onSeleccionar} unidad={unidad} />}
      {items.map((item) => (
        <TarjetaBoton key={item.id} tarjeta={item} activo={seleccionadoId === item.id} onSeleccionar={onSeleccionar} unidad={unidad} />
      ))}
    </div>
  )
}
