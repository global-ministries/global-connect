"use client";

import { useState } from "react";
import { TarjetaSistema, BotonSistema, TextareaSistema, TituloSistema } from "@/components/ui/sistema-diseno";
import { procesarAprobacionCasa } from "@/lib/actions/casas-anfitrionas.actions";
import { useNotificaciones } from "@/hooks/use-notificaciones";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle } from "lucide-react";

interface AprobacionCasaClientProps {
    casaId: string;
}

export function AprobacionCasaClient({ casaId }: AprobacionCasaClientProps) {
    const [notas, setNotas] = useState("");
    const [cargando, setCargando] = useState(false);
    const toast = useNotificaciones();
    const router = useRouter();

    const handleAccion = async (accion: "aprobar" | "rechazar") => {
        setCargando(true);
        try {
            const resultado = await procesarAprobacionCasa(casaId, accion, notas || undefined);
            if (resultado.success) {
                toast.success(accion === "aprobar" ? "Casa aprobada exitosamente" : "Casa rechazada");
                router.refresh();
            } else {
                toast.error(resultado.error ?? "Error al procesar");
            }
        } finally {
            setCargando(false);
        }
    };

    return (
        <TarjetaSistema variante="elevated">
            <TituloSistema nivel={4} className="mb-3">Aprobación</TituloSistema>
            <div className="space-y-3">
                <TextareaSistema
                    label="Notas (opcional)"
                    filas={2}
                    placeholder="Notas sobre la aprobación o rechazo..."
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                />
                <div className="flex gap-2">
                    <BotonSistema
                        variante="primario"
                        tamaño="sm"
                        icono={CheckCircle}
                        cargando={cargando}
                        onClick={() => handleAccion("aprobar")}
                    >
                        Aprobar
                    </BotonSistema>
                    <BotonSistema
                        variante="outline"
                        tamaño="sm"
                        icono={XCircle}
                        cargando={cargando}
                        onClick={() => handleAccion("rechazar")}
                    >
                        Rechazar
                    </BotonSistema>
                </div>
            </div>
        </TarjetaSistema>
    );
}
