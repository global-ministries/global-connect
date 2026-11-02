'use client'

/**
 * Estudiantes › Reportes — «Embudo de conexión» (S18, L48 "Foto de hoy", L49
 * names; gap GR1 `EmbudoEtapas` under "Planned components" in
 * docs/design-system/components.md): Sin grupo → En grupo → Sirviendo for
 * the ámbito (and sub-área) today; the date range does not change it.
 *
 * Each step is a button that opens its list in the drawer
 * (`aria-haspopup="dialog"`). From md: cards with the `MetricasAtencion` look
 * (name, value in mono, definition, brand bar, conversion) and a decorative
 * arrow between them. Phone: inset grouped rows (name, definition,
 * conversion, value, chevron). Foyer / Living Room / Kitchen are the plan's
 * internal names and never show.
 */
import type { ReactElement } from 'react'
import { ArrowRight, ChevronRight } from 'lucide-react'

import { textoPorcentaje, type IdEtapa, type PasoEmbudo } from '@/lib/platform/estudiantes/reportes'
import { cn } from '@/lib/utils'

export interface EmbudoConexionProps {
  readonly pasos: readonly PasoEmbudo[]
  readonly onAbrir: (id: IdEtapa) => void
}

const minuscula = (texto: string): string => texto.charAt(0).toLocaleLowerCase('es') + texto.slice(1)

export function EmbudoConexion({ pasos, onAbrir }: EmbudoConexionProps): ReactElement {
  return (
    <ul
      aria-label="Embudo de conexión"
      className="min-w-0 overflow-hidden rounded-2xl bg-card md:grid md:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)_40px_minmax(0,1fr)] md:overflow-visible md:rounded-none md:bg-transparent"
    >
      {pasos.map((paso, i) => (
        <PasoItem key={paso.id} paso={paso} primero={i === 0} onAbrir={onAbrir} />
      ))}
    </ul>
  )
}

function PasoItem({ paso, primero, onAbrir }: { readonly paso: PasoEmbudo; readonly primero: boolean; readonly onAbrir: (id: IdEtapa) => void }): ReactElement {
  const conversion = textoPorcentaje(paso.conversion)
  const nombre = `${paso.nombre}: ${paso.cantidad} ${paso.cantidad === 1 ? 'persona' : 'personas'}, ${minuscula(paso.definicion)}. ${conversion} ${paso.conversionTexto}. Ver la lista.`
  return (
    <>
      {!primero && (
        <li aria-hidden="true" className="hidden place-items-center text-muted-foreground md:grid">
          <ArrowRight className="size-5" />
        </li>
      )}
      <li className="relative min-w-0">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={nombre}
          onClick={() => onAbrir(paso.id)}
          className={cn(
            'focus-ring relative grid min-h-16 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-2.5 gap-y-0.5 px-3.5 py-3 text-left transition-colors touch-manipulation active:bg-accent',
            'md:h-full md:grid-cols-1 md:content-start md:gap-2.5 md:rounded-2xl md:border md:border-border md:bg-card md:p-4 md:hover:bg-accent md:active:bg-accent',
            !primero && 'before:absolute before:top-0 before:right-0 before:left-3.5 before:h-px before:bg-border/60 md:before:hidden',
          )}
        >
          <span className="col-start-1 row-start-1 flex min-w-0 items-center justify-between gap-2">
            <span className="truncate text-base font-semibold text-foreground md:text-[15px]">{paso.nombre}</span>
            <ChevronRight aria-hidden="true" className="hidden size-4 shrink-0 text-muted-foreground md:block" />
          </span>
          <span className="col-start-2 row-span-3 row-start-1 font-mono text-xl font-semibold tabular-nums text-foreground md:col-start-1 md:row-span-1 md:row-start-2 md:text-3xl md:leading-none">
            {paso.cantidad}
          </span>
          <span className="col-start-1 row-start-2 min-w-0 text-[13px] text-muted-foreground md:row-start-3 md:text-sm md:text-foreground">{paso.definicion}</span>
          <span aria-hidden="true" className="hidden h-1 overflow-hidden rounded-full bg-muted md:row-start-4 md:block">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round(paso.conversion ?? 0)}%` }} />
          </span>
          <span className="col-start-1 row-start-3 min-w-0 text-[13px] text-muted-foreground md:row-start-5">
            <strong className="font-mono font-semibold tabular-nums text-foreground">{conversion}</strong> {paso.conversionTexto}
          </span>
          <ChevronRight aria-hidden="true" className="col-start-3 row-span-3 row-start-1 size-4 text-muted-foreground md:hidden" />
        </button>
      </li>
    </>
  )
}
