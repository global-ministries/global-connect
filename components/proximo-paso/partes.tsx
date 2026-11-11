/**
 * T8 (odd/tasks/proximo-paso.md; design/proximo-paso 01–09) — the pieces
 * the public /proximo-paso flow and the home card share: the calendar tile
 * of a Sunday, the line of the 4 Sundays, the highlighted edición card,
 * the time-and-place lines, the step header, the round seal and the sticky
 * bottom bar. Server-safe (no hooks), tokens only.
 */
import type { ReactElement, ReactNode } from 'react'
import { Clock, Info, MapPin, type LucideIcon } from 'lucide-react'

import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { diaDelMes, horaLegible, mesCorto } from '@/lib/platform/proximo-paso/formato'
import { fechaDomingo, type ClaseProximoPaso, type EdicionProximoPaso } from '@/lib/platform/talleres/proximo-paso-registro'
import { cn } from '@/lib/utils'

export const Num = ({ children }: { readonly children: ReactNode }) => (
  <span className="font-mono tabular-nums tracking-[-0.02em]">{children}</span>
)

/** The 44×48 tile of a Sunday: short month over the day. */
export function DiaCalendario({ fecha, tono = 'muted', className }: { readonly fecha: string; readonly tono?: 'muted' | 'marca'; readonly className?: string }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid h-12 w-11 shrink-0 content-center justify-items-center rounded-md leading-none',
        tono === 'marca' ? 'bg-brand-tint' : 'bg-muted',
        className,
      )}
    >
      <small className="text-xs font-semibold uppercase text-brand-text">{mesCorto(fecha)}</small>
      <b className="mt-[3px] font-mono text-[19px] font-[650] tabular-nums">{diaDelMes(fecha)}</b>
    </span>
  )
}

const DESCRIPCION_CLASE: Record<string, string> = {
  Sígueme: 'Qué significa seguir a Jesús',
  'Intimidad con Dios': 'La oración y la Biblia en tu día a día',
  Compañerismo: 'Crecer en comunidad',
  Influencia: 'Tus dones y dónde servir',
}

/** The 4 clases as a line of Sundays (01); with `sinFechas`, numbered without dates (07 · sin fechas). */
export function LineaDomingos({ clases, sinFechas = false }: { readonly clases: readonly ClaseProximoPaso[]; readonly sinFechas?: boolean }): ReactElement {
  return (
    <ol className="rounded-2xl bg-card px-3.5 py-1">
      {clases.map((c, i) => {
        const ultimo = i === clases.length - 1
        return (
          <li key={c.numero} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3.5 py-2.5">
            {/* The tile and the line under it share one centered column. */}
            <span className="relative flex h-full flex-col items-center justify-center self-stretch">
              {sinFechas ? (
                <span aria-hidden="true" className="grid size-11 place-items-center rounded-md bg-muted font-mono text-[19px] font-[650] tabular-nums">
                  {c.numero}
                </span>
              ) : (
                <DiaCalendario fecha={c.fecha} />
              )}
              {!ultimo && <span aria-hidden="true" className="absolute top-[calc(50%+30px)] -bottom-[14px] left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-border" />}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-muted-foreground">
                {sinFechas ? `Clase ${c.numero}` : `Clase ${c.numero} · domingo ${fechaDomingo(c.fecha)}`}
              </span>
              <span className="block text-base leading-tight font-semibold text-foreground">{c.tema ?? `Clase ${c.numero}`}</span>
              {c.tema && DESCRIPCION_CLASE[c.tema] && (
                <span className="mt-px block text-[13px] text-muted-foreground">{DESCRIPCION_CLASE[c.tema]}</span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Detalle({ icono: Icono, etiqueta, children }: { readonly icono: LucideIcon; readonly etiqueta: string; readonly children: ReactNode }) {
  return (
    <li className="flex min-w-0 items-start gap-2">
      <Icono aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="sr-only">{etiqueta}: </span>
        {children}
      </span>
    </li>
  )
}

/**
 * Time, place and notes of the edición (L24.3), one line each; nothing at
 * all when none is set.
 */
export function DetallesPracticos({ edicion, className }: { readonly edicion: Pick<EdicionProximoPaso, 'hora' | 'lugar' | 'indicaciones'>; readonly className?: string }): ReactElement | null {
  if (!edicion.hora && !edicion.lugar && !edicion.indicaciones) return null
  return (
    <ul aria-label="Hora y lugar" className={cn('grid gap-1.5 text-sm text-foreground', className)}>
      {edicion.hora && (
        <Detalle icono={Clock} etiqueta="Hora">
          <Num>{horaLegible(edicion.hora)}</Num>
        </Detalle>
      )}
      {edicion.lugar && (
        <Detalle icono={MapPin} etiqueta="Lugar">
          {edicion.lugar}
        </Detalle>
      )}
      {edicion.indicaciones && (
        <Detalle icono={Info} etiqueta="Indicaciones">
          <span className="text-muted-foreground">{edicion.indicaciones}</span>
        </Detalle>
      )}
    </ul>
  )
}

export function textoCupos(cupoRestante: number | null): string | null {
  if (cupoRestante === null) return null
  if (cupoRestante === 0) return 'Sin cupos'
  return cupoRestante === 1 ? 'Queda 1' : `Quedan ${cupoRestante}`
}

/** The highlighted next edición (01, 06): status, month, first Sunday, time and place, cupos and clases. */
export function TarjetaEdicion({
  edicion,
  estado = { tono: 'success', etiqueta: 'Inscripciones abiertas' },
  accion,
  children,
}: {
  readonly edicion: EdicionProximoPaso
  readonly estado?: { readonly tono: TonoEstado; readonly etiqueta: string }
  /** Small action at the top right («Cambiar fecha»). */
  readonly accion?: ReactNode
  readonly children?: ReactNode
}): ReactElement {
  const cupos = textoCupos(edicion.cupoRestante)
  return (
    <article aria-labelledby={`edicion-${edicion.id}`} className="rounded-2xl bg-brand-tint p-4 ring-[1.5px] ring-brand ring-inset">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <PuntoEstado tono={estado.tono} etiqueta={estado.etiqueta} />
        {accion}
      </div>
      <h2 id={`edicion-${edicion.id}`} className="mt-2.5 text-2xl leading-tight font-bold tracking-[-0.02em] text-foreground">
        {edicion.nombre}
      </h2>
      <p className="mt-0.5 text-[15px] text-foreground">{`Empieza el domingo ${fechaDomingo(edicion.fechaInicio)}`}</p>
      <DetallesPracticos edicion={edicion} className="mt-2" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        {cupos && (
          <div className="rounded-2xl border border-border/70 bg-card px-2.5 py-2">
            <small className="block text-xs text-muted-foreground">Cupos</small>
            <b className="text-[15px] font-semibold">{cupos}</b>
          </div>
        )}
        <div className="rounded-2xl border border-border/70 bg-card px-2.5 py-2">
          <small className="block text-xs text-muted-foreground">Clases</small>
          <b className="text-[15px] font-semibold">
            <Num>{edicion.clases.length || 4}</Num> domingos
          </b>
        </div>
      </div>
      {children}
    </article>
  )
}

/** "Paso 2 de 3 · Tus datos" with its 4px progress bar. */
export function EncabezadoPaso({ paso, total = 3, etiqueta }: { readonly paso: number; readonly total?: number; readonly etiqueta: string }): ReactElement {
  return (
    <div className="grid gap-2 px-1">
      <span className="text-[13px] font-medium text-muted-foreground">
        Paso <Num>{paso}</Num> de <Num>{total}</Num> · {etiqueta}
      </span>
      <span aria-hidden="true" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={cn('h-1 rounded-full', i < paso ? 'bg-brand' : 'bg-muted')} />
        ))}
      </span>
    </div>
  )
}

/** Large title with its line under it. */
export function Cabecera({ ceja, titulo, id, children }: { readonly ceja?: string; readonly titulo: string; readonly id?: string; readonly children?: ReactNode }): ReactElement {
  return (
    <div className="grid gap-2 px-1">
      {ceja && <span className="text-[13px] font-semibold tracking-[0.06em] text-brand-text uppercase">{ceja}</span>}
      <h1 id={id} className="text-[28px] leading-[1.1] font-bold tracking-[-0.03em] text-balance text-foreground">
        {titulo}
      </h1>
      {children && <p className="text-[15px] text-muted-foreground">{children}</p>}
    </div>
  )
}

const TONO_SELLO = {
  marca: 'bg-brand-tint text-brand-text',
  success: 'bg-success/15 text-success-text',
  warning: 'bg-warning/15 text-warning-text',
  muted: 'bg-muted text-muted-foreground',
} as const

/** The round icon above a state's title (04, 05, 07). */
export function Sello({ icono: Icono, tono = 'marca' }: { readonly icono: LucideIcon; readonly tono?: keyof typeof TONO_SELLO }): ReactElement {
  return (
    <span aria-hidden="true" className={cn('grid size-14 place-items-center rounded-full', TONO_SELLO[tono])}>
      <Icono className="size-7" />
    </span>
  )
}

/** Small uppercase heading of a section. */
export function TituloSeccion({ id, children }: { readonly id: string; readonly children: ReactNode }): ReactElement {
  return (
    <h2 id={id} className="mb-2 px-1 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </h2>
  )
}

/** The sticky bottom bar of the phone flow, with the safe area. */
export function BarraInferior({ children, className }: { readonly children: ReactNode; readonly className?: string }): ReactElement {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 -mx-4 mt-auto grid gap-1.5 border-t border-border bg-background/90 px-4 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-xl sm:-mx-6 sm:px-6',
        className,
      )}
    >
      {children}
    </div>
  )
}
