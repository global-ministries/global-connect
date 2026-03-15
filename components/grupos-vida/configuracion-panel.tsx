"use client";

import { useState, useTransition, useEffect } from "react";
import { Settings, Save, Clock, Eye, AlertTriangle, Mail, MapPin, UserCog } from "lucide-react";
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
import type { ConfiguracionGruposVida } from "@/lib/types/configuracion-grupos-vida.types";
import { geocodificarDireccionesMasivo, obtenerEstadisticasGeocoding } from "@/lib/actions/geocodificar.actions";

interface ConfiguracionPanelProps {
    /** Datos pre-cargados desde Server Component (COR-006) */
    configInicial?: ConfiguracionGruposVida | null;
}

/**
 * Panel de configuración del módulo de grupos de vida.
 * Solo accesible para superadmin (enforced por RLS).
 * Acepta `configInicial` para evitar waterfall de useEffect.
 */
export function ConfiguracionPanel({ configInicial }: ConfiguracionPanelProps) {
    const [config, setConfig] = useState<ConfiguracionGruposVida | null>(configInicial ?? null);
    const [diasExpiracion, setDiasExpiracion] = useState(configInicial ? String(configInicial.dias_expiracion_solicitud) : "7");
    const [maxMiembros, setMaxMiembros] = useState<string>(configInicial?.max_miembros_por_grupo ? String(configInicial.max_miembros_por_grupo) : "");
    const [permitirLiderOtroGrupo, setPermitirLiderOtroGrupo] = useState(configInicial ? String(configInicial.permitir_lider_en_otro_grupo) : "true");
    const [requiereAprobacionPlanificacion, setRequiereAprobacionPlanificacion] = useState(configInicial ? String(configInicial.requiere_aprobacion_grupo_planificacion) : "false");
    const [notificarLiderIngreso, setNotificarLiderIngreso] = useState(configInicial ? String(configInicial.notificar_lider_ingreso) : "true");
    const [creacionGruposHabilitada, setCreacionGruposHabilitada] = useState(configInicial ? String(configInicial.creacion_grupos_habilitada) : "true");
    const [rolMinimoEliminar, setRolMinimoEliminar] = useState(configInicial?.rol_minimo_eliminar_miembro ?? "director-etapa");
    // Campos de asistencia avanzada (Fase 3)
    const [modoCierre, setModoCierre] = useState(configInicial?.modo_cierre_asistencia ?? "semanal");
    const [diaCierre, setDiaCierre] = useState(String(configInicial?.dia_cierre_semanal ?? 0));
    const [horaCierre, setHoraCierre] = useState(configInicial?.hora_cierre ?? "23:59");
    const [visitantesHabilitados, setVisitantesHabilitados] = useState(String(configInicial?.visitantes_habilitados ?? false));
    const [puntosOracion, setPuntosOracion] = useState(String(configInicial?.puntos_oracion_compartidos ?? false));
    const [umbralAtencion, setUmbralAtencion] = useState(String(configInicial?.umbral_atencion ?? 2));
    const [umbralRiesgo, setUmbralRiesgo] = useState(String(configInicial?.umbral_riesgo ?? 4));
    const [umbralCritico, setUmbralCritico] = useState(String(configInicial?.umbral_critico ?? 6));
    const [correoSemanal, setCorreoSemanal] = useState(String(configInicial?.correo_semanal_habilitado ?? false));
    const [diaCorreo, setDiaCorreo] = useState(String(configInicial?.dia_envio_correo ?? 1));
    const [horaCorreo, setHoraCorreo] = useState(configInicial?.hora_envio_correo ?? "08:00");
    const [isLoading, setIsLoading] = useState(!configInicial);
    const [isPending, startTransition] = useTransition();
    const toast = useNotificaciones();

    // Geocodificación masiva
    const [geoStats, setGeoStats] = useState<{ total: number; conCoordenadas: number; sinCoordenadas: number; porcentaje: number } | null>(null);
    const [geoProcesando, setGeoProcesando] = useState(false);

    // Cargar stats de geocodificación
    useEffect(() => {
        const cargarGeoStats = async () => {
            const res = await obtenerEstadisticasGeocoding();
            if (res.success) setGeoStats({ total: res.total, conCoordenadas: res.conCoordenadas, sinCoordenadas: res.sinCoordenadas, porcentaje: res.porcentaje });
        };
        cargarGeoStats();
    }, []);

    // Fallback: solo fetch si no se pasó configInicial
    useEffect(() => {
        if (configInicial) return;
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
                setCreacionGruposHabilitada(String(c.creacion_grupos_habilitada ?? true));
                setModoCierre(c.modo_cierre_asistencia ?? "semanal");
                setDiaCierre(String(c.dia_cierre_semanal ?? 0));
                setHoraCierre(c.hora_cierre ?? "23:59");
                setVisitantesHabilitados(String(c.visitantes_habilitados ?? false));
                setPuntosOracion(String(c.puntos_oracion_compartidos ?? false));
                setUmbralAtencion(String(c.umbral_atencion ?? 2));
                setUmbralRiesgo(String(c.umbral_riesgo ?? 4));
                setUmbralCritico(String(c.umbral_critico ?? 6));
                setCorreoSemanal(String(c.correo_semanal_habilitado ?? false));
                setDiaCorreo(String(c.dia_envio_correo ?? 1));
                setRolMinimoEliminar(c.rol_minimo_eliminar_miembro ?? "director-etapa");
                setHoraCorreo(c.hora_envio_correo ?? "08:00");
            }
            setIsLoading(false);
        };
        cargar();
    }, [configInicial]);

    const handleGuardar = () => {
        if (!config) return;

        startTransition(async () => {
            const resultado = await actualizarConfiguracionGrupos(config.id, {
                dias_expiracion_solicitud: Number(diasExpiracion),
                max_miembros_por_grupo: maxMiembros ? Number(maxMiembros) : null,
                permitir_lider_en_otro_grupo: permitirLiderOtroGrupo === "true",
                requiere_aprobacion_grupo_planificacion: requiereAprobacionPlanificacion === "true",
                notificar_lider_ingreso: notificarLiderIngreso === "true",
                creacion_grupos_habilitada: creacionGruposHabilitada === "true",
                // Asistencia avanzada (Fase 3)
                modo_cierre_asistencia: modoCierre as "semanal" | "libre" | "ultimas_2_semanas" | "ultimo_mes",
                dia_cierre_semanal: Number(diaCierre),
                hora_cierre: horaCierre,
                visitantes_habilitados: visitantesHabilitados === "true",
                puntos_oracion_compartidos: puntosOracion === "true",
                umbral_atencion: Number(umbralAtencion),
                umbral_riesgo: Number(umbralRiesgo),
                umbral_critico: Number(umbralCritico),
                correo_semanal_habilitado: correoSemanal === "true",
                dia_envio_correo: Number(diaCorreo),
                hora_envio_correo: horaCorreo,
                rol_minimo_eliminar_miembro: rolMinimoEliminar as 'director-etapa' | 'director-general' | 'pastor' | 'admin',
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
                {/* Creación de grupos */}
                <ConfigItem
                    titulo="Creación de grupos"
                    descripcion="Habilita o deshabilita la opción para crear nuevos grupos de vida en todo el sistema"
                >
                    <SelectSistema
                        opciones={[
                            { valor: "true", etiqueta: "Habilitada" },
                            { valor: "false", etiqueta: "Deshabilitada" },
                        ]}
                        value={creacionGruposHabilitada}
                        onValueChange={setCreacionGruposHabilitada}
                    />
                </ConfigItem>

                <SeparadorSistema />

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

                {/* ── Sección Permisos de Miembros ── */}
                <div className="flex items-center gap-2 mt-4">
                    <UserCog className="h-4 w-4 text-muted-foreground" />
                    <TituloSistema nivel={4}>Permisos de gestión de miembros</TituloSistema>
                </div>

                <ConfigItem
                    titulo="Eliminar miembro de grupo de vida"
                    descripcion="Define desde qué rol se puede eliminar un miembro del grupo directamente. Roles inferiores enviarán una solicitud a un superior para aprobación"
                >
                    <SelectSistema
                        opciones={[
                            { valor: "director-etapa", etiqueta: "Director de Etapa" },
                            { valor: "director-general", etiqueta: "Director General" },
                            { valor: "pastor", etiqueta: "Pastor" },
                            { valor: "admin", etiqueta: "Administrador" },
                        ]}
                        value={rolMinimoEliminar}
                        onValueChange={setRolMinimoEliminar}
                    />
                </ConfigItem>

                <SeparadorSistema />

                {/* ── Sección Asistencia Avanzada ── */}
                <div className="flex items-center gap-2 mt-4">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <TituloSistema nivel={4}>Asistencia Avanzada</TituloSistema>
                </div>

                <ConfigItem
                    titulo="Ventana de edición"
                    descripcion="Cuánto tiempo tiene el líder para registrar/editar asistencia"
                >
                    <SelectSistema
                        opciones={[
                            { valor: "semanal", etiqueta: "Hasta cierre semanal" },
                            { valor: "libre", etiqueta: "Sin restricción" },
                            { valor: "ultimas_2_semanas", etiqueta: "Últimas 2 semanas" },
                            { valor: "ultimo_mes", etiqueta: "Último mes" },
                        ]}
                        value={modoCierre}
                        onValueChange={setModoCierre}
                    />
                </ConfigItem>

                {modoCierre === "semanal" && (
                    <>
                        <ConfigItem
                            titulo="Día de cierre"
                            descripcion="Día de la semana en que cierra la ventana"
                        >
                            <SelectSistema
                                opciones={[
                                    { valor: "0", etiqueta: "Domingo" },
                                    { valor: "1", etiqueta: "Lunes" },
                                    { valor: "2", etiqueta: "Martes" },
                                    { valor: "3", etiqueta: "Miércoles" },
                                    { valor: "4", etiqueta: "Jueves" },
                                    { valor: "5", etiqueta: "Viernes" },
                                    { valor: "6", etiqueta: "Sábado" },
                                ]}
                                value={diaCierre}
                                onValueChange={setDiaCierre}
                            />
                        </ConfigItem>
                    </>
                )}

                <SeparadorSistema />

                <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <TituloSistema nivel={4}>Funciones opcionales</TituloSistema>
                </div>

                <ConfigItem
                    titulo="Visitantes"
                    descripcion="Permitir registro de visitantes no miembros"
                >
                    <SelectSistema
                        opciones={[
                            { valor: "true", etiqueta: "Habilitado" },
                            { valor: "false", etiqueta: "Deshabilitado" },
                        ]}
                        value={visitantesHabilitados}
                        onValueChange={setVisitantesHabilitados}
                    />
                </ConfigItem>

                <ConfigItem
                    titulo="Puntos de oración"
                    descripcion="Compartir puntos de oración con miembros del grupo"
                >
                    <SelectSistema
                        opciones={[
                            { valor: "true", etiqueta: "Visibles" },
                            { valor: "false", etiqueta: "Solo líder" },
                        ]}
                        value={puntosOracion}
                        onValueChange={setPuntosOracion}
                    />
                </ConfigItem>

                <SeparadorSistema />

                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <TituloSistema nivel={4}>Umbrales de riesgo</TituloSistema>
                </div>

                <ConfigItem
                    titulo="Atención"
                    descripcion={`Semanas ausente para marcar como "Atención"`}
                >
                    <SelectSistema
                        opciones={[1, 2, 3, 4].map(n => ({ valor: String(n), etiqueta: `${n} semanas` }))}
                        value={umbralAtencion}
                        onValueChange={setUmbralAtencion}
                    />
                </ConfigItem>

                <ConfigItem
                    titulo="Riesgo"
                    descripcion={`Semanas ausente para marcar como "Riesgo"`}
                >
                    <SelectSistema
                        opciones={[2, 3, 4, 6, 8].map(n => ({ valor: String(n), etiqueta: `${n} semanas` }))}
                        value={umbralRiesgo}
                        onValueChange={setUmbralRiesgo}
                    />
                </ConfigItem>

                <ConfigItem
                    titulo="Crítico"
                    descripcion={`Semanas ausente para marcar como "Crítico"`}
                >
                    <SelectSistema
                        opciones={[4, 6, 8, 10, 12].map(n => ({ valor: String(n), etiqueta: `${n} semanas` }))}
                        value={umbralCritico}
                        onValueChange={setUmbralCritico}
                    />
                </ConfigItem>

                <SeparadorSistema />

                <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <TituloSistema nivel={4}>Correo semanal</TituloSistema>
                </div>

                <ConfigItem
                    titulo="Enviar resumen semanal"
                    descripcion="Envía un correo con el resumen de asistencia a los líderes"
                >
                    <SelectSistema
                        opciones={[
                            { valor: "true", etiqueta: "Habilitado" },
                            { valor: "false", etiqueta: "Deshabilitado" },
                        ]}
                        value={correoSemanal}
                        onValueChange={setCorreoSemanal}
                    />
                </ConfigItem>

                {
                    correoSemanal === "true" && (
                        <ConfigItem
                            titulo="Día de envío"
                            descripcion="Día de la semana para enviar el resumen"
                        >
                            <SelectSistema
                                opciones={[
                                    { valor: "0", etiqueta: "Domingo" },
                                    { valor: "1", etiqueta: "Lunes" },
                                    { valor: "2", etiqueta: "Martes" },
                                    { valor: "3", etiqueta: "Miércoles" },
                                    { valor: "4", etiqueta: "Jueves" },
                                    { valor: "5", etiqueta: "Viernes" },
                                    { valor: "6", etiqueta: "Sábado" },
                                ]}
                                value={diaCorreo}
                                onValueChange={setDiaCorreo}
                            />
                        </ConfigItem>
                    )
                }

                <SeparadorSistema />

                {/* ── Geocodificación Masiva ── */}
                <div className="flex items-center gap-2 mt-4">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <TituloSistema nivel={4}>Geocodificación masiva</TituloSistema>
                </div>

                <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
                    {geoStats ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                            <div>
                                <TextoSistema className="text-lg font-bold">{geoStats.total}</TextoSistema>
                                <TextoSistema variante="muted" tamaño="sm">Direcciones</TextoSistema>
                            </div>
                            <div>
                                <TextoSistema className="text-lg font-bold text-green-600">{geoStats.conCoordenadas}</TextoSistema>
                                <TextoSistema variante="muted" tamaño="sm">Con coordenadas</TextoSistema>
                            </div>
                            <div>
                                <TextoSistema className="text-lg font-bold text-orange-500">{geoStats.sinCoordenadas}</TextoSistema>
                                <TextoSistema variante="muted" tamaño="sm">Sin coordenadas</TextoSistema>
                            </div>
                            <div>
                                <TextoSistema className="text-lg font-bold">{geoStats.porcentaje}%</TextoSistema>
                                <TextoSistema variante="muted" tamaño="sm">Cobertura</TextoSistema>
                            </div>
                        </div>
                    ) : (
                        <TextoSistema variante="muted" tamaño="sm">Cargando estadísticas...</TextoSistema>
                    )}

                    <TextoSistema variante="muted" tamaño="sm">
                        Geocodifica las direcciones sin coordenadas usando OpenStreetMap (Nominatim).
                        Proceso: ~1 dirección por segundo.
                    </TextoSistema>

                    <BotonSistema
                        variante="outline"
                        icono={MapPin}
                        cargando={geoProcesando}
                        disabled={geoProcesando || (geoStats?.sinCoordenadas === 0)}
                        onClick={async () => {
                            setGeoProcesando(true);
                            try {
                                const res = await geocodificarDireccionesMasivo(50);
                                if (res.success) {
                                    toast.success(`Geocodificadas: ${res.totalGeocodificadas} de ${res.totalProcesadas}`);
                                    // Refrescar stats
                                    const stats = await obtenerEstadisticasGeocoding();
                                    if (stats.success) setGeoStats({ total: stats.total, conCoordenadas: stats.conCoordenadas, sinCoordenadas: stats.sinCoordenadas, porcentaje: stats.porcentaje });
                                } else {
                                    toast.error(res.error ?? 'Error en geocodificación');
                                }
                            } catch {
                                toast.error('Error inesperado');
                            } finally {
                                setGeoProcesando(false);
                            }
                        }}
                    >
                        {geoProcesando ? 'Procesando...' : geoStats?.sinCoordenadas === 0 ? 'Todas geocodificadas' : `Geocodificar (${geoStats?.sinCoordenadas ?? '?'} pendientes)`}
                    </BotonSistema>
                </div>

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
            </div >
        </TarjetaSistema >
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
