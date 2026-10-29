'use client'

/**
 * Estudiantes — inset list rows inside a drawer, composed from the phone row
 * of `ListaResponsiva` (rounded card, hairlines inset past the avatar,
 * docs/design-system/mobile.md#inset-grouped-lists). They cover gaps of
 * design/estudiantes-asistencia/README.md until the system has them (listed
 * under "Planned components" in docs/design-system/components.md):
 * - G6 `FilaInset`: a read-only row (a visitor of the roster).
 * - G7 `FilaInset` with `accion` (a trailing "Quitar" / "Agregar") and
 *   `FilaAgregar` (the "Asignar líder" / "Agregar integrante" row).
 * - G9 `FilaSeleccion`: a multi-select row with a native checkbox.
 * `FilaNavegable` is the row that opens another view of the drawer (G8).
 */
import type { ReactElement, ReactNode } from 'react'
import { ChevronRight, Plus } from 'lucide-react'

import { cn } from '@/lib/utils'

const CLASE_FILA = 'relative flex min-h-[52px] w-full min-w-0 items-center gap-3 px-3.5 py-2 text-left'
// Hairline between rows, inset past the 40px avatar (14px padding + 40px + 12px gap).
const CLASE_LINEA = 'before:absolute before:top-0 before:right-0 before:left-[66px] before:h-px before:bg-border/60 first:before:hidden'
const CLASE_LINEA_TEXTO = 'before:absolute before:top-0 before:right-0 before:left-3.5 before:h-px before:bg-border/60 first:before:hidden'

export function ListaInset({ etiqueta, children, className }: { readonly etiqueta: string; readonly children: ReactNode; readonly className?: string }): ReactElement {
  return (
    <ul aria-label={etiqueta} className={cn('min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card', className)}>
      {children}
    </ul>
  )
}

function Texto({ titulo, subtitulo }: { readonly titulo: string; readonly subtitulo?: ReactNode }): ReactElement {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[15px] font-semibold text-foreground">{titulo}</span>
      {subtitulo && <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{subtitulo}</span>}
    </span>
  )
}

export interface FilaInsetProps {
  readonly avatar?: ReactNode
  readonly titulo: string
  readonly subtitulo?: ReactNode
  /** Trailing action (a `BotonSistema ghost sm`) or a badge. */
  readonly accion?: ReactNode
}

/** G6 / G7: a row that opens nothing; `accion` sits at its end. */
export function FilaInset({ avatar, titulo, subtitulo, accion }: FilaInsetProps): ReactElement {
  return (
    <li className={cn(CLASE_FILA, avatar ? CLASE_LINEA : CLASE_LINEA_TEXTO)}>
      {avatar}
      <Texto titulo={titulo} subtitulo={subtitulo} />
      {accion && <span className="shrink-0">{accion}</span>}
    </li>
  )
}

export interface FilaNavegableProps {
  readonly avatar?: ReactNode
  readonly titulo: string
  readonly subtitulo?: ReactNode
  readonly etiqueta: string
  readonly onAbrir: () => void
}

/** G8: a row that opens another view of the drawer (chevron, 52px, pressed state). */
export function FilaNavegable({ avatar, titulo, subtitulo, etiqueta, onAbrir }: FilaNavegableProps): ReactElement {
  return (
    <li className={cn('relative', avatar ? CLASE_LINEA : CLASE_LINEA_TEXTO)}>
      <button
        type="button"
        aria-label={etiqueta}
        onClick={onAbrir}
        className={cn(CLASE_FILA, 'focus-ring touch-manipulation transition-colors active:bg-accent md:hover:bg-accent/50')}
      >
        {avatar}
        <Texto titulo={titulo} subtitulo={subtitulo} />
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  )
}

/** G7: the "Agregar …" row at the top of a list (plus icon and label in brand text). */
export function FilaAgregar({ etiqueta, onClick }: { readonly etiqueta: string; readonly onClick: () => void }): ReactElement {
  return (
    <li className={cn('relative', CLASE_LINEA)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(CLASE_FILA, 'focus-ring touch-manipulation font-semibold text-brand-text transition-colors active:bg-accent md:hover:bg-accent/50')}
      >
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-tint">
          <Plus className="size-5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px]">{etiqueta}</span>
      </button>
    </li>
  )
}

export interface FilaSeleccionProps {
  readonly id: string
  readonly avatar?: ReactNode
  readonly titulo: string
  readonly subtitulo?: ReactNode
  readonly marcada: boolean
  readonly onCambio: (marcada: boolean) => void
}

/** G9: one row of a multi-select list; the whole row is the checkbox's label. */
export function FilaSeleccion({ id, avatar, titulo, subtitulo, marcada, onCambio }: FilaSeleccionProps): ReactElement {
  return (
    <li className={cn('relative', avatar ? CLASE_LINEA : CLASE_LINEA_TEXTO)}>
      <label
        htmlFor={id}
        className={cn(
          CLASE_FILA,
          'cursor-pointer touch-manipulation transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-brand',
          marcada && 'bg-brand-tint',
        )}
      >
        <input
          id={id}
          type="checkbox"
          checked={marcada}
          onChange={(evento) => onCambio(evento.target.checked)}
          className="size-5 shrink-0 accent-[var(--brand-strong)] outline-none"
        />
        {avatar}
        <Texto titulo={titulo} subtitulo={subtitulo} />
      </label>
    </li>
  )
}

/** Section heading of a drawer ("Integrantes · 12"): 12px uppercase, muted, the count in mono. */
export function TituloSeccion({ id, texto, cantidad, pista }: { readonly id: string; readonly texto: string; readonly cantidad?: number; readonly pista?: ReactNode }): ReactElement {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3">
      <h3 id={id} className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {texto}
        {cantidad !== undefined && (
          <>
            {' · '}
            <span className="font-mono tabular-nums">{cantidad}</span>
          </>
        )}
      </h3>
      {pista && <span className="shrink-0 text-xs text-muted-foreground">{pista}</span>}
    </div>
  )
}
