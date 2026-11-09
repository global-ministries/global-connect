'use client'

/**
 * Estudiantes — `TablaDensa`, the read-only dense table of Grupos,
 * Promover temporada and Reportes (gap B2 of
 * design/estudiantes-dps/README-tanda-b.md; `table` of artboards 11, 13, 15).
 * `HojaCalculo` edits with the keyboard and `ListaResponsiva` has no bands
 * nor a frozen column, so this one is composed here.
 *
 * - 36px rows (30px and 12px text in «Condensado»; 44px on touch, or with
 *   `filaAlta` when a second line sits under the name), 13px cells
 *   truncated at 280px, numbers in mono.
 * - Sticky 34px header; sortable columns are header buttons with
 *   `aria-sort` on the active one and its arrow.
 * - Frozen first column (`th scope="row"`, 2px border): the row's button,
 *   named by `etiquetaFila`, opens its panel; a click anywhere on the row
 *   does the same. The open row has `aria-selected` and the brand tint.
 * - Sticky section bands (`bg-muted`, 30px) under the header: the title and
 *   its numbers ("Grupos de Chicas · 3 grupos · 39 integrantes").
 * The caller wraps it in the bordered region that scrolls (`RegionTabla`).
 */
import { Fragment, type ReactElement, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import { cn } from '@/lib/utils'

export type Densidad = 'condensado' | 'normal'

export interface OrdenColumna {
  readonly activo: boolean
  readonly sentido: 'asc' | 'desc'
  readonly onOrdenar: () => void
}

export interface ColumnaDensa<T> {
  readonly id: string
  readonly titulo: string
  readonly derecha?: boolean
  readonly orden?: OrdenColumna
  readonly celda: (fila: T) => ReactNode
  /** Extra classes of the cells (a fixed width, muted text). */
  readonly clase?: string
  /** An unnamed header ("→"), read as `sr-only` text. */
  readonly tituloOculto?: boolean
}

export interface PrimeraColumna<T> {
  readonly titulo: string
  readonly orden?: OrdenColumna
  readonly nombre: (fila: T) => string
  /** Muted second line under the name (The Living Room's group). */
  readonly debajo?: (fila: T) => ReactNode
  /** Muted text after the name on the same line ("· entró el 12 oct"). */
  readonly despues?: (fila: T) => ReactNode
  /** Minimum width of the frozen column, e.g. `min-w-[200px]`. */
  readonly ancho?: string
}

export interface SeccionDensa<T> {
  readonly id: string
  /** Empty: no band (a flat table). */
  readonly titulo: string
  readonly detalle?: string
  readonly filas: readonly T[]
}

export interface TablaDensaProps<T> {
  /** The caption (`sr-only`), also the table's name. */
  readonly etiqueta: string
  readonly primera: PrimeraColumna<T>
  readonly columnas: readonly ColumnaDensa<T>[]
  readonly secciones: readonly SeccionDensa<T>[]
  readonly claveFila: (fila: T) => string
  /** Without it the rows open nothing (read-only lists such as Egresan). */
  readonly onAbrir?: (fila: T) => void
  readonly etiquetaFila?: (fila: T) => string
  readonly seleccionada?: string | null
  readonly densidad?: Densidad
  readonly filaAlta?: boolean
  /** Row tone: `nuevo` (a soft warning tint) or `apagada` (muted text). */
  readonly tonoFila?: (fila: T) => 'nuevo' | 'apagada' | undefined
  readonly describidaPor?: string
}

const CLASE_CELDA = 'max-w-[280px] overflow-hidden border-b border-border/60 px-2.5 text-ellipsis whitespace-nowrap'
// Opaque on purpose: the frozen and sticky cells hide what scrolls under them.
const CLASE_FONDO =
  'bg-card group-hover/fila:bg-accent group-aria-selected/fila:bg-[image:linear-gradient(var(--brand-accent-strong),var(--brand-accent-strong))]'
const CLASE_NUEVO = 'bg-[color-mix(in_oklab,var(--warning)_6%,var(--card))]'
const CLASE_FIJA = 'sticky left-0 border-r-2 border-r-border'

function Encabezado({ titulo, orden, derecha, clase, oculto }: { readonly titulo: string; readonly orden?: OrdenColumna; readonly derecha?: boolean; readonly clase?: string; readonly oculto?: boolean }): ReactElement {
  const Flecha = !orden?.activo ? ArrowUpDown : orden.sentido === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={orden?.activo ? (orden.sentido === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn(
        'sticky top-0 z-[3] h-[34px] border-b border-border bg-card px-2.5 text-xs font-semibold whitespace-nowrap text-muted-foreground',
        derecha ? 'text-right' : 'text-left',
        clase,
      )}
    >
      {oculto ? (
        <span className="sr-only">{titulo}</span>
      ) : orden ? (
        <button
          type="button"
          onClick={orden.onOrdenar}
          className={cn(
            'focus-ring -ml-1 inline-flex h-7 items-center gap-1 rounded-md px-1 transition-colors hover:bg-accent hover:text-foreground pointer-coarse:h-11',
            orden.activo && 'text-foreground',
          )}
        >
          {titulo}
          <Flecha aria-hidden="true" className={cn('size-3.5', !orden.activo && 'opacity-50')} />
        </button>
      ) : (
        titulo
      )}
    </th>
  )
}

export function TablaDensa<T>({
  etiqueta,
  primera,
  columnas,
  secciones,
  claveFila,
  onAbrir,
  etiquetaFila,
  seleccionada = null,
  densidad = 'normal',
  filaAlta = false,
  tonoFila,
  describidaPor,
}: TablaDensaProps<T>): ReactElement {
  const total = columnas.length + 1
  const alto = filaAlta ? 'h-11' : densidad === 'condensado' ? 'h-[30px] pointer-coarse:h-11' : 'h-9 pointer-coarse:h-11'
  return (
    <table aria-describedby={describidaPor} data-densidad={densidad} className={cn('w-full border-separate border-spacing-0', densidad === 'condensado' ? 'text-xs' : 'text-[13px]')}>
      <caption className="sr-only">{etiqueta}</caption>
      <thead>
        <tr>
          <Encabezado titulo={primera.titulo} orden={primera.orden} clase={cn(CLASE_FIJA, 'left-0 z-[4]', primera.ancho ?? 'min-w-[200px]')} />
          {columnas.map((c) => (
            <Encabezado key={c.id} titulo={c.titulo} orden={c.orden} derecha={c.derecha} clase={c.clase} oculto={c.tituloOculto} />
          ))}
        </tr>
      </thead>
      <tbody>
        {secciones.map((seccion) => (
          <Fragment key={seccion.id}>
            {seccion.titulo && (
              <tr>
                <th
                  colSpan={total}
                  scope="colgroup"
                  className="sticky top-[34px] left-0 z-[2] h-[30px] border-b border-border bg-muted px-2.5 text-left text-xs font-[650] tracking-[0.02em] whitespace-nowrap text-foreground"
                >
                  {seccion.titulo}{' '}
                  {seccion.detalle && (
                    <span className="ml-1 font-normal tracking-normal text-muted-foreground">
                      <span className="sr-only">· </span>
                      {seccion.detalle}
                    </span>
                  )}
                </th>
              </tr>
            )}
            {seccion.filas.map((fila) => {
              const clave = claveFila(fila)
              const tono = tonoFila?.(fila)
              const fondo = tono === 'nuevo' ? cn(CLASE_NUEVO, 'group-hover/fila:bg-accent') : CLASE_FONDO
              const abrir = onAbrir ? () => onAbrir(fila) : undefined
              const despues = primera.despues?.(fila)
              return (
                <tr
                  key={clave}
                  aria-selected={onAbrir ? seleccionada === clave : undefined}
                  onClick={abrir}
                  className={cn('group/fila', onAbrir && 'cursor-pointer', tono === 'apagada' && 'text-muted-foreground')}
                >
                  <th scope="row" className={cn(CLASE_CELDA, CLASE_FIJA, fondo, alto, 'z-[1] text-left font-medium', primera.ancho ?? 'min-w-[200px]')}>
                    {onAbrir ? (
                      <button
                        type="button"
                        aria-label={etiquetaFila?.(fila)}
                        onClick={(e) => {
                          e.stopPropagation()
                          onAbrir(fila)
                        }}
                        className="focus-ring max-w-full truncate rounded-sm text-left font-semibold hover:underline"
                      >
                        {primera.nombre(fila)}
                      </button>
                    ) : (
                      primera.nombre(fila)
                    )}
                    {despues && <span className="font-normal text-muted-foreground"> {despues}</span>}
                    {primera.debajo && <small className="block truncate text-xs leading-tight font-normal text-muted-foreground">{primera.debajo(fila)}</small>}
                  </th>
                  {columnas.map((c) => (
                    <td key={c.id} className={cn(CLASE_CELDA, fondo, alto, c.derecha && 'text-right', c.clase)}>
                      {c.celda(fila)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

/** The bordered region the table scrolls in, both ways, with 24px gutters (layout.md › Data region). */
export function RegionTabla({ etiqueta, children, className }: { readonly etiqueta: string; readonly children: ReactNode; readonly className?: string }): ReactElement {
  return (
    <div
      role="region"
      aria-label={etiqueta}
      tabIndex={0}
      className={cn(
        'focus-ring mx-6 overflow-auto rounded-md border border-border bg-card [scrollbar-color:color-mix(in_oklab,var(--muted-foreground)_40%,transparent)_transparent] [scrollbar-width:thin]',
        className,
      )}
    >
      {children}
    </div>
  )
}
