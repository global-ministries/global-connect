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

/*
 * Desktop and tablet sidebar (prototype design/app-shell, `.it`): an opaque
 * surface, muted entries, the current page on `bg-brand-tint` with foreground
 * text (no pill), and the parent of the current page in foreground.
 */
const BASE_SIDEBAR = 'focus-ring touch-manipulation transition-colors duration-150 ease-expo'

/** A main sidebar entry: 44px. `contiene`: the entry's group holds the current page. */
export function claseEntradaSidebar(activo: boolean, contiene = false): string {
  return cn(
    'group relative flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-sm',
    BASE_SIDEBAR,
    activo
      ? 'bg-brand-tint font-semibold text-foreground'
      : contiene
        ? 'font-medium text-foreground hover:bg-accent'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
  )
}

/** A submenu row: the sm control height (36px) on a fine pointer, 44px on touch. */
export function claseSubEntradaSidebar(activo: boolean): string {
  return cn(
    'flex min-h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-sm pointer-coarse:min-h-11',
    BASE_SIDEBAR,
    activo ? 'bg-brand-tint font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
  )
}

/** A 44px icon button of the shell chrome (collapse, chevrons, bell, rail campus). It needs an aria-label. */
export const CLASE_BOTON_ICONO_SHELL = cn(
  'inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground',
  'hover:bg-accent hover:text-foreground',
  BASE_SIDEBAR,
)

/** Floating layers of the shell (rail flyout, account and notifications popovers). */
export const CLASE_CAPA_FLOTANTE = 'rounded-2xl border border-border bg-card text-foreground shadow-sheet'
