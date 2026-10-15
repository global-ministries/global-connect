"use client"

import { Check, Clock, X, FileText, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TipoPresencia } from "@/lib/types/asistencia-avanzada.types"
import { OPCIONES_PRESENCIA } from "./opciones"

/** Color de estado (docs/design-system.md): tinte de relleno + token `-text` legible. */
const ESTILO_SELECCIONADO: Record<TipoPresencia, string> = {
    presente: "border-success/40 bg-success/15 text-success-text",
    tarde: "border-warning/50 bg-warning/15 text-warning-text",
    ausente: "border-danger/40 bg-danger/15 text-danger-text",
    justificado: "border-info/40 bg-info/15 text-info-text",
}

const ICONO: Record<TipoPresencia, LucideIcon> = {
    presente: Check,
    tarde: Clock,
    ausente: X,
    justificado: FileText,
}

interface Props {
    /** Nombre del grupo de radios; único por persona. */
    nombre: string
    /** Nombre accesible del grupo, p. ej. "Asistencia de Ana Ruiz". */
    etiqueta: string
    valor: TipoPresencia
    onCambio: (tipo: TipoPresencia) => void
}

/**
 * Control segmentado de presencia: un toque por persona. Son radios nativos
 * con estilo de botón, así el navegador da las flechas, el foco y el anuncio
 * del lector de pantalla. Móvil: rejilla 2×2; desde un contenedor `@md`, una fila.
 */
export function SelectorPresencia({ nombre, etiqueta, valor, onCambio }: Props) {
    return (
        <div role="radiogroup" aria-label={etiqueta} className="grid grid-cols-2 gap-2 @md:grid-cols-4">
            {OPCIONES_PRESENCIA.map((opcion) => {
                const Icono = ICONO[opcion.valor]
                const seleccionado = valor === opcion.valor
                return (
                    <label key={opcion.valor} className="relative block">
                        <input
                            type="radio"
                            name={nombre}
                            value={opcion.valor}
                            checked={seleccionado}
                            onChange={() => onCambio(opcion.valor)}
                            className="peer sr-only"
                        />
                        <span
                            className={cn(
                                "flex h-11 cursor-pointer select-none items-center justify-center gap-1.5 rounded-xl border px-2",
                                "text-sm font-medium touch-manipulation",
                                "transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.96]",
                                "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                                seleccionado
                                    ? ESTILO_SELECCIONADO[opcion.valor]
                                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                        >
                            <Icono aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />
                            {opcion.etiqueta}
                        </span>
                    </label>
                )
            })}
        </div>
    )
}
