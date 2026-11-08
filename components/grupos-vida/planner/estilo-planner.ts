/**
 * Planner — the class strings of the planning style (S25) shared by the
 * Tablero cards (tarjeta-grupo.tsx) and the Lado a lado panes
 * (lado-a-lado.tsx), from the team columns of
 * docs/design-system/prototipos/planificacion-dps/01 (`.pt`, `.pr`, `.x`,
 * `.lnk`). Pieces the design system plans but has not built yet
 * (components.md › Planning style components), kept in one place so they
 * move together when it does.
 */

/** Role header row (`.pt`): `bg-muted` band, 12px / 600, the count in mono via CLASE_CUENTA_ROL. */
export const CLASE_CABEZA_ROL = 'flex justify-between gap-1.5 border-y border-border bg-muted py-1 pr-2.5 pl-3 text-xs font-semibold'

export const CLASE_CUENTA_ROL = 'font-mono font-medium tabular-nums text-muted-foreground'

/** A role without people: one 32px row of 13px text. */
export const CLASE_ROL_VACIO = 'flex min-h-8 items-center px-3 text-[13px]'

/** Person row (`.pr`): 32px (44px on touch), avatar + wrapping name, light divider between rows. */
export const CLASE_FILA_PERSONA =
  'group/fila flex min-h-8 min-w-0 items-start gap-2 py-1 pr-1 pl-2.5 pointer-coarse:min-h-11 [&+&]:border-t [&+&]:border-border/60'

/** The name line of a person row: 13px / 500, wraps (S23). */
export const CLASE_NOMBRE_FILA = 'break-words text-[13px] font-medium leading-[18px] text-foreground'

/** The text action (`.lnk`): brand text, no frame, 32px (44px on touch). */
export const CLASE_ACCION_TEXTO =
  'focus-ring inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-left text-[13px] font-medium text-brand-text transition-colors hover:bg-brand-tint disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11'

/** An icon action of a row (`.x`): shows on row hover or focus with a mouse, always on touch. */
export const CLASE_ACCION_FILA =
  'focus-ring grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-[opacity,background-color,color] hover:bg-accent hover:text-foreground group-hover/fila:opacity-100 focus-visible:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100'

/** Drop highlight of a zone inside a column (a role section, the bank sidebar). */
export const CLASE_SOBRE_DENTRO = 'ring-2 ring-inset ring-brand'

/** The options button of a column head (`.ch .btn`): 28px, always visible (44px on touch). */
export const CLASE_BOTON_ICONO =
  'focus-ring grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground pointer-coarse:size-11'

/**
 * Toolbar and sidebar controls at the 36px toolbar height (44px on touch):
 * InputSistema and SelectSistema have no `tamaño` yet, so the height comes in
 * through `className` (components.md gap, reported with T11b).
 */
export const CLASE_CONTROL_COMPACTO = 'h-9 text-sm pointer-coarse:h-11'

/** A data surface of the planning style: flat card, 1px border, `rounded-md`. */
export const CLASE_SUPERFICIE = 'overflow-hidden rounded-md border border-border bg-card'

/** Sidebar / panel section heading (`.ps h2`): 12px / 600 uppercase, `.08em`, muted. */
export const CLASE_TITULO_SECCION = 'text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground'

/** A row inside a data surface: 13px, light divider between rows. */
export const CLASE_FILA = 'min-w-0 text-[13px] [&+&]:border-t [&+&]:border-border/60'

/** Dialogs of the planning style (layout.md › Dialogs; foundations: 420px, 20px padding). */
export const CLASE_DIALOGO = 'max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto rounded-2xl bg-card p-5 shadow-sheet sm:max-w-[420px]'

/** Dialog title: 17px / 650. */
export const CLASE_TITULO_DIALOGO = 'text-[17px] font-[650] leading-snug tracking-[-0.01em]'
