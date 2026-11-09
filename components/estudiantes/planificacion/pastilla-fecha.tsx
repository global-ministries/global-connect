/**
 * Estudiantes — the date pill "‹ Domingo 8 nov ›" of the band (planned
 * `PastillaFecha` of docs/design-system/components.md; `.dp` of
 * design/estudiantes-dps 02–07, the same look as the DPS plan header,
 * components/dps/encabezado-plan.tsx). It steps between dates that exist:
 * each step names where it goes, a missing one is disabled and says why.
 * 30px steps, 44px to the touch. Server-safe.
 */
import type { ReactElement, ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

const CLASE_PASO =
  'focus-ring grid size-[30px] shrink-0 touch-manipulation place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent pointer-coarse:size-11'

export interface PasoFecha {
  /** Accessible name: "Reunión anterior, domingo 18 oct". */
  readonly etiqueta: string
  readonly onIr: () => void
}

export interface PastillaFechaProps {
  /** Name of the group ("Reunión", "Fecha"). */
  readonly etiqueta: string
  readonly children: ReactNode
  readonly anterior: PasoFecha | null
  readonly siguiente: PasoFecha | null
  /** Name of the disabled ‹ ("No hay reuniones anteriores"). */
  readonly sinAnterior: string
  /** Name of the disabled › ("Es la reunión más reciente"). */
  readonly sinSiguiente: string
  readonly className?: string
}

function Paso({ paso, sin, Icono }: { readonly paso: PasoFecha | null; readonly sin: string; readonly Icono: typeof ChevronLeft }): ReactElement {
  return (
    <button type="button" disabled={!paso} aria-label={paso?.etiqueta ?? sin} onClick={paso?.onIr} className={CLASE_PASO}>
      <Icono aria-hidden="true" className="size-3.5" />
    </button>
  )
}

export function PastillaFecha({ etiqueta, children, anterior, siguiente, sinAnterior, sinSiguiente, className }: PastillaFechaProps): ReactElement {
  return (
    <div role="group" aria-label={etiqueta} className={cn('inline-flex max-w-full items-center rounded-full border border-border bg-background text-[13px] font-medium', className)}>
      <Paso paso={anterior} sin={sinAnterior} Icono={ChevronLeft} />
      <span className="min-w-0 truncate px-1.5">{children}</span>
      <Paso paso={siguiente} sin={sinSiguiente} Icono={ChevronRight} />
    </div>
  )
}
