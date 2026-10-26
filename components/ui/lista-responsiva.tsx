'use client'

/**
 * ListaResponsiva — the list of a list screen (docs/design-system/patterns.md
 * #list-screen-anatomy, mobile.md#inset-grouped-lists; prototype `.list`,
 * `.list-h`, `.row`).
 *
 * Structure: one ARIA table (`role="table"` / `row` / `columnheader` / `cell`)
 * for every width, and CSS swaps the layout at md, so there is no
 * matchMedia, no hydration gap and one set of rows:
 * - md and up: a header row (sortable headers are buttons; the active one's
 *   `columnheader` carries `aria-sort` and an ↑/↓) and grid rows whose tracks
 *   come from `columnas`. Columns with `ocultarEnTablet` show from lg.
 * - below md: the header and grid cells are `display: none` and each row shows
 *   its phone cell instead: avatar, title, subtitle, badges, trailing meta,
 *   inside a rounded card with hairline dividers inset past the avatar.
 * Hidden cells leave the accessibility tree with `display: none`, so screen
 * readers get the cells of the current layout only.
 *
 * Every row ends in a cell with a real `<button>` (the chevron) named by
 * `etiquetaFila`; it stretches over the whole row, so a click anywhere,
 * Enter or Space opens the detail, and the row shows the focus ring.
 * Interactive content inside a cell (a WhatsApp link) must sit above it
 * with `relative z-10`.
 */
import * as React from 'react'
import { ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'

export interface ColumnaLista {
  readonly id: string
  readonly titulo: string
  readonly ordenable?: boolean
  /** Grid track, e.g. "150px" or "minmax(240px,1.1fr)"; defaults to minmax(0,1fr). */
  readonly ancho?: string
  /** Hidden between md and lg (tablet). */
  readonly ocultarEnTablet?: boolean
}

export interface OrdenLista {
  readonly columna: string
  readonly sentido: 'asc' | 'desc'
}

/** What a row shows below md. */
export interface FilaMovil {
  readonly titulo: React.ReactNode
  readonly subtitulo?: React.ReactNode
  /** 40px round avatar; moves the divider inset past it. */
  readonly avatar?: React.ReactNode
  readonly insignias?: React.ReactNode
  /** Trailing content before the chevron, e.g. a `PuntoEstado`. */
  readonly meta?: React.ReactNode
}

export interface ListaResponsivaProps<T> {
  readonly columnas: readonly ColumnaLista[]
  readonly filas: readonly T[]
  readonly claveFila: (fila: T) => string
  readonly renderCelda: (fila: T, columnaId: string) => React.ReactNode
  readonly renderFilaMovil: (fila: T) => FilaMovil
  readonly onAbrirFila: (fila: T) => void
  /** Accessible name of the row's open button, e.g. "Abrir Ana Pérez". */
  readonly etiquetaFila: (fila: T) => string
  readonly orden?: OrdenLista
  readonly onOrdenar?: (columnaId: string) => void
  /** Rendered inside the list card when there are no rows (`EstadoVacioSistema`). */
  readonly vacio?: React.ReactNode
  readonly cargando?: boolean
  /** Accessible name of the table, e.g. "Servidores". */
  readonly etiqueta: string
  readonly className?: string
}

// The last track is the chevron column.
const PISTA_CHEVRON = '28px'
const pista = (columna: ColumnaLista) => columna.ancho ?? 'minmax(0,1fr)'

const CLASE_CONTENEDOR = 'min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60'
const CLASE_GRID =
  'md:grid md:grid-cols-(--columnas-tableta) md:items-center md:gap-4 md:px-[18px] lg:grid-cols-(--columnas-escritorio)'
const CLASE_CABECERA =
  'hidden min-h-11 border-b border-border/60 text-xs uppercase tracking-[0.08em] text-muted-foreground'

const visibleDesdeMd = (columna: ColumnaLista) => (columna.ocultarEnTablet ? 'hidden lg:flex' : 'hidden md:flex')

function Cabecera({
  columnas,
  orden,
  onOrdenar,
}: {
  readonly columnas: readonly ColumnaLista[]
  readonly orden?: OrdenLista
  readonly onOrdenar?: (columnaId: string) => void
}) {
  return (
    <div role="row" className={cn(CLASE_CABECERA, CLASE_GRID)}>
      {columnas.map((columna) => {
        const activa = orden?.columna === columna.id
        const sentido = activa ? (orden.sentido === 'asc' ? 'ascending' : 'descending') : undefined
        return (
          <div
            key={columna.id}
            role="columnheader"
            aria-sort={sentido}
            className={cn('min-w-0 items-center', columna.ocultarEnTablet ? 'hidden lg:flex' : 'flex')}
          >
            {columna.ordenable && onOrdenar ? (
              <button
                type="button"
                onClick={() => onOrdenar(columna.id)}
                className={cn(
                  // gap-1 draws the space before the arrow: a flex box drops the text one.
                  'focus-ring -mx-1 inline-flex min-h-9 items-center gap-1 rounded-md px-1 uppercase tracking-[inherit] hover:text-foreground pointer-coarse:min-h-11',
                  activa && 'text-foreground',
                )}
              >
                {columna.titulo}
                {activa && <span aria-hidden="true">{` ${orden.sentido === 'asc' ? '↑' : '↓'}`}</span>}
              </button>
            ) : (
              <span className="truncate">{columna.titulo}</span>
            )}
          </div>
        )
      })}
      <div role="columnheader" className="flex">
        <span className="sr-only">Abrir</span>
      </div>
    </div>
  )
}

function ContenidoMovil({ fila }: { readonly fila: FilaMovil }) {
  return (
    <div role="cell" className="flex min-w-0 flex-1 items-center gap-3 md:hidden">
      {fila.avatar && <div className="shrink-0">{fila.avatar}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span data-slot="fila-movil-titulo" className="truncate text-base font-semibold text-foreground">
            {fila.titulo}
          </span>
          {fila.insignias && <span className="flex shrink-0 items-center gap-1">{fila.insignias}</span>}
        </div>
        {fila.subtitulo && <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{fila.subtitulo}</div>}
      </div>
      {fila.meta && <div className="shrink-0 text-xs">{fila.meta}</div>}
    </div>
  )
}

export function ListaResponsiva<T>({
  columnas,
  filas,
  claveFila,
  renderCelda,
  renderFilaMovil,
  onAbrirFila,
  etiquetaFila,
  orden,
  onOrdenar,
  vacio,
  cargando = false,
  etiqueta,
  className,
}: ListaResponsivaProps<T>) {
  if (cargando) {
    return (
      <div className={cn(CLASE_CONTENEDOR, className)}>
        <SkeletonLista />
      </div>
    )
  }

  if (filas.length === 0) {
    return <div className={cn(CLASE_CONTENEDOR, className)}>{vacio}</div>
  }

  // Custom properties inherit, so every row reads the same tracks.
  const pistas = {
    '--columnas-escritorio': [...columnas.map(pista), PISTA_CHEVRON].join(' '),
    '--columnas-tableta': [...columnas.filter((c) => !c.ocultarEnTablet).map(pista), PISTA_CHEVRON].join(' '),
  } as React.CSSProperties

  return (
    <div role="table" aria-label={etiqueta} style={pistas} className={cn(CLASE_CONTENEDOR, className)}>
      <div role="rowgroup">
        <Cabecera columnas={columnas} orden={orden} onOrdenar={onOrdenar} />
      </div>
      <div role="rowgroup">
        {filas.map((fila, indice) => {
          const movil = renderFilaMovil(fila)
          return (
            <div
              key={claveFila(fila)}
              role="row"
              className={cn(
                'relative flex min-h-16 min-w-0 items-center gap-2.5 px-3.5 py-2.5 transition-colors active:bg-accent',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-brand',
                // Phone hairline between rows, inset past the avatar (66px) or the padding (14px).
                indice > 0 && [
                  'before:absolute before:top-0 before:right-0 before:h-px before:bg-border/60 md:before:hidden',
                  movil.avatar ? 'before:left-[66px]' : 'before:left-3.5',
                ],
                'md:min-h-[72px] md:border-b md:border-border/60 md:py-3 md:last:border-b-0 md:active:bg-transparent md:hover:bg-accent/50',
                CLASE_GRID,
              )}
            >
              {columnas.map((columna) => (
                <div key={columna.id} role="cell" className={cn('min-w-0 items-center', visibleDesdeMd(columna))}>
                  {renderCelda(fila, columna.id)}
                </div>
              ))}
              <ContenidoMovil fila={movil} />
              <div role="cell" className="flex shrink-0 justify-end">
                <button
                  type="button"
                  aria-label={etiquetaFila(fila)}
                  onClick={() => onAbrirFila(fila)}
                  className="grid size-7 place-items-center text-muted-foreground outline-none touch-manipulation after:absolute after:inset-0 after:content-['']"
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
