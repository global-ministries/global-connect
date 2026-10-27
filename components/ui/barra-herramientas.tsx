'use client'

/**
 * BarraHerramientas — the toolbar of a list screen (docs/design-system/
 * patterns.md#toolbar-and-filters-sheet; prototype `.toolbar`, `.search`,
 * `.chips`): search with the "/" shortcut on desktop, the "Filtros" button
 * with the active count, and a slot for the view switch (`ControlSegmentado`).
 *
 * Below md the search fills the width (filled, no border) and the Filtros
 * button and view slot hide: the screen puts `BotonFiltrosMovil` in the
 * `BarraNavegacionMovil` actions and the view options in `HojaFiltros`.
 * `ChipsFiltrosActivos` goes above the list.
 */
import * as React from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'

/** The phone/desktop cut of the app (docs/design-system/migration.md, decision 8). */
const CONSULTA_ESCRITORIO = '(min-width: 768px)'

// Without matchMedia (old browsers, some tests) behave as desktop, like DetalleResponsivo.
const esEscritorio = () =>
  typeof window.matchMedia !== 'function' || window.matchMedia(CONSULTA_ESCRITORIO).matches

function escribiendoEnOtroCampo(objetivo: EventTarget | null): boolean {
  if (!(objetivo instanceof HTMLElement)) return false
  return objetivo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(objetivo.tagName)
}

/** "Filtros", or "Filtros, N activos" when filters are on. */
function nombreFiltros(filtrosActivos: number): string {
  if (filtrosActivos <= 0) return 'Filtros'
  return `Filtros, ${filtrosActivos} ${filtrosActivos === 1 ? 'activo' : 'activos'}`
}

function InsigniaCuenta({ cantidad, className }: { readonly cantidad: number; readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 font-mono text-xs font-semibold tabular-nums text-brand-foreground',
        className,
      )}
    >
      {cantidad}
    </span>
  )
}

export interface BusquedaBarra {
  readonly valor: string
  readonly onCambio: (valor: string) => void
  /** e.g. "Buscar por nombre o teléfono". */
  readonly placeholder: string
  /** Accessible name of the search box, e.g. "Buscar servidores". */
  readonly etiqueta: string
}

export interface BarraHerramientasProps {
  readonly busqueda: BusquedaBarra
  /** Filters applied from the sheet; shown as a badge on "Filtros". */
  readonly filtrosActivos: number
  readonly onAbrirFiltros: () => void
  /** View switch, usually a `ControlSegmentado`; desktop and tablet only. */
  readonly vista?: React.ReactNode
  readonly className?: string
}

export function BarraHerramientas({ busqueda, filtrosActivos, onAbrirFiltros, vista, className }: BarraHerramientasProps) {
  const campo = React.useRef<HTMLInputElement>(null)

  // "/" focuses the search on desktop, unless the user is typing somewhere else.
  React.useEffect(() => {
    function alPulsar(evento: KeyboardEvent) {
      if (evento.key !== '/' || evento.defaultPrevented) return
      if (evento.metaKey || evento.ctrlKey || evento.altKey) return
      if (escribiendoEnOtroCampo(evento.target) || !esEscritorio()) return
      evento.preventDefault()
      campo.current?.focus()
    }
    document.addEventListener('keydown', alPulsar)
    return () => document.removeEventListener('keydown', alPulsar)
  }, [])

  return (
    <section aria-label="Buscar y filtrar" className={cn('flex flex-wrap items-center gap-2.5', className)}>
      <div className="min-w-0 flex-[1_1_100%] md:flex-[1_1_280px]">
        <InputSistema
          ref={campo}
          type="search"
          icono={Search}
          aria-label={busqueda.etiqueta}
          placeholder={busqueda.placeholder}
          value={busqueda.valor}
          onChange={(evento) => busqueda.onCambio(evento.target.value)}
          accesorio={
            <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground md:inline-flex">
              /
            </kbd>
          }
          className="max-md:h-10 max-md:border-transparent max-md:bg-foreground/8"
        />
      </div>
      <BotonSistema
        type="button"
        variante="outline"
        icono={SlidersHorizontal}
        aria-label={nombreFiltros(filtrosActivos)}
        onClick={onAbrirFiltros}
        className="hidden md:inline-flex"
      >
        Filtros
        {filtrosActivos > 0 && <InsigniaCuenta cantidad={filtrosActivos} />}
      </BotonSistema>
      {vista && <div className="hidden md:flex">{vista}</div>}
    </section>
  )
}

export interface BotonFiltrosMovilProps {
  readonly filtrosActivos: number
  readonly onClick: () => void
}

/** The phone Filtros button for the `BarraNavegacionMovil` actions slot: 44px icon with a count badge. */
export function BotonFiltrosMovil({ filtrosActivos, onClick }: BotonFiltrosMovilProps) {
  return (
    <button
      type="button"
      aria-label={nombreFiltros(filtrosActivos)}
      onClick={onClick}
      className="focus-ring relative inline-flex size-11 items-center justify-center rounded-xl text-brand-text touch-manipulation active:bg-accent"
    >
      <SlidersHorizontal aria-hidden="true" className="size-[22px]" />
      {filtrosActivos > 0 && <InsigniaCuenta cantidad={filtrosActivos} className="absolute top-1 right-0.5" />}
    </button>
  )
}

export interface ChipFiltro {
  readonly id: string
  readonly etiqueta: string
}

export interface ChipsFiltrosActivosProps {
  readonly chips: readonly ChipFiltro[]
  readonly onQuitar: (id: string) => void
  readonly onLimpiarTodo: () => void
  readonly className?: string
}

/**
 * One brand-tint chip per active filter, each with "Quitar …", plus "Limpiar
 * todo" from two chips up. One scrolling row on phone; wraps from md.
 */
export function ChipsFiltrosActivos({ chips, onQuitar, onLimpiarTodo, className }: ChipsFiltrosActivosProps) {
  if (chips.length === 0) return null

  return (
    <div
      role="group"
      aria-label="Filtros activos"
      className={cn(
        'flex items-center gap-2 overflow-x-auto px-0.5 [scrollbar-width:none] md:flex-wrap md:overflow-visible md:px-0',
        className,
      )}
    >
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-brand/40 bg-brand-tint py-0 pr-1 pl-3 text-[13px] text-foreground"
        >
          {chip.etiqueta}
          <button
            type="button"
            aria-label={`Quitar ${chip.etiqueta}`}
            onClick={() => onQuitar(chip.id)}
            // 28px visible; the pseudo-element grows the touch target to 44px.
            className="focus-ring relative grid size-7 place-items-center rounded-full text-muted-foreground touch-manipulation after:absolute after:-inset-2 hover:text-foreground"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={onLimpiarTodo}
          className="focus-ring shrink-0 whitespace-nowrap rounded-md px-1 text-[13px] text-muted-foreground underline underline-offset-[3px] touch-manipulation hover:text-foreground pointer-coarse:min-h-11"
        >
          Limpiar todo
        </button>
      )}
    </div>
  )
}
