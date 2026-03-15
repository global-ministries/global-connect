"use client";

import { useState, useTransition } from "react";
import { UserPlus, ArrowRight, UserMinus, Shield } from "lucide-react";
import {
    BotonSistema,
    TarjetaSistema,
    InputSistema,
    SelectSistema,
    TextareaSistema,
    TituloSistema,
    TextoSistema,
    SeparadorSistema,
} from "@/components/ui/sistema-diseno";
import { useNotificaciones } from "@/hooks/use-notificaciones";
import { crearSolicitudGrupo } from "@/lib/actions/solicitudes-grupo.actions";
import type { TipoSolicitud } from "@/lib/types/solicitudes-grupo.types";

interface GrupoOption {
    id: string;
    nombre: string;
    segmento: string;
}

interface FormNuevaSolicitudProps {
    /** Grupos disponibles para selección */
    grupos: GrupoOption[];
    /** Usuario que se quiere agregar/mover (preseleccionado si viene de detalle) */
    usuarioPreseleccionado?: { id: string; nombre: string; apellido: string };
    onCreada?: () => void;
    onCancelar?: () => void;
}

const TIPOS_SOLICITUD: { valor: TipoSolicitud; etiqueta: string; icono: typeof UserPlus }[] = [
    { valor: "ingreso", etiqueta: "Ingreso a Grupo", icono: UserPlus },
    { valor: "traslado", etiqueta: "Traslado entre Grupos", icono: ArrowRight },
    { valor: "egreso", etiqueta: "Egreso de Grupo", icono: UserMinus },
    { valor: "cambio_rol", etiqueta: "Cambio de Rol", icono: Shield },
];

/**
 * Formulario para crear una nueva solicitud de gestión de miembros.
 * Soporta los tipos: ingreso, traslado, egreso, cambio_rol.
 */
export function FormNuevaSolicitud({
    grupos,
    usuarioPreseleccionado,
    onCreada,
    onCancelar,
}: FormNuevaSolicitudProps) {
    const [tipo, setTipo] = useState<TipoSolicitud>("ingreso");
    const [usuarioId, setUsuarioId] = useState(usuarioPreseleccionado?.id ?? "");
    const [grupoId, setGrupoId] = useState("");
    const [grupoOrigenId, setGrupoOrigenId] = useState("");
    const [rolSolicitado, setRolSolicitado] = useState("");
    const [motivo, setMotivo] = useState("");
    const [isPending, startTransition] = useTransition();
    const toast = useNotificaciones();

    const necesitaGrupoOrigen = tipo === "traslado";
    const necesitaRol = tipo === "cambio_rol";
    const necesitaGrupoDestino = tipo !== "egreso";

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        startTransition(async () => {
            const resultado = await crearSolicitudGrupo({
                tipo,
                usuario_id: usuarioId,
                grupo_id: grupoId,
                grupo_origen_id: necesitaGrupoOrigen ? grupoOrigenId : undefined,
                rol_solicitado: necesitaRol ? rolSolicitado : undefined,
                motivo: motivo.trim() || undefined,
            });

            if (resultado.success) {
                const modo = resultado.data?.modo;
                toast.success(
                    modo === "directo"
                        ? "Acción ejecutada directamente"
                        : "Solicitud creada exitosamente"
                );
                onCreada?.();
            } else {
                toast.error(resultado.error ?? "Error al crear la solicitud");
            }
        });
    };

    const opcionesGrupos = grupos.map((g) => ({
        valor: g.id,
        etiqueta: `${g.nombre} — ${g.segmento}`,
    }));

    return (
        <TarjetaSistema className="p-6">
            <TituloSistema nivel={3} className="mb-4">Nueva Solicitud</TituloSistema>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Tipo de solicitud */}
                <SelectSistema
                    label="Tipo de solicitud"
                    opciones={TIPOS_SOLICITUD.map((t) => ({
                        valor: t.valor,
                        etiqueta: t.etiqueta,
                    }))}
                    value={tipo}
                    onValueChange={(v) => setTipo(v as TipoSolicitud)}
                />

                {/* Usuario */}
                {usuarioPreseleccionado ? (
                    <div className="rounded-xl bg-muted/50 p-3">
                        <TextoSistema variante="muted" tamaño="sm">Miembro</TextoSistema>
                        <TextoSistema className="font-medium">
                            {usuarioPreseleccionado.nombre} {usuarioPreseleccionado.apellido}
                        </TextoSistema>
                    </div>
                ) : (
                    <InputSistema
                        label="ID del usuario"
                        value={usuarioId}
                        onChange={(e) => setUsuarioId(e.target.value)}
                        placeholder="UUID del usuario"
                    />
                )}

                {/* Grupo destino */}
                {necesitaGrupoDestino && (
                    <SelectSistema
                        label="Grupo destino"
                        placeholder="Seleccionar grupo"
                        opciones={opcionesGrupos}
                        value={grupoId}
                        onValueChange={setGrupoId}
                    />
                )}

                {/* Grupo origen (traslado) */}
                {necesitaGrupoOrigen && (
                    <SelectSistema
                        label="Grupo origen"
                        placeholder="Seleccionar grupo actual"
                        opciones={opcionesGrupos}
                        value={grupoOrigenId}
                        onValueChange={setGrupoOrigenId}
                    />
                )}

                {/* Grupo para egreso */}
                {tipo === "egreso" && (
                    <SelectSistema
                        label="Grupo"
                        placeholder="Seleccionar grupo"
                        opciones={opcionesGrupos}
                        value={grupoId}
                        onValueChange={setGrupoId}
                    />
                )}

                {/* Rol solicitado (cambio_rol) */}
                {necesitaRol && (
                    <SelectSistema
                        label="Rol solicitado"
                        opciones={[
                            { valor: "Líder", etiqueta: "Líder" },
                            { valor: "Colíder", etiqueta: "Colíder" },
                            { valor: "Miembro", etiqueta: "Miembro" },
                        ]}
                        value={rolSolicitado}
                        onValueChange={setRolSolicitado}
                    />
                )}

                {/* Motivo */}
                <TextareaSistema
                    label="Motivo (opcional)"
                    filas={3}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Describe el motivo de la solicitud..."
                />

                <SeparadorSistema />

                {/* Acciones */}
                <div className="flex gap-3 justify-end">
                    {onCancelar && (
                        <BotonSistema
                            type="button"
                            variante="outline"
                            onClick={onCancelar}
                            disabled={isPending}
                        >
                            Cancelar
                        </BotonSistema>
                    )}
                    <BotonSistema
                        type="submit"
                        variante="primario"
                        cargando={isPending}
                        disabled={isPending || !grupoId || !usuarioId}
                    >
                        Crear Solicitud
                    </BotonSistema>
                </div>
            </form>
        </TarjetaSistema>
    );
}
