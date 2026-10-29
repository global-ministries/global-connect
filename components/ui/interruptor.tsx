"use client"

/**
 * Interruptor — the on/off switch of the design system (docs/design-system/
 * components.md; prototype `.sw` in prototipos/estructura/07-b-escritorio.html).
 * A real button with `role="switch"` and `aria-checked`, a 44px target around a
 * 44×24 track. On: brand track. Off: muted-foreground at 55%, which keeps the
 * track at 3:1 against the surface. The tap reports the next state; the caller
 * owns it.
 */
import type { ButtonHTMLAttributes, ReactElement } from "react"

import { cn } from "@/lib/utils"

export interface InterruptorProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "role" | "type" | "onChange" | "aria-checked"> {
  readonly activo: boolean
  readonly onCambio: (activo: boolean) => void
  /** Names what it turns on and off ("Rol Coordinador"). */
  readonly "aria-label": string
}

export function Interruptor({ activo, onCambio, className, onClick, ...props }: InterruptorProps): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) onCambio(!activo)
      }}
      className={cn(
        "focus-ring inline-flex h-11 w-[52px] shrink-0 items-center justify-center rounded-xl touch-manipulation",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-6 w-11 items-center rounded-full p-[3px] transition-colors duration-150",
          activo ? "bg-brand" : "bg-muted-foreground/55"
        )}
      >
        <span
          className={cn(
            "size-[18px] rounded-full bg-background shadow-sm transition-transform duration-150 ease-out motion-reduce:transition-none",
            activo && "translate-x-5"
          )}
        />
      </span>
    </button>
  )
}
