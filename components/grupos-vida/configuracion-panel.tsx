"use client";

import { useState, useTransition, useEffect } from "react";
import { Settings, Save } from "lucide-react";
import {
    BotonSistema,
    TarjetaSistema,
    SelectSistema,
    TituloSistema,
    TextoSistema,
    SeparadorSistema,
} from "@/components/ui/sistema-diseno";
import { useNotificaciones } from "@/hooks/use-notificaciones";
import {
    obtenerConfiguracionGrupos,
    actualizarConfiguracionGrupos,
} from "@/lib/actions/configuracion-grupos-vida.actions";
import type { ConfiguracionGruposVida } from "@/lib/actions/configuracion-grupos-vida.actions";

/**
 * Panel de configuración del módulo de grupos de vida.
 * Solo accesible para superadmin (enforced por RLS).
 */
export function ConfiguracionPanel() {
    const [config, setConfig] = useState<ConfiguracionGruposVida | null>(null);
    const [diasExpiracion, setDiasExpiracion] = useState("7");
    const [maxMiembros, setMaxMiembros] = useState<string>("");
    const [permitirLiderOtroGrupo, setPermitirLiderOtroGrupo] = useState("true");
    const [requiereAprobacionPlanificacion, setRequiereAprobacionPlanificacion] = useState("false");
    const [notificarLiderIngreso, setNotificarLiderIngreso] = useState("true");
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const toast = useNotificaciones();

    useEffect(() => {
        const cargar = async () => {
            const resultado = await obtenerConfiguracionGrupos();
            if (resultado.success && resultado.data) {
                const c = resultado.data;
                setConfig(c);
                setDiasExpiracion(String(c.dias_expiracion_solicitud));
                setMaxMiembros(c.max_miembros_por_grupo ? String(c.max_miembros_por_grupo) : "");
                setPermitirLiderOtroGrupo(String(c.permitir_lider_en_otro_grupo));
                setRequiereAprobacionPlanificacion(String(c.requiere_aprobacion_grupo_planificacion));
                setNotificarLiderIngreso(String(c.notificar_lider_ingreso));
            }
            setIsLoading(false);
        };
        cargar();
    }, []);

    const handleGuardar = () => {
        if (!config) return;

        startTransition(async () => {
            const resultado = await actualizarConfiguracionGrupos(config.id, {
                dias_expiracion_solicitud: Number(diasExpiracion),
                max_miembros_por_grupo: maxMiembros ? Number(maxMiembros) : null,
                permitir_lider_en_otro_grupo: permitirLiderOtroGrupo === "true",
                requiere_aprobacion_grupo_planificacion: requiereAprobacionPlanificacion === "true",
                notificar_lider_ingreso: notificarLiderIngreso === "true",
            });

            if (resultado.success) {
                toast.success("Configuración guardada");
                if (resultado.data) setConfig(resultado.data);
            } else {
                toast.error(resultado.error ?? "Error al guardar");
            }
        });
    };

    if (isLoading) {
        return (
            <TarjetaSistema className="p-6 animate-pulse">
                <div className="h-6 bg-muted rounded w-1/3 mb-4" />
                <div className="space-y-3">
                    <div className="h-10 bg-muted rounded" />
                    <div className="h-10 bg-muted rounded" />
                    <div className="h-10 bg-muted rounded" />
                </div>
            </TarjetaSistema>
        );
    }

    if (!config) {
        return (
            <TarjetaSistema className="p-6 text-center">
                <TextoSistema variante="muted">
                    No se pudo cargar la configuración
                </TextoSistema>
            </TarjetaSistema>
        );
    }

    return (
        <TarjetaSistema className="p-6">
            <div className="flex items-center gap-3 mb-5">
                <Settings className="h-5 w-5 text-muted-foreground" />
                <TituloSistema nivel={3}>Configuración de Grupos de Vida</TituloSistema>
            </div>

            <div className="space-y-5">
                {/* Expiración de solicitudes */}
                <ConfigItem
                    titulo="Días de expiración"
                    descripcion="Tiempo antes de que una solicitud pendiente expire automáticamente"
                >
                    <SelectSistema
                        opciones={[
                            { valor: "5", etiqueta: "5 días" },
                            { valor: "7", etiqueta: "7 días" },
                            { valor: "14", etiqueta: "14 días" },
                            { valor: "30", etiqueta: "30 días" },
                        ]}
                        value={diasExpiracion}
                        onValueChange={setDiasExpiracion}
                    />
                </ConfigItem>

                <SeparadorSistema />

                {/* Max miembros por grupo */}
                <ConfigItem
                    titulo="Máximo de miembros por grupo"
                    descripcion="Dejar vacío para sin límite"
                >
                    <SelectSistema
                        opciones={[
                            { valor: "", etiqueta: "Sin límite" },
                            { valor: "10", etiqueta: "10 miembros" },
                            { valor: "15", etiqueta: "15 miembros" },
                            { valor: "20", etiqueta: "20 miembros" },
                            { valor: "25", etiqueta: "25 miembros" },
                            { valor: "30", etiqueta: "30 miembros" },
                            { valor: "50", etiqueta: "50 miembros" },
                        ]}
                        value={maxMiembros}
                        onValueChange={setMaxMiembros}
                    />
                </ConfigItem>

                <SeparadorSistema />

                {/* Líder en otro grupo */}
                <ConfigItem
                    titulo="Permitir líder en otro grupo"
                    descripcion="Si un líder puede también ser miembro de otro grupo"
                >
                    <SelectSistema
                        opciones={[
                            { valor: "true", etiqueta: "Sí" },
                            { valor: "false", etiqueta: "No" },
                        ]}
                        value={permitirLiderOtroGrupo}
                        onValueChange={setPermitirLiderOtroGrupo}
                    />
                </ConfigItem>

                <SeparadorSistema />

                {/* Aprobación en planificación */}
                <ConfigItem
                    titulo="Aprobación en planificación"
                    descripcion="¿Requiere aprobación del DG para grupos en estado planificación?"
                >
                    <SelectSistema
                        opciones={[
                            { valor: "true", etiqueta: "Sí, requiere aprobación" },
                            { valor: "false", etiqueta: "No, libre en planificación" },
                        ]}
                        value={requiereAprobacionPlanificacion}
                        onValueChange={setRequiereAprobacionPlanificacion}
                    />
                </ConfigItem>

                <SeparadorSistema />

                {/* Notificación al líder */}
                <ConfigItem
                    titulo="Notificar al líder"
                    descripcion="Enviar notificación al líder cuando se agrega un miembro a su grupo"
                >
                    <SelectSistema
                        opciones={[
                            { valor: "true", etiqueta: "Sí" },
                            { valor: "false", etiqueta: "No" },
                        ]}
                        value={notificarLiderIngreso}
                        onValueChange={setNotificarLiderIngreso}
                    />
                </ConfigItem>

                <SeparadorSistema />

                {/* Guardar */}
                <div className="flex justify-end">
                    <BotonSistema
                        variante="primario"
                        onClick={handleGuardar}
                        cargando={isPending}
                        disabled={isPending}
                        icono={Save}
                    >
                        Guardar cambios
                    </BotonSistema>
                </div>
            </div>
        </TarjetaSistema>
    );
}

// ─── Helper Component ────────────────────────────────────────────────

function ConfigItem({
    titulo,
    descripcion,
    children,
}: {
    titulo: string;
    descripcion: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex-1 min-w-0">
                <TextoSistema className="font-medium">{titulo}</TextoSistema>
                <TextoSistema variante="muted" tamaño="sm">{descripcion}</TextoSistema>
            </div>
            <div className="w-full sm:w-56 shrink-0">{children}</div>
        </div>
    );
}
