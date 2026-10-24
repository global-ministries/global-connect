"use client"

import { InputSistema, SelectSistema } from "@/components/ui/sistema-diseno"
import type { TipoPresencia, TiempoTardanza, MotivoTardanza } from "@/lib/types/asistencia-avanzada.types"
import { SelectorPresencia } from "./SelectorPresencia.client"
import {
    OPCIONES_MOTIVO_TARDANZA,
    OPCIONES_TIEMPO_TARDANZA,
    rolLabel,
    type EstadoMiembro,
    type MiembroAsistencia,
} from "./opciones"

interface Props {
    miembro: MiembroAsistencia
    estado: EstadoMiembro | undefined
    /** Mezcla los campos dados en el estado de la persona. */
    onCambio: (cambios: Partial<EstadoMiembro>) => void
}

/**
 * Una persona del registro: nombre, rol, el control de presencia y, debajo,
 * el detalle que pide su estado (motivo de inasistencia o de tardanza).
 * En móvil es una tarjeta; desde `sm` una fila de la lista.
 */
export function FilaMiembroAsistencia({ miembro, estado, onCambio }: Props) {
    const tipo: TipoPresencia = estado?.tipo_presencia ?? "presente"
    const nombreCompleto = `${miembro.nombre} ${miembro.apellido}`
    const iniciales = `${miembro.nombre.charAt(0)}${miembro.apellido.charAt(0)}`.toUpperCase()

    return (
        <li className="rounded-2xl border border-border bg-card p-4 sm:rounded-none sm:border-0 sm:bg-transparent">
            <div className="flex flex-col gap-3 @xl:flex-row @xl:items-center @xl:justify-between @xl:gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                    >
                        {iniciales}
                    </span>
                    <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{nombreCompleto}</p>
                        <p className="text-xs text-muted-foreground">{rolLabel(miembro.rol)}</p>
                    </div>
                </div>
                <div className="@xl:w-[26rem] @xl:shrink-0">
                    <SelectorPresencia
                        nombre={`presencia-${miembro.id}`}
                        etiqueta={`Asistencia de ${nombreCompleto}`}
                        valor={tipo}
                        onCambio={(t) => onCambio({ tipo_presencia: t })}
                    />
                </div>
            </div>

            {(tipo === "ausente" || tipo === "justificado") && (
                <div className="mt-3">
                    <InputSistema
                        className="w-full"
                        aria-label={`Motivo de inasistencia de ${nombreCompleto}`}
                        placeholder="Motivo de inasistencia (opcional)"
                        value={estado?.motivo || ""}
                        onChange={(e) => onCambio({ motivo: e.target.value })}
                    />
                </div>
            )}

            {tipo === "tarde" && (
                <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
                        <SelectSistema
                            label="¿Cuánto tardó?"
                            value={estado?.tiempo_tardanza || ""}
                            onValueChange={(v: string) => onCambio({ tiempo_tardanza: v as TiempoTardanza })}
                            opciones={[{ valor: "", etiqueta: "Seleccionar" }, ...OPCIONES_TIEMPO_TARDANZA]}
                        />
                        <SelectSistema
                            label="Motivo"
                            value={estado?.motivo_tardanza || ""}
                            onValueChange={(v: string) => onCambio({ motivo_tardanza: v as MotivoTardanza })}
                            opciones={[{ valor: "", etiqueta: "Seleccionar" }, ...OPCIONES_MOTIVO_TARDANZA]}
                        />
                    </div>
                    {estado?.motivo_tardanza === "otro" && (
                        <InputSistema
                            className="w-full"
                            aria-label={`Otro motivo de tardanza de ${nombreCompleto}`}
                            placeholder="Especifica el motivo..."
                            value={estado?.motivo_tardanza_otro || ""}
                            onChange={(e) => onCambio({ motivo_tardanza_otro: e.target.value })}
                        />
                    )}
                </div>
            )}
        </li>
    )
}
