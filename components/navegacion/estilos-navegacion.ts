import { cn } from '@/lib/utils'

/**
 * Shared look of the navigation surfaces (sidebar, mobile drawer, bottom bar):
 * 44px targets, the active entry on `bg-brand-tint` with `text-brand-text`
 * (≥ 4.5:1 at body size, light and dark) and the focus-visible ring.
 * See docs/design-system.md, "Navigation".
 */

const BASE_INTERACTIVA = 'focus-ring touch-manipulation transition-[background-color,color,transform] duration-200 ease-expo'

/** A main entry: 44px tall, rounded like the other controls. */
export function claseEnlaceNav(activo: boolean): string {
  return cn(
    'group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 press-scale',
    BASE_INTERACTIVA,
    activo ? 'bg-brand-tint font-semibold text-brand-text' : 'text-foreground hover:bg-[var(--brand-accent)]',
  )
}

/** A child entry under an open section: also 44px, smaller text. */
export function claseSubEnlaceNav(activo: boolean): string {
  return cn(
    'group relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm',
    BASE_INTERACTIVA,
    activo
      ? 'bg-brand-tint font-semibold text-brand-text'
      : 'text-muted-foreground hover:bg-[var(--brand-accent)] hover:text-foreground',
  )
}

/** Icons stay `text-brand` when active (icons only need 3:1). */
export function claseIconoNav(activo: boolean): string {
  return cn(
    'shrink-0 transition-colors',
    activo ? 'text-brand' : 'text-muted-foreground group-hover:text-foreground',
  )
}

/** An icon-only button (menu, close, bell, chevrons): a 44px square. It needs an aria-label. */
export const CLASE_BOTON_ICONO_NAV = cn(
  'inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground press-scale',
  'hover:bg-[var(--brand-accent)] hover:text-foreground',
  BASE_INTERACTIVA,
)
