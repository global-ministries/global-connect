import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { TarjetaSistema } from "@/components/ui/sistema-diseno"
import { cn } from "@/lib/utils"

/**
 * Field grids for form sections. They follow the section width (container
 * queries), not the viewport, so the same form reads well on a full-width page,
 * a `max-w-3xl` form page or a side panel. One column below 512px.
 */
export const COLUMNAS_CAMPOS = {
  2: "grid gap-4 @lg:grid-cols-2",
  3: "grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-3",
  4: "grid gap-4 @lg:grid-cols-2 @5xl:grid-cols-4",
} as const

interface SeccionFormularioProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  titulo: string
  descripcion?: React.ReactNode
  icono?: LucideIcon
  /**
   * `true` (default): the section is its own card, for forms placed straight on
   * the page. `false`: a plain section, for forms the page already wraps in a
   * card (no cards inside cards).
   */
  tarjeta?: boolean
}

/**
 * A labelled form section: `<h2>` title, optional icon and description, and a
 * `@container` body for `COLUMNAS_CAMPOS` grids.
 */
export function SeccionFormulario({
  titulo,
  descripcion,
  icono: Icono,
  tarjeta = true,
  className,
  children,
  ...props
}: SeccionFormularioProps) {
  const idTitulo = React.useId()

  const contenido = (
    <>
      <header className="mb-4 flex items-start gap-3 sm:mb-6">
        {Icono && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-accent)] text-brand">
            <Icono className="size-5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 space-y-1 self-center">
          <h2 id={idTitulo} className="text-lg font-semibold text-foreground">
            {titulo}
          </h2>
          {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
        </div>
      </header>
      {children}
    </>
  )

  if (!tarjeta) {
    return (
      <section aria-labelledby={idTitulo} className={cn("@container", className)} {...props}>
        {contenido}
      </section>
    )
  }

  return (
    <TarjetaSistema
      role="region"
      aria-labelledby={idTitulo}
      className={cn("@container p-4 sm:p-6", className)}
      {...props}
    >
      {contenido}
    </TarjetaSistema>
  )
}
