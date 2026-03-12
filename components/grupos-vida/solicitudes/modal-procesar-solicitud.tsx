"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, User, ArrowRight, Clock } from "lucide-react";
import {
    BadgeSistema,
    BotonSistema,
    TarjetaSistema,
    TextoSistema,
    TextareaSistema,
    TituloSistema,
    SeparadorSistema,
} from "@/components/ui/sistema-diseno";
import { useNotificaciones } from "@/hooks/use-notificaciones";
import { procesarSolicitudGrupo } from "@/lib/actions/solicitudes-grupo.actions";
import type { SolicitudPendiente } from "@/lib/actions/solicitudes-grupo.actions";

interface ModalProcesarSolicitudProps {
    solicitud: SolicitudPendiente;
    isOpen: boolean;
    onClose: () => void;
    onProcesada?: () => void;
}

/**
 * Modal para aprobar o rechazar una solicitud de grupo.
 * Muestra toda la información de la solicitud con opción de agregar notas.
 */
export function ModalProcesarSolicitud({
    solicitud,
    isOpen,
    onClose,
    onProcesada,
}: ModalProcesarSolicitudProps) {
    const [notas, setNotas] = useState("");
    const [isPending, startTransition] = useTransition();
    const toast = useNotificaciones();

    if (!isOpen) return null;

    const handleProcesar = (accion: "aprobar" | "rechazar") => {
        startTransition(async () => {
            const resultado = await procesarSolicitudGrupo({
                solicitud_id: solicitud.id,
                accion,
                notas: notas.trim() || undefined,
            });

            if (resultado.success) {
                toast.success(
                    accion === "aprobar"
                        ? "Solicitud aprobada exitosamente"
                        : "Solicitud rechazada"
                );
                onProcesada?.();
            } else {
                toast.error(resultado.error ?? "Error al procesar la solicitud");
            }
        });
    };

    const ETIQUETA_TIPO: Record<string, string> = {
        ingreso: "Ingreso a Grupo",
        traslado: "Traslado de Grupo",
        egreso: "Egreso de Grupo",
        cambio_rol: "Cambio de Rol",
        activacion_grupo: "Activación de Grupo",
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="relative z-10 w-full max-w-lg">
                <TarjetaSistema className="p-6 sm:p-8 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                        <TituloSistema nivel={3}>Revisar Solicitud</TituloSistema>
                        <BadgeSistema variante="info">
                            {ETIQUETA_TIPO[solicitud.tipo] ?? solicitud.tipo}
                        </BadgeSistema>
                    </div>

                    <SeparadorSistema />

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

                    {/* Detalles */}
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

                        <div className="rounded-xl bg-muted/50 p-3">
                            <TextoSistema variante="muted" tamaño="sm">Temporada</TextoSistema>
                            <TextoSistema className="font-medium">
                                {solicitud.temporada_nombre ?? "Sin temporada"}
                            </TextoSistema>
                            {solicitud.temporada_estado && (
                                <BadgeSistema
                                    variante={solicitud.temporada_estado === "activa" ? "success" : "warning"}
                                    tamaño="sm"
                                    className="mt-1"
                                >
                                    {solicitud.temporada_estado}
                                </BadgeSistema>
                            )}
                        </div>
                    </div>

                    {/* Motivo del solicitante */}
                    {solicitud.motivo && (
                        <div className="rounded-xl border border-border p-3">
                            <TextoSistema variante="muted" tamaño="sm">Motivo</TextoSistema>
                            <TextoSistema className="mt-1 italic">&quot;{solicitud.motivo}&quot;</TextoSistema>
                        </div>
                    )}

                    {/* Expiración */}
                    {solicitud.expira_en && (
                        <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <TextoSistema variante="muted" tamaño="sm">
                                Expira: {new Date(solicitud.expira_en).toLocaleDateString("es-VE", {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </TextoSistema>
                        </div>
                    )}

                    <SeparadorSistema />

                    {/* Notas del director */}
                    <TextareaSistema
                        label="Notas del director (opcional)"
                        filas={3}
                        value={notas}
                        onChange={(e) => setNotas(e.target.value)}
                        placeholder="Agregar notas sobre esta decisión..."
                    />

                    {/* Acciones */}
                    <div className="flex gap-3">
                        <BotonSistema
                            variante="outline"
                            className="flex-1"
                            onClick={onClose}
                            disabled={isPending}
                        >
                            Cancelar
                        </BotonSistema>
                        <BotonSistema
                            variante="outline"
                            className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                            onClick={() => handleProcesar("rechazar")}
                            disabled={isPending}
                            cargando={isPending}
                            icono={XCircle}
                        >
                            Rechazar
                        </BotonSistema>
                        <BotonSistema
                            variante="primario"
                            className="flex-1"
                            onClick={() => handleProcesar("aprobar")}
                            disabled={isPending}
                            cargando={isPending}
                            icono={CheckCircle2}
                        >
                            Aprobar
                        </BotonSistema>
                    </div>
                </TarjetaSistema>
            </div>
        </div>
    );
}
