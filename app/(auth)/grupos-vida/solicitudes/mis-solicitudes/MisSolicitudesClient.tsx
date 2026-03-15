"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
    TarjetaSistema,
    TextoSistema,
    BadgeSistema,
    BotonSistema,
} from "@/components/ui/sistema-diseno";
import { TabsSistema, TabsList, TabsTrigger, TabsContent } from "@/components/ui/TabsSistema";
import {
    Clock,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Users,
    UserCheck,
    MapPin,
    Calendar,
    Building2,
    Pencil,
    Trash2,
    X,
    FileText,
    Eye,
} from "lucide-react";
import { cancelarSolicitudActivacion, editarGrupoPendiente } from "@/lib/actions/solicitudes-grupo.actions";
import SelectLeaderModal from "@/components/modals/SelectLeaderModal";
import { useNotificaciones } from "@/hooks/use-notificaciones";
import type { MiSolicitud } from "@/lib/types/solicitudes-grupo.types";

// ─── Config ─────────────────────────────────────────────────────────

const ICONO_ESTADO: Record<string, typeof Clock> = {
    pendiente: Clock,
    aprobado: CheckCircle2,
    rechazado: XCircle,
    expirado: AlertTriangle,
};

const VARIANTE_ESTADO: Record<string, "warning" | "success" | "error" | "default"> = {
    pendiente: "warning",
    aprobado: "success",
    rechazado: "error",
    expirado: "default",
};

const ETIQUETA_TIPO: Record<string, string> = {
    ingreso: "Ingreso",
    traslado: "Traslado",
    egreso: "Egreso",
    cambio_rol: "Cambio de Rol",
    activacion_grupo: "Activación",
};

/** Filtros de tipo disponibles */
const FILTROS_TIPO = [
    { valor: "todas", etiqueta: "Todas" },
    { valor: "activacion_grupo", etiqueta: "Activación" },
    { valor: "ingreso", etiqueta: "Ingreso" },
    { valor: "traslado", etiqueta: "Traslado" },
    { valor: "egreso", etiqueta: "Egreso" },
    { valor: "cambio_rol", etiqueta: "Cambio de Rol" },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────

function formatFechaCorta(iso: string): string {
    return new Date(iso).toLocaleDateString("es-VE", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function formatFechaHora(iso: string): string {
    return new Date(iso).toLocaleDateString("es-VE", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// ─── Filtro de tipo (pills) ─────────────────────────────────────────

function FiltroTipo({
    tipos,
    filtro,
    onChange,
}: {
    tipos: typeof FILTROS_TIPO;
    filtro: string;
    onChange: (v: string) => void;
}) {
    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            {tipos.map(({ valor, etiqueta }) => (
                <button
                    key={valor}
                    onClick={() => onChange(valor)}
                    className={`
                        px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-200
                        ${filtro === valor
                            ? "bg-foreground/10 text-foreground border border-border"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        }
                    `}
                >
                    {etiqueta}
                </button>
            ))}
        </div>
    );
}

// ─── Modal de detalles ──────────────────────────────────────────────

function ModalDetalleSolicitud({
    solicitud,
    onClose,
}: {
    solicitud: MiSolicitud;
    onClose: () => void;
}) {
    const IconoEstado = ICONO_ESTADO[solicitud.estado] ?? Clock;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="relative z-10 w-full max-w-lg">
                <TarjetaSistema className="p-6 sm:p-8 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                        <TextoSistema tamaño="lg" className="font-semibold">
                            {solicitud.grupo_nombre ?? "Solicitud"}
                        </TextoSistema>
                        <div className="flex items-center gap-2">
                            <BadgeSistema variante="info" tamaño="sm">
                                {ETIQUETA_TIPO[solicitud.tipo] ?? solicitud.tipo}
                            </BadgeSistema>
                            <BadgeSistema variante={VARIANTE_ESTADO[solicitud.estado] ?? "default"} tamaño="sm">
                                <IconoEstado className="h-3 w-3 mr-1" />
                                {solicitud.estado.charAt(0).toUpperCase() + solicitud.estado.slice(1)}
                            </BadgeSistema>
                        </div>
                    </div>

                    {/* Detalles en grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {solicitud.segmento_nombre && (
                            <div className="rounded-xl bg-muted/50 p-3">
                                <TextoSistema variante="muted" tamaño="sm">Segmento</TextoSistema>
                                <TextoSistema className="font-medium">{solicitud.segmento_nombre}</TextoSistema>
                            </div>
                        )}
                        {solicitud.temporada_nombre && (
                            <div className="rounded-xl bg-muted/50 p-3">
                                <TextoSistema variante="muted" tamaño="sm">Temporada</TextoSistema>
                                <TextoSistema className="font-medium">{solicitud.temporada_nombre}</TextoSistema>
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
                        {solicitud.grupo_origen_nombre && (
                            <div className="rounded-xl bg-muted/50 p-3">
                                <TextoSistema variante="muted" tamaño="sm">Grupo origen</TextoSistema>
                                <TextoSistema className="font-medium">{solicitud.grupo_origen_nombre}</TextoSistema>
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
                    {solicitud.notas_director && solicitud.estado !== "pendiente" && (
                        <div className="rounded-xl border border-border p-3">
                            <TextoSistema variante="muted" tamaño="sm">Nota del director</TextoSistema>
                            <TextoSistema className="mt-1 italic">&quot;{solicitud.notas_director}&quot;</TextoSistema>
                        </div>
                    )}

                    {/* Fecha */}
                    <TextoSistema variante="muted" tamaño="sm">
                        <Calendar className="h-3 w-3 inline mr-1" />
                        Solicitado el {formatFechaHora(solicitud.creado_en)}
                    </TextoSistema>

                    <BotonSistema variante="outline" onClick={onClose} className="w-full">
                        Cerrar
                    </BotonSistema>
                </TarjetaSistema>
            </div>
        </div>
    );
}

// ─── Componente principal ───────────────────────────────────────────

interface Props {
    solicitudes: MiSolicitud[];
}

export function MisSolicitudesClient({ solicitudes: initial }: Props) {
    const [solicitudes, setSolicitudes] = useState(initial);
    const [confirmandoCancelar, setConfirmandoCancelar] = useState<string | null>(null);
    const [editandoLider, setEditandoLider] = useState<{ solicitudId: string; grupoId: string; segmentoId: string } | null>(null);
    const [detalleAbierto, setDetalleAbierto] = useState<MiSolicitud | null>(null);
    const [filtroTipo, setFiltroTipo] = useState("todas");
    const [isPending, startTransition] = useTransition();
    const router = useRouter();
    const toast = useNotificaciones();

    // ─── Filtros ───────────────────────────────
    const pendientes = useMemo(() => {
        const base = solicitudes.filter((s) => s.estado === "pendiente");
        return filtroTipo === "todas" ? base : base.filter((s) => s.tipo === filtroTipo);
    }, [solicitudes, filtroTipo]);

    const completadas = useMemo(() => {
        const base = solicitudes.filter((s) => s.estado !== "pendiente");
        return filtroTipo === "todas" ? base : base.filter((s) => s.tipo === filtroTipo);
    }, [solicitudes, filtroTipo]);

    // Detectar qué tipos existen para mostrar solo filtros relevantes
    const filtrosDisponibles = useMemo(() => {
        const tipos = new Set(solicitudes.map((s) => s.tipo));
        return FILTROS_TIPO.filter((f) => f.valor === "todas" || tipos.has(f.valor));
    }, [solicitudes]);

    // ─── Cancelar ──────────────────────────────
    function handleCancelar(solicitudId: string) {
        startTransition(async () => {
            const result = await cancelarSolicitudActivacion(solicitudId);
            if (result.success) {
                toast.success("Solicitud cancelada y grupo eliminado");
                setSolicitudes((prev) => prev.filter((s) => s.id !== solicitudId));
            } else {
                toast.error(result.error ?? "Error al cancelar");
            }
            setConfirmandoCancelar(null);
        });
    }

    // ─── Editar líder ──────────────────────────
    function handleLiderSeleccionado(lider: { id: string; nombre: string; apellido: string }) {
        if (!editandoLider) return;
        startTransition(async () => {
            const result = await editarGrupoPendiente({
                solicitud_id: editandoLider.solicitudId,
                lider_usuario_id: lider.id,
            });
            if (result.success) {
                toast.success(`Líder actualizado a ${lider.nombre} ${lider.apellido}`);
                router.refresh();
            } else {
                toast.error(result.error ?? "Error al actualizar líder");
            }
            setEditandoLider(null);
        });
    }

    // ─── Empty state ────────────────────────────
    if (solicitudes.length === 0) {
        return (
            <TarjetaSistema className="p-8 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-60" />
                <TextoSistema variante="muted" tamaño="lg">
                    No has creado solicitudes aún
                </TextoSistema>
            </TarjetaSistema>
        );
    }

    // ─── Fila de tabla desktop ──────────────────
    function renderFilaDesktop(sol: MiSolicitud, esPendiente: boolean) {
        const IconoEstado = ICONO_ESTADO[sol.estado] ?? Clock;
        const esActivacion = sol.tipo === "activacion_grupo";
        const confirmando = confirmandoCancelar === sol.id;

        return (
            <tr key={sol.id} className="hover:bg-muted/50 transition-colors duration-200">
                <td className="px-4 py-3">
                    <BadgeSistema variante="info" tamaño="sm">
                        {ETIQUETA_TIPO[sol.tipo] ?? sol.tipo}
                    </BadgeSistema>
                </td>
                <td className="px-4 py-3">
                    <div className="text-sm">
                        <span className="text-foreground font-medium">{sol.grupo_nombre ?? "—"}</span>
                        {sol.segmento_nombre && (
                            <span className="text-xs text-muted-foreground block">{sol.segmento_nombre}</span>
                        )}
                    </div>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                    {(sol.lider_nombre || sol.lider_apellido)
                        ? `${sol.lider_nombre ?? ""} ${sol.lider_apellido ?? ""}`.trim()
                        : "—"}
                </td>
                <td className="px-4 py-3">
                    <BadgeSistema variante={VARIANTE_ESTADO[sol.estado] ?? "default"} tamaño="sm">
                        <IconoEstado className="h-3 w-3 mr-1" />
                        {sol.estado.charAt(0).toUpperCase() + sol.estado.slice(1)}
                    </BadgeSistema>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatFechaCorta(sol.creado_en)}
                </td>
                <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                        <BotonSistema
                            variante="ghost"
                            tamaño="sm"
                            icono={Eye}
                            onClick={() => setDetalleAbierto(sol)}
                        >
                            Ver
                        </BotonSistema>

                        {esPendiente && esActivacion && !confirmando && (
                            <>
                                <BotonSistema
                                    variante="outline"
                                    tamaño="sm"
                                    icono={Pencil}
                                    onClick={() =>
                                        setEditandoLider({
                                            solicitudId: sol.id,
                                            grupoId: sol.grupo_id,
                                            segmentoId: sol.segmento_id ?? "",
                                        })
                                    }
                                    disabled={isPending}
                                />
                                <BotonSistema
                                    variante="outline"
                                    tamaño="sm"
                                    icono={Trash2}
                                    onClick={() => setConfirmandoCancelar(sol.id)}
                                    disabled={isPending}
                                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                                />
                            </>
                        )}

                        {confirmando && (
                            <div className="flex items-center gap-1">
                                <BotonSistema
                                    variante="primario"
                                    tamaño="sm"
                                    onClick={() => handleCancelar(sol.id)}
                                    cargando={isPending}
                                    className="bg-destructive hover:bg-destructive/90"
                                >
                                    Eliminar
                                </BotonSistema>
                                <BotonSistema
                                    variante="ghost"
                                    tamaño="sm"
                                    icono={X}
                                    onClick={() => setConfirmandoCancelar(null)}
                                    disabled={isPending}
                                />
                            </div>
                        )}
                    </div>
                </td>
            </tr>
        );
    }

    // ─── Card móvil ─────────────────────────────
    function renderCardMovil(sol: MiSolicitud, esPendiente: boolean) {
        const IconoEstado = ICONO_ESTADO[sol.estado] ?? Clock;
        const esActivacion = sol.tipo === "activacion_grupo";
        const confirmando = confirmandoCancelar === sol.id;

        return (
            <TarjetaSistema key={sol.id} className="p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                    <BadgeSistema variante="info" tamaño="sm">
                        {ETIQUETA_TIPO[sol.tipo] ?? sol.tipo}
                    </BadgeSistema>
                    <BadgeSistema variante={VARIANTE_ESTADO[sol.estado] ?? "default"} tamaño="sm">
                        <IconoEstado className="h-3 w-3 mr-1" />
                        {sol.estado.charAt(0).toUpperCase() + sol.estado.slice(1)}
                    </BadgeSistema>
                </div>

                <TextoSistema className="font-semibold mb-1">{sol.grupo_nombre ?? "—"}</TextoSistema>
                <div className="space-y-1 text-sm mb-3">
                    {sol.segmento_nombre && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Users className="h-3.5 w-3.5" /><span>{sol.segmento_nombre}</span>
                        </div>
                    )}
                    {(sol.lider_nombre || sol.lider_apellido) && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>{`${sol.lider_nombre ?? ""} ${sol.lider_apellido ?? ""}`.trim()}</span>
                        </div>
                    )}
                    {sol.campus_nombre && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" /><span>{sol.campus_nombre}</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                    <Calendar className="h-3 w-3" /><span>{formatFechaCorta(sol.creado_en)}</span>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <BotonSistema variante="ghost" tamaño="sm" icono={Eye} onClick={() => setDetalleAbierto(sol)} className="flex-1">
                        Ver detalles
                    </BotonSistema>
                    {esPendiente && esActivacion && !confirmando && (
                        <>
                            <BotonSistema variante="outline" tamaño="sm" icono={Pencil}
                                onClick={() => setEditandoLider({ solicitudId: sol.id, grupoId: sol.grupo_id, segmentoId: sol.segmento_id ?? "" })}
                                disabled={isPending}
                            >Editar</BotonSistema>
                            <BotonSistema variante="outline" tamaño="sm" icono={Trash2}
                                onClick={() => setConfirmandoCancelar(sol.id)} disabled={isPending}
                                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            >Cancelar</BotonSistema>
                        </>
                    )}
                    {confirmando && (
                        <div className="flex items-center gap-2">
                            <TextoSistema tamaño="sm" className="text-destructive font-medium">¿Eliminar?</TextoSistema>
                            <BotonSistema variante="primario" tamaño="sm" onClick={() => handleCancelar(sol.id)}
                                cargando={isPending} className="bg-destructive hover:bg-destructive/90">Sí</BotonSistema>
                            <BotonSistema variante="ghost" tamaño="sm" icono={X}
                                onClick={() => setConfirmandoCancelar(null)} disabled={isPending} />
                        </div>
                    )}
                </div>
            </TarjetaSistema>
        );
    }

    // ─── Tabla renderizada ──────────────────────
    function renderTabla(lista: MiSolicitud[], esPendiente: boolean, emptyMsg: string) {
        if (lista.length === 0) {
            return (
                <TarjetaSistema className="p-8 text-center">
                    <TextoSistema variante="muted" tamaño="lg">{emptyMsg}</TextoSistema>
                </TarjetaSistema>
            );
        }

        return (
            <>
                {/* Desktop */}
                <div className="hidden sm:block overflow-hidden">
                    <TarjetaSistema>
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border text-left">
                                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo</th>
                                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Grupo</th>
                                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Líder</th>
                                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</th>
                                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha</th>
                                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {lista.map((sol) => renderFilaDesktop(sol, esPendiente))}
                            </tbody>
                        </table>
                    </TarjetaSistema>
                </div>

                {/* Móvil */}
                <div className="sm:hidden space-y-3">
                    {lista.map((sol) => renderCardMovil(sol, esPendiente))}
                </div>
            </>
        );
    }

    // ─── Render principal ────────────────────────

    return (
        <>
            {/* Filtro de tipo (pills) */}
            <div className="mb-4">
                <FiltroTipo tipos={FILTROS_TIPO} filtro={filtroTipo} onChange={setFiltroTipo} />
            </div>

            <TabsSistema defaultValue="pendientes">
                <TabsList className="mb-4">
                    <TabsTrigger value="pendientes">
                        Pendientes
                        {pendientes.length > 0 && (
                            <span className="ml-1.5 text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded-full">
                                {pendientes.length}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="completadas">
                        Completadas
                        {completadas.length > 0 && (
                            <span className="ml-1.5 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                                {completadas.length}
                            </span>
                        )}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="pendientes">
                    {renderTabla(pendientes, true, "No tienes solicitudes pendientes")}
                </TabsContent>

                <TabsContent value="completadas">
                    {renderTabla(completadas, false, "No hay solicitudes completadas")}
                </TabsContent>
            </TabsSistema>

            {/* Modal de detalle */}
            {detalleAbierto && (
                <ModalDetalleSolicitud solicitud={detalleAbierto} onClose={() => setDetalleAbierto(null)} />
            )}

            {/* Modal para editar líder */}
            {editandoLider && (
                <SelectLeaderModal
                    open={true}
                    onClose={() => setEditandoLider(null)}
                    onSelect={handleLiderSeleccionado}
                    segmentoId={editandoLider.segmentoId}
                    title="Cambiar Líder"
                    description="Selecciona el nuevo líder para este grupo"
                />
            )}
        </>
    );
}
