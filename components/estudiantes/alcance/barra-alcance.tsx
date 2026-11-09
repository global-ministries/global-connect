/**
 * Estudiantes — the «barra de alcance» (gap B1 of
 * design/estudiantes-dps/README-tanda-b.md, decided in S7 / D2 and
 * documented in docs/design-system/layout.md › Scope bar). The context
 * sidebar of the wide layout (`.ps`: 200px on tablets, 240px from lg,
 * `bg-card border-r`, its own scroll) that, as the group types bar of PCO
 * Groups, holds the scope of the view with its numbers and changes it with
 * one click: the ámbitos and sub-áreas (`aria-current`), the attention
 * toggles (B6, `aria-pressed`) and, in Reportes, the funnel.
 *
 * - `BarraAlcance`: the `aside`, desktop only (phones get pills instead).
 * - `SeccionAlcance`: one section, a `group` named by its 12px uppercase
 *   heading, with an optional hint.
 * - `FilaAlcance`: a 32px row (44px on touch) with the name, the number in
 *   mono and an optional line below; a level row (`actual`) or a toggle
 *   (`pulsado`); without `onClick` it is plain text (a fixed scope).
 * Server-safe.
 */
import type { ReactElement, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function BarraAlcance({ etiqueta, children }: { readonly etiqueta: string; readonly children: ReactNode }): ReactElement {
  return (
    <aside
      aria-label={etiqueta}
      className="hidden w-[200px] shrink-0 overflow-y-auto border-r border-border bg-card md:block lg:w-60 [&>*+*]:border-t [&>*+*]:border-border"
    >
      {children}
    </aside>
  )
}

export interface SeccionAlcanceProps {
  readonly id: string
  readonly titulo: string
  /** Muted text after the heading ("Hoy", "toca para ver solo uno"). */
  readonly pista?: string
  readonly children: ReactNode
}

export function SeccionAlcance({ id, titulo, pista, children }: SeccionAlcanceProps): ReactElement {
  return (
    <div role="group" aria-labelledby={id} className="pt-2.5 pr-3 pb-3 pl-4">
      <h2 id={id} className="flex min-h-[26px] items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {titulo}
        {pista && <span className="truncate text-xs font-normal normal-case tracking-normal">{pista}</span>}
      </h2>
      {children}
    </div>
  )
}

export interface FilaAlcanceProps {
  readonly etiqueta: string
  /** The number at the right (mono). */
  readonly valor?: number | string
  /** `warning-text` on the number (groups without a leader, decisions missing). */
  readonly valorAviso?: boolean
  /** The muted line under the name. */
  readonly detalle?: ReactNode
  /** A sub-área under its ámbito (indented, 500). */
  readonly sub?: boolean
  /** A level of the scope: the current one has `aria-current`. */
  readonly actual?: boolean
  /** A toggle filter: `aria-pressed`. */
  readonly pulsado?: boolean
  readonly onClick?: () => void
  /** Extra content under the line (the % bar, tags). */
  readonly children?: ReactNode
  /** For a step that opens a panel. */
  readonly abrePanel?: boolean
}

const CLASE_FILA =
  '-ml-2 grid w-[calc(100%+8px)] min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-2 py-1 text-left text-foreground pointer-coarse:min-h-11'

export function FilaAlcance({ etiqueta, valor, valorAviso = false, detalle, sub = false, actual, pulsado, onClick, children, abrePanel = false }: FilaAlcanceProps): ReactElement {
  const elegida = actual === true || pulsado === true
  const contenido = (
    <>
      <b className={cn('min-w-0 truncate text-[13px]', sub ? 'font-medium' : 'font-semibold', elegida && 'text-brand-text')}>{etiqueta}</b>
      {valor !== undefined && (
        <span className={cn('font-mono text-xs tabular-nums', valorAviso ? 'font-semibold text-warning-text' : 'text-muted-foreground')}>{valor}</span>
      )}
      {detalle && <small className="col-span-2 text-xs text-muted-foreground">{detalle}</small>}
      {children && <span className="col-span-2 grid min-w-0 gap-1 pt-0.5">{children}</span>}
    </>
  )
  if (!onClick) return <div className={cn(CLASE_FILA, sub && 'pl-[22px]')}>{contenido}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={actual === undefined ? undefined : actual}
      aria-pressed={pulsado}
      aria-haspopup={abrePanel ? 'dialog' : undefined}
      className={cn(CLASE_FILA, 'focus-ring transition-colors hover:bg-accent', sub && 'pl-[22px]', elegida && 'bg-brand-tint hover:bg-brand-tint')}
    >
      {contenido}
    </button>
  )
}
