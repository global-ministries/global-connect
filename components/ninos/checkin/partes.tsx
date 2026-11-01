/**
 * Niños › Check-in — small pieces shared by the sections of the desk screen
 * (prototypes docs/design-system/prototipos/ninos/01 and 04): the section
 * heading (12px uppercase, count, hint), the inset grouped list, the initials
 * avatar, the salón occupancy line and "Pueden retirar". Composed from the
 * system tokens like components/estudiantes/filas-inset.tsx; no new visual
 * style.
 */
import type { ReactElement, ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'

import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { estadoCupo, iniciales, type EstadoCupo, type OcupacionSalon, type PersonaRetiro } from '@/lib/platform/ninos/checkin-vista'
import { cn } from '@/lib/utils'

export const TONO_CUPO: Record<EstadoCupo, TonoEstado> = { libre: 'success', casi: 'warning', lleno: 'danger' }
export const TEXTO_CUPO: Record<EstadoCupo, string> = { libre: '', casi: 'casi lleno', lleno: 'lleno' }

export interface TituloSeccionProps {
  readonly id: string
  readonly texto: ReactNode
  readonly cantidad?: number
  /** Accessible name of the count ("3 familias"). */
  readonly etiquetaCantidad?: string
  readonly pista?: string
}

export function TituloSeccion({ id, texto, cantidad, etiquetaCantidad, pista }: TituloSeccionProps): ReactElement {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 px-1">
      <h2 id={id} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {texto}
        {cantidad !== undefined && cantidad > 0 && (
          <span
            aria-label={etiquetaCantidad}
            className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-brand-strong px-1.5 font-mono text-xs font-semibold tabular-nums tracking-normal text-brand-foreground"
          >
            {cantidad}
          </span>
        )}
      </h2>
      {pista && <span className="min-w-0 truncate text-[13px] text-muted-foreground">{pista}</span>}
    </div>
  )
}

export function ListaInset({ etiqueta, children, className }: { readonly etiqueta: string; readonly children: ReactNode; readonly className?: string }): ReactElement {
  return (
    <ul aria-label={etiqueta} className={cn('min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card', className)}>
      {children}
    </ul>
  )
}

/** Hairline between rows of a ListaInset, inset past the 40px avatar. */
export const CLASE_LINEA_INSET = 'relative before:absolute before:top-0 before:right-0 before:left-[66px] before:h-px before:bg-border/60 first:before:hidden'

export function Avatar({ nombre, apellido }: { readonly nombre: string; readonly apellido: string }): ReactElement {
  return (
    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-[13px] font-semibold text-brand-text">
      {iniciales(nombre, apellido)}
    </span>
  )
}

/** "Preescolar 16/18" with its status dot; the state is also in words for screen readers. */
export function CupoSalon({ nombre, ocupacion }: { readonly nombre: string; readonly ocupacion: OcupacionSalon | undefined }): ReactElement {
  if (!ocupacion) return <span className="min-w-0 truncate">{nombre}</span>
  const estado = estadoCupo(ocupacion.presentes, ocupacion.capacidad)
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <PuntoEstado tono={TONO_CUPO[estado]} />
      <span className="min-w-0 truncate">
        {nombre}{' '}
        <span className="font-mono tabular-nums">
          {ocupacion.presentes}/{ocupacion.capacidad}
        </span>
        {TEXTO_CUPO[estado] && <span className="sr-only">, {TEXTO_CUPO[estado]}</span>}
      </span>
    </span>
  )
}

/** The "Lleno 12/12" tag next to a child whose salón is full: a warning, never a block. */
export function EtiquetaLleno({ ocupacion }: { readonly ocupacion: OcupacionSalon }): ReactElement {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-danger/40 bg-danger/10 px-2 text-xs font-medium leading-[22px] text-danger-text">
      Lleno{' '}
      <span className="font-mono tabular-nums">
        {ocupacion.presentes}/{ocupacion.capacidad}
      </span>
    </span>
  )
}

/** "Pueden retirar: Ana Pérez (representante), Rosa Pérez (abuela)". */
export function PuedenRetirar({ personas, className }: { readonly personas: readonly PersonaRetiro[]; readonly className?: string }): ReactElement | null {
  if (personas.length === 0) return null
  return (
    <p className={cn('flex min-w-0 items-start gap-2 text-left text-[13px] text-muted-foreground', className)}>
      <ShieldCheck aria-hidden="true" className="mt-px size-4 shrink-0" />
      <span>
        Pueden retirar:{' '}
        {personas.map((r, i) => (
          <span key={r.nombre}>
            {i > 0 && ', '}
            <b className="font-medium text-foreground">{r.nombre}</b>
            {r.relacion && ` (${r.relacion.toLowerCase()})`}
          </span>
        ))}
      </span>
    </p>
  )
}

/** A key hint ("/", "Enter", "Esc"), desktop only: callers add `hidden lg:inline-grid` or hide its row. */
export function Tecla({ children, className }: { readonly children: ReactNode; readonly className?: string }): ReactElement {
  return (
    <kbd
      className={cn(
        'inline-grid h-[22px] min-w-[22px] place-items-center rounded-md border border-border bg-card px-1.5 font-mono text-[11px] font-medium text-muted-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

/** "Enter registra a los niños marcados" under the main action, desktop only. */
export function PistaTecla({ tecla, texto }: { readonly tecla: string; readonly texto: string }): ReactElement {
  return (
    <p aria-hidden="true" className="-mt-1.5 hidden items-center justify-center gap-1.5 text-xs text-muted-foreground lg:flex">
      <Tecla>{tecla}</Tecla> {texto}
    </p>
  )
}
