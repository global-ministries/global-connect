import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { TarjetaSistema } from "@/components/ui/sistema-diseno"
import { cn } from "@/lib/utils"

interface SeccionFormularioProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  titulo: string
  descripcion?: React.ReactNode
  icono?: LucideIcon
}

/**
 * A labelled form section card: `<h2>` title, optional icon and description,
 * and the section body (usually a `CamposSistema` grid). Place it as a direct
 * child of `SeccionesSistema`; `col-span-full` makes it take the whole row.
 */
export function SeccionFormulario({
  titulo,
  descripcion,
  icono: Icono,
  className,
  children,
  ...props
}: SeccionFormularioProps) {
  const idTitulo = React.useId()

  return (
    <TarjetaSistema
      role="region"
      aria-labelledby={idTitulo}
      className={cn("p-4 sm:p-6", className)}
      {...props}
    >
      <header className="mb-4 flex items-start gap-3 sm:mb-6">
        {Icono && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-accent)] text-brand">
            <Icono className="size-5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 space-y-1 self-center">
          <h2 id={idTitulo} className="break-words text-lg font-semibold text-foreground">
            {titulo}
          </h2>
          {descripcion && <p className="break-words text-sm text-muted-foreground">{descripcion}</p>}
        </div>
      </header>
      {children}
    </TarjetaSistema>
  )
}
