/**
 * Niños › Eventos — small pieces of the screen (artboard
 * design/ninos-checkin-pco/01-admin-eventos.html): breadcrumbs, hero with the
 * summary line, the data card of the planning style (`.cd`: card surface,
 * `rounded-md`, 12px uppercase heading) and the autosave status (`.sv`).
 */
import type { ReactElement, ReactNode } from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'

import { TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { cn } from '@/lib/utils'

import type { EstadoGuardado } from './use-guardado'

export function MigasEventos(): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
        <li className="truncate px-2 py-1.5 text-muted-foreground">Niños</li>
        <li className="flex min-w-0 items-center gap-0.5">
          <span aria-hidden="true" className="px-0.5 text-muted-foreground">
            /
          </span>
          <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">
            Eventos
          </span>
        </li>
      </ol>
    </nav>
  )
}

/** Title and summary: the 24px `h1` from md, the large title on phones. */
export function EncabezadoEventos({ resumen }: { readonly resumen: ReactNode }): ReactElement {
  return (
    <div data-testid="resumen-eventos" className="min-w-0">
      <div className="md:hidden">
        <TituloGrande titulo="Eventos de check-in" resumen={resumen} />
      </div>
      <div className="hidden min-w-0 md:block">
        <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">Eventos de check-in</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">{resumen}</p>
      </div>
    </div>
  )
}

/** A data surface with its 12px uppercase heading and an optional action on the right. */
export function TarjetaDatos({
  id,
  titulo,
  accion,
  children,
  className,
}: {
  readonly id: string
  readonly titulo: ReactNode
  readonly accion?: ReactNode
  readonly children: ReactNode
  readonly className?: string
}): ReactElement {
  return (
    <section aria-labelledby={id} className={cn('min-w-0 overflow-hidden rounded-md border border-border bg-card', className)}>
      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border py-1.5 pl-3 pr-2">
        <h3 id={id} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {titulo}
        </h3>
        {accion}
      </div>
      {children}
    </section>
  )
}

/** "Guardando…" → check + "Guardado"; on failure the RPC's sentence in `danger-text`. */
export function EstadoGuardadoVista({ estado, error }: { readonly estado: EstadoGuardado; readonly error: string | null }): ReactElement | null {
  if (estado === 'inactivo') return null
  return (
    <p className={cn('inline-flex min-w-0 items-center gap-1.5 text-xs', estado === 'error' ? 'text-danger-text' : 'text-muted-foreground')}>
      {estado === 'guardando' && <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />}
      {estado === 'guardado' && <Check aria-hidden="true" className="size-3.5" />}
      {estado === 'error' && <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />}
      <span className="min-w-0">{estado === 'guardando' ? 'Guardando…' : estado === 'guardado' ? 'Guardado' : `No se pudo guardar · ${error ?? ''}`}</span>
    </p>
  )
}

/** A number in mono, as every count of the screen. */
export function Num({ children }: { readonly children: ReactNode }): ReactElement {
  return <strong className="font-mono font-semibold tabular-nums tracking-[-0.02em]">{children}</strong>
}
