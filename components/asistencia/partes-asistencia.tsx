import * as React from "react"
import Link from "next/link"
import { ChevronRight, type LucideIcon } from "lucide-react"
import { TarjetaSistema } from "@/components/ui/sistema-diseno"
import { cn } from "@/lib/utils"

type TonoKpi = "marca" | "info" | "exito" | "peligro" | "neutro"

const TONOS_ICONO: Record<TonoKpi, string> = {
  marca: "bg-[var(--brand-accent)] text-[var(--brand-primary)]",
  info: "bg-info/10 text-info",
  exito: "bg-success/10 text-success",
  peligro: "bg-danger/10 text-danger",
  neutro: "bg-muted text-muted-foreground",
}

/** Underlined text link for names inside attendance cards and lists. */
export const CLASE_ENLACE_ASISTENCIA =
  "rounded-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors duration-200 hover:decoration-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"

interface TarjetaKpiAsistenciaProps {
  icono: LucideIcon
  tono: TonoKpi
  etiqueta: string
  /** A number reads large and tabular; text (a name) reads small and truncates. */
  valor: React.ReactNode
  tipoValor?: "numero" | "texto"
  detalle?: React.ReactNode
  /** Makes the whole card a link, with a trailing chevron. */
  href?: string
  className?: string
}

/** KPI card for the attendance reports: tinted icon chip, label, value. */
export function TarjetaKpiAsistencia({
  icono: Icono,
  tono,
  etiqueta,
  valor,
  tipoValor = "numero",
  detalle,
  href,
  className,
}: TarjetaKpiAsistenciaProps) {
  const contenido = (
    <TarjetaSistema
      className={cn(
        "flex h-full items-center gap-4 p-4 sm:p-5",
        href && "transition-colors duration-200 group-hover:bg-muted/30",
        className
      )}
    >
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", TONOS_ICONO[tono])}>
        <Icono className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground">{etiqueta}</p>
        <div
          className={cn(
            tipoValor === "numero"
              ? "text-2xl font-bold tabular-nums text-foreground"
              : "truncate text-sm font-semibold text-foreground"
          )}
        >
          {valor}
        </div>
        {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
      </div>
      {href && (
        <ChevronRight
          className="size-5 shrink-0 text-muted-foreground transition-colors duration-200 group-hover:text-foreground"
          aria-hidden="true"
        />
      )}
    </TarjetaSistema>
  )

  if (!href) return contenido

  return (
    <Link
      href={href}
      className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {contenido}
    </Link>
  )
}

interface EstadoVacioAsistenciaProps {
  icono: LucideIcon
  titulo: string
  descripcion?: string
}

/** Empty state for attendance lists and charts. */
export function EstadoVacioAsistencia({ icono: Icono, titulo, descripcion }: EstadoVacioAsistenciaProps) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icono className="size-6" aria-hidden="true" />
      </span>
      <p className="font-semibold text-foreground">{titulo}</p>
      {descripcion && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{descripcion}</p>}
    </div>
  )
}

/**
 * Attendance percentage scale, shared by bars and figures:
 * ≥80 success, ≥60 warning, ≥40 brand orange, below that danger.
 */
export function claseBarraAsistencia(porcentaje: number) {
  if (porcentaje >= 80) return "bg-success"
  if (porcentaje >= 60) return "bg-warning"
  if (porcentaje >= 40) return "bg-[var(--brand-primary)]"
  return "bg-danger"
}

/**
 * Readable text color for a percentage figure: ≥80 success, ≥60 amber (the
 * warning token is too light for text on white), below that danger.
 */
export function claseTextoAsistencia(porcentaje: number) {
  if (porcentaje >= 80) return "text-success"
  if (porcentaje >= 60) return "text-amber-700 dark:text-amber-400"
  return "text-danger"
}

/** Thin progress bar for an attendance percentage. */
export function BarraAsistencia({ porcentaje, className }: { porcentaje: number; className?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)} aria-hidden="true">
      <div
        className={cn("h-full rounded-full", claseBarraAsistencia(porcentaje))}
        style={{ width: `${Math.min(Math.max(porcentaje, 0), 100)}%` }}
      />
    </div>
  )
}
