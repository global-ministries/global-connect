/**
 * Shared class names for the Ayuda screens (docs/design-system.md).
 */

/** A status filter pill: 36px, 44px on touch screens; brand color when active. */
export function claseFiltro(activo: boolean) {
  return [
    'inline-flex h-9 items-center whitespace-nowrap rounded-xl px-3.5 text-sm font-medium transition-colors pointer-coarse:h-11 focus-ring',
    activo ? 'bg-[var(--brand-primary)] text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  ].join(' ')
}

/** Text link to a ticket ("Ver detalle", "Responder #N") with a 44px target. */
export const CLASE_ENLACE_DETALLE =
  'inline-flex min-h-11 items-center gap-1 rounded-xl text-sm font-medium text-[var(--brand-primary)] hover:underline focus-ring'

/** The brand tile that marks a ticket in lists (size classes added by the caller). */
export const CLASE_ICONO_TICKET =
  'flex shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-white'
