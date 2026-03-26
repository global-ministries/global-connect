"use client";

import { useEffect, useCallback } from "react";
import {
    CheckCircle2, XCircle, AlertTriangle, User, Clock,
    UserPlus, ArrowRight, UserMinus, Shield, X, MessageSquare
} from "lucide-react";
import {
    BadgeSistema, BotonSistema, TarjetaSistema,
    TextoSistema, TituloSistema, SeparadorSistema,
} from "@/components/ui/sistema-diseno";
import type { SolicitudCompletada } from "@/lib/types/solicitudes-grupo.types";

// ─── Config ───────────────────────────────────────────────────────

const ICONO_ESTADO: Record<string, typeof Clock> = {
    aprobado: CheckCircle2,
    rechazado: XCircle,
    expirado: AlertTriangle,
};

const VARIANTE_ESTADO: Record<string, "success" | "error" | "default"> = {
    aprobado: "success",
    rechazado: "error",
    expirado: "default",
};

const ETIQUETA_TIPO: Record<string, string> = {
    ingreso: "Ingreso a Grupo",
    traslado: "Traslado de Grupo",
    egreso: "Egreso de Grupo",
    cambio_rol: "Cambio de Rol",
    activacion_grupo: "Activación de Grupo",
};

// ─── Component ──────────────────────────────────────────────────

interface ModalDetalleSolicitudProps {
    solicitud: SolicitudCompletada;
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Modal read-only para ver detalle de una solicitud completada.
 * Muestra toda la información incluyendo quién procesó y notas del director.
 */
export function ModalDetalleSolicitud({
    solicitud,
    isOpen,
    onClose,
}: ModalDetalleSolicitudProps) {
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        },
        [onClose]
    );

    useEffect(() => {
        if (!isOpen) return;
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    const IconoEstado = ICONO_ESTADO[solicitud.estado] ?? Clock;
    const varianteEstado = VARIANTE_ESTADO[solicitud.estado] ?? "default";

    const fechaProcesada = new Date(solicitud.actualizado_en).toLocaleDateString("es-VE", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    const fechaCreada = new Date(solicitud.creado_en).toLocaleDateString("es-VE", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    const nombreAprobador = solicitud.aprobado_por_nombre
        ? `${solicitud.aprobado_por_nombre} ${solicitud.aprobado_por_apellido ?? ""}`.trim()
        : null;

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-detalle-titulo"
            onClick={handleOverlayClick}
        >
            <div className="relative z-10 w-full max-w-lg">
                <TarjetaSistema className="p-6 sm:p-8 flex flex-col gap-5 max-h-[80vh] md:max-h-[90vh] overflow-y-auto pb-24 md:pb-8">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                        <TituloSistema nivel={3} id="modal-detalle-titulo">
                            Detalle de Solicitud
                        </TituloSistema>
                        <div className="flex items-center gap-2">
                            <BadgeSistema variante="info">
                                {ETIQUETA_TIPO[solicitud.tipo] ?? solicitud.tipo}
                            </BadgeSistema>
                            <button
                                onClick={onClose}
                                className="p-1 rounded-lg hover:bg-muted/80 transition-colors duration-200 text-muted-foreground"
                                aria-label="Cerrar"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <SeparadorSistema />

                    {/* Estado prominente */}
                    <div className="flex items-center justify-between rounded-xl bg-muted/50 p-4">
                        <div>
                            <TextoSistema variante="muted" tamaño="sm">Estado</TextoSistema>
                            <div className="flex items-center gap-2 mt-1">
                                <BadgeSistema variante={varianteEstado} tamaño="md">
                                    <IconoEstado className="h-3.5 w-3.5 mr-1.5" />
                                    {solicitud.estado.charAt(0).toUpperCase() + solicitud.estado.slice(1)}
                                </BadgeSistema>
                            </div>
                        </div>
                        {nombreAprobador && (
                            <div className="text-right">
                                <TextoSistema variante="muted" tamaño="sm">
                                    {solicitud.estado === "aprobado" ? "Aprobado por" : "Rechazado por"}
                                </TextoSistema>
                                <TextoSistema className="font-medium mt-1">{nombreAprobador}</TextoSistema>
                            </div>
                        )}
                    </div>

                    {/* Info del miembro */}
                    <div className="flex items-center gap-3">
                        {solicitud.miembro_foto ? (
                            <img
                                src={solicitud.miembro_foto}
                                alt=""
                                className="h-12 w-12 rounded-full object-cover"
                            />
                        ) : (
                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                                <User className="h-5 w-5 text-muted-foreground" />
                            </div>
                        )}
                        <div>
                            <TextoSistema className="font-semibold">
                                {solicitud.miembro_nombre} {solicitud.miembro_apellido}
                            </TextoSistema>
                            <TextoSistema variante="muted" tamaño="sm">
                                Solicitado por {solicitud.solicitante_nombre} {solicitud.solicitante_apellido}
                            </TextoSistema>
                        </div>
                    </div>

                    {/* Detalles del grupo */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-xl bg-muted/50 p-3">
                            <TextoSistema variante="muted" tamaño="sm">Grupo destino</TextoSistema>
                            <TextoSistema className="font-medium">{solicitud.grupo_nombre}</TextoSistema>
                            <TextoSistema variante="muted" tamaño="sm">{solicitud.segmento_nombre}</TextoSistema>
                        </div>

                        {solicitud.grupo_origen_nombre && (
                            <div className="rounded-xl bg-muted/50 p-3">
                                <TextoSistema variante="muted" tamaño="sm">Grupo origen</TextoSistema>
                                <TextoSistema className="font-medium">{solicitud.grupo_origen_nombre}</TextoSistema>
                            </div>
                        )}

                        {solicitud.rol_solicitado && (
                            <div className="rounded-xl bg-muted/50 p-3">
                                <TextoSistema variante="muted" tamaño="sm">Rol solicitado</TextoSistema>
                                <TextoSistema className="font-medium capitalize">{solicitud.rol_solicitado}</TextoSistema>
                            </div>
                        )}

                        {solicitud.campus_nombre && (
                            <div className="rounded-xl bg-muted/50 p-3">
                                <TextoSistema variante="muted" tamaño="sm">Campus</TextoSistema>
                                <TextoSistema className="font-medium">{solicitud.campus_nombre}</TextoSistema>
                            </div>
                        )}

                        {(solicitud.lider_nombre || solicitud.lider_apellido) && (
                            <div className="rounded-xl bg-muted/50 p-3">
                                <TextoSistema variante="muted" tamaño="sm">Líder asignado</TextoSistema>
                                <TextoSistema className="font-medium">
                                    {`${solicitud.lider_nombre ?? ""} ${solicitud.lider_apellido ?? ""}`.trim()}
                                </TextoSistema>
                            </div>
                        )}

                        {(solicitud.director_nombre || solicitud.director_apellido) && (
                            <div className="rounded-xl bg-muted/50 p-3">
                                <TextoSistema variante="muted" tamaño="sm">Director de Etapa</TextoSistema>
                                <TextoSistema className="font-medium">
                                    {`${solicitud.director_nombre ?? ""} ${solicitud.director_apellido ?? ""}`.trim()}
                                </TextoSistema>
                            </div>
                        )}

                        {solicitud.temporada_nombre && (
                            <div className="rounded-xl bg-muted/50 p-3">
                                <TextoSistema variante="muted" tamaño="sm">Temporada</TextoSistema>
                                <TextoSistema className="font-medium">{solicitud.temporada_nombre}</TextoSistema>
                            </div>
                        )}
                    </div>

                    {/* Motivo */}
                    {solicitud.motivo && (
                        <div className="rounded-xl border border-border p-3">
                            <TextoSistema variante="muted" tamaño="sm">Motivo</TextoSistema>
                            <TextoSistema className="mt-1 italic">&quot;{solicitud.motivo}&quot;</TextoSistema>
                        </div>
                    )}

                    {/* Notas del director */}
                    {solicitud.notas_director && (
                        <div className="rounded-xl border border-border bg-muted/30 p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                <TextoSistema variante="muted" tamaño="sm">Notas del director</TextoSistema>
                            </div>
                            <TextoSistema className="italic">&quot;{solicitud.notas_director}&quot;</TextoSistema>
                        </div>
                    )}

                    {/* Fechas */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-6 text-sm">
                        <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <TextoSistema variante="muted" tamaño="sm">
                                Creada: {fechaCreada}
                            </TextoSistema>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <TextoSistema variante="muted" tamaño="sm">
                                Procesada: {fechaProcesada}
                            </TextoSistema>
                        </div>
                    </div>

                    <SeparadorSistema />

                    {/* Cerrar */}
                    <BotonSistema variante="outline" className="w-full" onClick={onClose}>
                        Cerrar
                    </BotonSistema>
                </TarjetaSistema>
            </div>
        </div>
    );
}
