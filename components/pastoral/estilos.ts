/**
 * Shared class names for the pastoral screens (docs/design-system.md).
 */

/**
 * Destructive action. `BotonSistema` has no danger variant on this foundation
 * yet, so the primary variant is recolored; `bg-none` drops its gradient.
 */
export const CLASE_BOTON_PELIGRO =
  'bg-none bg-danger text-danger-foreground shadow-none hover:bg-danger/90 hover:shadow-none focus:ring-danger'

/**
 * A `next/link` that wraps a `BotonSistema` (rendered with `tabIndex={-1}`):
 * the link takes the focus, so it carries the control radius and focus ring.
 */
export const CLASE_ENLACE_BOTON =
  'inline-flex rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/** A list item surface nested inside a `TarjetaSistema`. */
export const CLASE_ITEM_LISTA = 'rounded-2xl border border-border bg-card p-4'
