/**
 * Small pieces shared by the home sections (design/home-por-rol: `.sec-hd`,
 * `.tile`, `.cuenta`, `.lista`). Server-safe: no hooks, no handlers.
 */
import type { ReactElement, ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

import type { TonoEstado } from '@/components/ui/punto-estado'
import { cn } from '@/lib/utils'

/** Inset grouped list container (docs/design-system/mobile.md#inset-grouped-lists). */
export const CLASE_LISTA_INSET = 'min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card'

/** Hairline between rows, inset past a 36px tile (14px padding + 36px + 12px gap). */
export const CLASE_LINEA_FILA =
  'relative before:absolute before:top-0 before:right-0 before:left-[62px] before:h-px before:bg-border/60 first:before:hidden'

/** Desktop header crumb: the hero holds the page `h1`. */
export function MigasInicio(): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 items-center text-sm">
        <li>
          <span aria-current="page" className="px-2 py-1.5 font-semibold text-foreground">
            Inicio
          </span>
        </li>
      </ol>
    </nav>
  )
}

/** Small uppercase heading of a section (or, `nivel` 3, of a list inside it) plus an optional trailing link or count. */
export function EncabezadoSeccion({
  id,
  titulo,
  nivel = 2,
  children,
}: {
  readonly id: string
  readonly titulo: string
  readonly nivel?: 2 | 3
  readonly children?: ReactNode
}): ReactElement {
  const Titulo = nivel === 2 ? 'h2' : 'h3'
  return (
    <div className="mb-2 flex min-h-11 items-center gap-2 px-1">
      <Titulo id={id} className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {titulo}
      </Titulo>
      {children}
    </div>
  )
}

/** The trailing «Ver grupo» kind of link of a section heading. */
export function EnlaceSeccion({ href, children }: { readonly href: string; readonly children: ReactNode }): ReactElement {
  return (
    <Link href={href} className="focus-ring inline-flex min-h-11 shrink-0 items-center rounded-lg px-1 text-[15px] font-medium text-brand-text touch-manipulation">
      {children}
    </Link>
  )
}

const FONDO_TILE: Record<TonoEstado | 'marca', string> = {
  marca: 'bg-brand-tint text-brand-text',
  success: 'bg-success/15 text-success-text',
  warning: 'bg-warning/15 text-warning-text',
  info: 'bg-info/15 text-info-text',
  danger: 'bg-danger/15 text-danger-text',
  muted: 'bg-muted text-muted-foreground',
}

/** 36px rounded icon square; decorative. */
export function IconoTile({ icono: Icono, tono = 'marca' }: { readonly icono: LucideIcon; readonly tono?: TonoEstado | 'marca' }): ReactElement {
  return (
    <span aria-hidden="true" className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', FONDO_TILE[tono])}>
      <Icono className="size-5" />
    </span>
  )
}

/** Brand count pill; screen readers get `etiqueta` («, 5 pendientes») instead. */
export function Cuenta({ valor, etiqueta, className }: { readonly valor: number; readonly etiqueta: string; readonly className?: string }): ReactElement {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn('inline-grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-strong px-1.5 font-mono text-xs font-semibold tabular-nums text-brand-foreground', className)}
      >
        {valor}
      </span>
      <span className="sr-only">{etiqueta}</span>
    </>
  )
}

/** A number in mono (docs/design-system/foundations.md: numbers are `font-mono tabular-nums`). */
export const Numero = ({ children }: { readonly children: ReactNode }): ReactElement => <span className="font-mono tabular-nums">{children}</span>
