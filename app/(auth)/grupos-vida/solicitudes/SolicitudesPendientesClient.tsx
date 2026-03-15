"use client";

import { useState, useTransition, useCallback, useMemo } from "react";
import { RefreshCw, CheckCircle2, Clock, XCircle, AlertTriangle, User, UserPlus, ArrowRight, UserMinus, Shield } from "lucide-react";
import { BotonSistema, BadgeSistema, TarjetaSistema, TextoSistema } from "@/components/ui/sistema-diseno";
import { TabsSistema, TabsList, TabsTrigger, TabsContent } from "@/components/ui/TabsSistema";
import { TablaSolicitudes } from "@/components/grupos-vida/solicitudes/tabla-solicitudes";
import { listarSolicitudesPendientes, listarSolicitudesCompletadas } from "@/lib/actions/solicitudes-grupo.actions";
import type { SolicitudPendiente } from "@/lib/types/solicitudes-grupo.types";

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

// ─── Filtro de tipo (pills) ─────────────────────────────────────────

function FiltroTipo({
    tipos,
    filtro,
    onChange,
}: {
    tipos: readonly { readonly valor: string; readonly etiqueta: string }[];
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

// ─── Component ──────────────────────────────────────────────────────

interface SolicitudesPendientesClientProps {
    solicitudesIniciales: SolicitudPendiente[];
    solicitudesCompletadas: SolicitudPendiente[];
}

/**
 * Componente cliente que maneja la lista de solicitudes pendientes y completadas
 * con tabs y refresh automático después de procesar una.
 */
export function SolicitudesPendientesClient({
    solicitudesIniciales,
    solicitudesCompletadas: completadasIniciales,
}: SolicitudesPendientesClientProps) {
    const [pendientesBase, setPendientesBase] = useState(solicitudesIniciales);
    const [completadasBase, setCompletadasBase] = useState(completadasIniciales);
    const [filtroTipo, setFiltroTipo] = useState("todas");
    const [isPending, startTransition] = useTransition();

    // Filtrar según tipo seleccionado
    const pendientes = useMemo(() => {
        return filtroTipo === "todas" ? pendientesBase : pendientesBase.filter((s) => s.tipo === filtroTipo);
    }, [pendientesBase, filtroTipo]);

    const completadas = useMemo(() => {
        return filtroTipo === "todas" ? completadasBase : completadasBase.filter((s) => s.tipo === filtroTipo);
    }, [completadasBase, filtroTipo]);

    // Detectar qué tipos existen para mostrar solo filtros relevantes
    const filtrosDisponibles = useMemo(() => {
        const allSolicitudes = [...pendientesBase, ...completadasBase];
        const tipos = new Set(allSolicitudes.map((s) => s.tipo));
        return FILTROS_TIPO.filter((f) => f.valor === "todas" || tipos.has(f.valor));
    }, [pendientesBase, completadasBase]);

    const recargar = useCallback(() => {
        startTransition(async () => {
            const [pendientesRes, completadasRes] = await Promise.all([
                listarSolicitudesPendientes(),
                listarSolicitudesCompletadas(),
            ]);
            if (pendientesRes.success && pendientesRes.data) {
                setPendientesBase(pendientesRes.data);
            }
            if (completadasRes.success && completadasRes.data) {
                setCompletadasBase(completadasRes.data);
            }
        });
    }, []);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                {/* Filtro de tipo */}
                <FiltroTipo tipos={FILTROS_TIPO} filtro={filtroTipo} onChange={setFiltroTipo} />
            </div>

            <TabsSistema defaultValue="pendientes">
                <div className="flex items-center justify-between gap-2 mb-4">
                    <TabsList>
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
                    <BotonSistema
                        variante="ghost"
                        tamaño="sm"
                        icono={RefreshCw}
                        onClick={recargar}
                        cargando={isPending}
                    >
                        Actualizar
                    </BotonSistema>
                </div>

                <TabsContent value="pendientes">
                    <TablaSolicitudes solicitudes={pendientes} onProcesada={recargar} />
                </TabsContent>

                <TabsContent value="completadas">
                    {completadas.length === 0 ? (
                        <TarjetaSistema className="p-8 text-center">
                            <TextoSistema variante="muted" tamaño="lg">
                                No hay solicitudes completadas
                            </TextoSistema>
                        </TarjetaSistema>
                    ) : (
                        <>
                            {/* Desktop */}
                            <div className="hidden sm:block overflow-hidden">
                                <TarjetaSistema>
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-border text-left">
                                                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo</th>
                                                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Miembro</th>
                                                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Grupo</th>
                                                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</th>
                                                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Solicitante</th>
                                                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {completadas.map((sol) => {
                                                const Icono = ICONO_TIPO[sol.tipo] ?? Clock;
                                                const IconoEstado = ICONO_ESTADO[sol.estado] ?? Clock;

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
                                                                    <img src={sol.miembro_foto} alt="" className="h-7 w-7 rounded-full object-cover" />
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
                                                        <td className="px-4 py-3">
                                                            <BadgeSistema variante={VARIANTE_ESTADO[sol.estado] ?? "default"} tamaño="sm">
                                                                <IconoEstado className="h-3 w-3 mr-1" />
                                                                {sol.estado.charAt(0).toUpperCase() + sol.estado.slice(1)}
                                                            </BadgeSistema>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-muted-foreground">
                                                            {sol.solicitante_nombre} {sol.solicitante_apellido}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-muted-foreground">
                                                            {formatFechaCorta(sol.creado_en)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </TarjetaSistema>
                            </div>

                            {/* Móvil */}
                            <div className="sm:hidden space-y-3">
                                {completadas.map((sol) => {
                                    const Icono = ICONO_TIPO[sol.tipo] ?? Clock;
                                    const IconoEstado = ICONO_ESTADO[sol.estado] ?? Clock;

                                    return (
                                        <TarjetaSistema key={sol.id} className="p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {sol.miembro_foto ? (
                                                        <img src={sol.miembro_foto} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
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
                                                <div className="flex flex-col items-end gap-1">
                                                    <BadgeSistema variante="info" tamaño="sm">
                                                        <Icono className="h-3 w-3 mr-1" />
                                                        {ETIQUETA_TIPO[sol.tipo] ?? sol.tipo}
                                                    </BadgeSistema>
                                                    <BadgeSistema variante={VARIANTE_ESTADO[sol.estado] ?? "default"} tamaño="sm">
                                                        <IconoEstado className="h-3 w-3 mr-1" />
                                                        {sol.estado.charAt(0).toUpperCase() + sol.estado.slice(1)}
                                                    </BadgeSistema>
                                                </div>
                                            </div>
                                            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                                                <Clock className="h-3 w-3" />
                                                <span>{formatFechaCorta(sol.creado_en)}</span>
                                            </div>
                                        </TarjetaSistema>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </TabsContent>
            </TabsSistema>
        </div>
    );
}
