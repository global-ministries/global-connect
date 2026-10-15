import * as React from "react"
import { cn } from "@/lib/utils"

type TonoAviso = "error" | "info" | "marca"

const TONOS: Record<TonoAviso, string> = {
  error: "border-danger/30 bg-danger/10 font-medium text-danger-text",
  info: "border-info/30 bg-info/5 text-foreground",
  marca: "border-brand/20 bg-[var(--brand-accent)] text-brand-text",
}

interface AvisoFormularioProps extends React.HTMLAttributes<HTMLDivElement> {
  tono?: TonoAviso
}

/**
 * Inline notice inside a form. `error` is announced (`role="alert"`); the other
 * tones are static notes.
 */
export function AvisoFormulario({ tono = "info", className, ...props }: AvisoFormularioProps) {
  return (
    <div
      role={tono === "error" ? "alert" : undefined}
      className={cn("rounded-xl border p-4 text-sm", TONOS[tono], className)}
      {...props}
    />
  )
}
