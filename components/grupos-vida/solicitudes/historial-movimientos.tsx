"use client";

import { Clock, ArrowRight, UserPlus, UserMinus, RefreshCw, Shield } from "lucide-react";
import { TarjetaSistema, TextoSistema } from "@/components/ui/sistema-diseno";
import type { MovimientoHistorial } from "@/lib/actions/solicitudes-grupo.actions";

const ICONO_MOVIMIENTO: Record<string, typeof UserPlus> = {
    ingreso: UserPlus,
    ingreso_directo: UserPlus,
    egreso: UserMinus,
    traslado: ArrowRight,
    cambio_rol: RefreshCw,
    activacion_grupo: Shield,
};

const ETIQUETA_MOVIMIENTO: Record<string, string> = {
    ingreso: "Ingreso",
    ingreso_directo: "Ingreso Directo",
    egreso: "Egreso",
    traslado: "Traslado",
    cambio_rol: "Cambio de Rol",
    activacion_grupo: "Activación de Grupo",
};

interface HistorialMovimientosProps {
    movimientos: MovimientoHistorial[];
}

/**
 * Timeline visual de los movimientos de un miembro en grupos de vida.
 * Muestra cada evento con icono, descripción y metadata.
 */
export function HistorialMovimientos({ movimientos }: HistorialMovimientosProps) {
    if (movimientos.length === 0) {
        return (
            <TarjetaSistema className="p-6 text-center">
                <TextoSistema variante="muted">Sin movimientos registrados</TextoSistema>
            </TarjetaSistema>
        );
    }

    return (
        <div className="relative space-y-0">
            {/* Línea vertical del timeline */}
            <div className="absolute left-5 top-3 bottom-3 w-px bg-border" />

            {movimientos.map((mov) => {
                const Icono = ICONO_MOVIMIENTO[mov.tipo_movimiento] ?? Clock;

                return (
                    <div key={mov.id} className="relative flex gap-4 py-3">
                        {/* Nodo del timeline */}
                        <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted border border-border">
                            <Icono className="h-4 w-4 text-muted-foreground" />
                        </div>

                        {/* Contenido */}
                        <div className="flex-1 min-w-0 pt-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="font-medium text-sm text-foreground">
                                    {ETIQUETA_MOVIMIENTO[mov.tipo_movimiento] ?? mov.tipo_movimiento}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(mov.creado_en).toLocaleDateString("es-VE", {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                    })}
                                </span>
                            </div>

                            {/* Detalles del movimiento */}
                            <div className="mt-1 space-y-0.5">
                                {mov.grupo_destino && (
                                    <TextoSistema tamaño="sm" variante="muted">
                                        {mov.grupo_origen
                                            ? `${mov.grupo_origen} → ${mov.grupo_destino}`
                                            : `Grupo: ${mov.grupo_destino}`}
                                    </TextoSistema>
                                )}

                                {mov.rol_nuevo && (
                                    <TextoSistema tamaño="sm" variante="muted">
                                        {mov.rol_anterior
                                            ? `Rol: ${mov.rol_anterior} → ${mov.rol_nuevo}`
                                            : `Rol: ${mov.rol_nuevo}`}
                                    </TextoSistema>
                                )}

                                {mov.motivo && (
                                    <TextoSistema tamaño="sm" variante="sutil" className="italic">
                                        &quot;{mov.motivo}&quot;
                                    </TextoSistema>
                                )}

                                {mov.realizado_por_nombre && (
                                    <TextoSistema tamaño="sm" variante="muted">
                                        Por: {mov.realizado_por_nombre} {mov.realizado_por_apellido}
                                    </TextoSistema>
                                )}

                                {mov.temporada && (
                                    <TextoSistema tamaño="sm" variante="muted">
                                        Temporada: {mov.temporada}
                                    </TextoSistema>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
