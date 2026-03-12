"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Clock, User, ArrowRight, UserPlus, UserMinus, Shield, Loader2 } from "lucide-react";
import { BadgeSistema, BotonSistema, TarjetaSistema, TextoSistema } from "@/components/ui/sistema-diseno";
import { ModalProcesarSolicitud } from "./modal-procesar-solicitud";
import type { SolicitudPendiente } from "@/lib/actions/solicitudes-grupo.actions";

const ICONO_TIPO: Record<string, typeof UserPlus> = {
    ingreso: UserPlus,
    traslado: ArrowRight,
    egreso: UserMinus,
    cambio_rol: Shield,
    activacion_grupo: Shield,
};

const ETIQUETA_TIPO: Record<string, string> = {
    ingreso: "Ingreso",
    traslado: "Traslado",
    egreso: "Egreso",
    cambio_rol: "Cambio de Rol",
    activacion_grupo: "Activación",
};

interface TablaSolicitudesProps {
    solicitudes: SolicitudPendiente[];
    onProcesada?: () => void;
}

/**
 * Tabla/lista responsive de solicitudes pendientes.
 * Muestra cards en móvil y filas compactas en desktop.
 */
export function TablaSolicitudes({ solicitudes, onProcesada }: TablaSolicitudesProps) {
    const [solicitudSeleccionada, setSolicitudSeleccionada] = useState<SolicitudPendiente | null>(null);

    if (solicitudes.length === 0) {
        return (
            <TarjetaSistema className="p-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3 opacity-60" />
                <TextoSistema variante="muted" tamaño="lg">
                    No hay solicitudes pendientes
                </TextoSistema>
                <TextoSistema variante="muted" tamaño="sm" className="mt-1">
                    Todas las solicitudes han sido procesadas
                </TextoSistema>
            </TarjetaSistema>
        );
    }

    return (
        <>
            {/* Vista desktop */}
            <div className="hidden sm:block overflow-hidden">
                <TarjetaSistema>
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border text-left">
                                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo</th>
                                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Miembro</th>
                                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Grupo</th>
                                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Solicitante</th>
                                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha</th>
                                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Expira</th>
                                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {solicitudes.map((sol) => {
                                const Icono = ICONO_TIPO[sol.tipo] ?? Clock;
                                const tiempoRestante = sol.expira_en ? calcularTiempoRestante(sol.expira_en) : null;

                                return (
                                    <tr key={sol.id} className="hover:bg-muted/50 transition-colors duration-200">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <Icono className="h-4 w-4 text-muted-foreground" />
                                                <BadgeSistema variante="info" tamaño="sm">
                                                    {ETIQUETA_TIPO[sol.tipo] ?? sol.tipo}
                                                </BadgeSistema>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {sol.miembro_foto ? (
                                                    <img
                                                        src={sol.miembro_foto}
                                                        alt=""
                                                        className="h-7 w-7 rounded-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                                                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                                                    </div>
                                                )}
                                                <span className="text-sm text-foreground font-medium truncate max-w-[140px]">
                                                    {sol.miembro_nombre} {sol.miembro_apellido}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-sm">
                                                <span className="text-foreground">{sol.grupo_nombre}</span>
                                                <span className="text-xs text-muted-foreground block">{sol.segmento_nombre}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-muted-foreground">
                                            {sol.solicitante_nombre} {sol.solicitante_apellido}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-muted-foreground">
                                            {new Date(sol.creado_en).toLocaleDateString("es-VE", {
                                                day: "numeric",
                                                month: "short",
                                            })}
                                        </td>
                                        <td className="px-4 py-3">
                                            {tiempoRestante && (
                                                <BadgeSistema
                                                    variante={tiempoRestante.urgente ? "error" : "warning"}
                                                    tamaño="sm"
                                                >
                                                    {tiempoRestante.texto}
                                                </BadgeSistema>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <BotonSistema
                                                variante="outline"
                                                tamaño="sm"
                                                onClick={() => setSolicitudSeleccionada(sol)}
                                            >
                                                Revisar
                                            </BotonSistema>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </TarjetaSistema>
            </div>

            {/* Vista móvil */}
            <div className="sm:hidden space-y-3">
                {solicitudes.map((sol) => {
                    const Icono = ICONO_TIPO[sol.tipo] ?? Clock;
                    const tiempoRestante = sol.expira_en ? calcularTiempoRestante(sol.expira_en) : null;

                    return (
                        <TarjetaSistema
                            key={sol.id}
                            className="p-4 cursor-pointer hover:bg-muted/30 transition-colors duration-200"
                            onClick={() => setSolicitudSeleccionada(sol)}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    {sol.miembro_foto ? (
                                        <img
                                            src={sol.miembro_foto}
                                            alt=""
                                            className="h-9 w-9 rounded-full object-cover shrink-0"
                                        />
                                    ) : (
                                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                                            <User className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <span className="text-sm font-medium text-foreground block truncate">
                                            {sol.miembro_nombre} {sol.miembro_apellido}
                                        </span>
                                        <span className="text-xs text-muted-foreground">{sol.grupo_nombre}</span>
                                    </div>
                                </div>
                                <BadgeSistema variante="info" tamaño="sm">
                                    <Icono className="h-3 w-3 mr-1" />
                                    {ETIQUETA_TIPO[sol.tipo] ?? sol.tipo}
                                </BadgeSistema>
                            </div>

                            {tiempoRestante && (
                                <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    <span>Expira en {tiempoRestante.texto}</span>
                                </div>
                            )}
                        </TarjetaSistema>
                    );
                })}
            </div>

            {/* Modal de procesamiento */}
            {solicitudSeleccionada && (
                <ModalProcesarSolicitud
                    solicitud={solicitudSeleccionada}
                    isOpen={!!solicitudSeleccionada}
                    onClose={() => setSolicitudSeleccionada(null)}
                    onProcesada={() => {
                        setSolicitudSeleccionada(null);
                        onProcesada?.();
                    }}
                />
            )}
        </>
    );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function calcularTiempoRestante(expiraEn: string): { texto: string; urgente: boolean } {
    const ahora = new Date();
    const expira = new Date(expiraEn);
    const diffMs = expira.getTime() - ahora.getTime();

    if (diffMs <= 0) return { texto: "Expirada", urgente: true };

    const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDias = Math.floor(diffHoras / 24);

    if (diffDias > 1) return { texto: `${diffDias} días`, urgente: false };
    if (diffDias === 1) return { texto: "1 día", urgente: true };
    if (diffHoras > 0) return { texto: `${diffHoras}h`, urgente: true };
    return { texto: "<1h", urgente: true };
}
