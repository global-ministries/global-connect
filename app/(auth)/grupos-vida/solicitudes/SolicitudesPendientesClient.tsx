"use client";

import { useState, useTransition, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { BotonSistema } from "@/components/ui/sistema-diseno";
import { TablaSolicitudes } from "@/components/grupos-vida/solicitudes/tabla-solicitudes";
import { listarSolicitudesPendientes } from "@/lib/actions/solicitudes-grupo.actions";
import type { SolicitudPendiente } from "@/lib/types/solicitudes-grupo.types";

interface SolicitudesPendientesClientProps {
    solicitudesIniciales: SolicitudPendiente[];
}

/**
 * Componente cliente que maneja la lista de solicitudes pendientes
 * con refresh automático después de procesar una.
 */
export function SolicitudesPendientesClient({
    solicitudesIniciales,
}: SolicitudesPendientesClientProps) {
    const [solicitudes, setSolicitudes] = useState(solicitudesIniciales);
    const [isPending, startTransition] = useTransition();

    const recargar = useCallback(() => {
        startTransition(async () => {
            const resultado = await listarSolicitudesPendientes();
            if (resultado.success && resultado.data) {
                setSolicitudes(resultado.data);
            }
        });
    }, []);

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
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

            <TablaSolicitudes solicitudes={solicitudes} onProcesada={recargar} />
        </div>
    );
}
