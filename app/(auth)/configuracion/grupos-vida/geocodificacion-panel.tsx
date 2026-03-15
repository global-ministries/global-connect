"use client";

import { useState } from "react";
import { BotonSistema, TextoSistema } from "@/components/ui/sistema-diseno";
import { geocodificarDireccionesMasivo } from "@/lib/actions/geocodificar.actions";
import { useNotificaciones } from "@/hooks/use-notificaciones";
import { useRouter } from "next/navigation";
import { MapPin, Loader2, CheckCircle, AlertTriangle } from "lucide-react";

interface GeocodificacionPanelProps {
    sinCoordenadas: number;
}

export function GeocodificacionPanel({ sinCoordenadas }: GeocodificacionPanelProps) {
    const [ejecutando, setEjecutando] = useState(false);
    const [resultado, setResultado] = useState<{
        totalProcesadas: number;
        totalGeocodificadas: number;
        totalFallidas: number;
    } | null>(null);
    const toast = useNotificaciones();
    const router = useRouter();

    const handleGeocodificar = async () => {
        setEjecutando(true);
        setResultado(null);

        try {
            const res = await geocodificarDireccionesMasivo(50);
            if (res.success) {
                setResultado({
                    totalProcesadas: res.totalProcesadas,
                    totalGeocodificadas: res.totalGeocodificadas,
                    totalFallidas: res.totalFallidas,
                });
                toast.success(`${res.totalGeocodificadas} direcciones geocodificadas`);
                router.refresh();
            } else {
                toast.error(res.error ?? "Error al geocodificar");
            }
        } finally {
            setEjecutando(false);
        }
    };

    if (sinCoordenadas === 0) {
        return (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <TextoSistema tamaño="sm">
                    Todas las direcciones tienen coordenadas. ¡El mapa está completo!
                </TextoSistema>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <TextoSistema tamaño="sm">
                    {sinCoordenadas} dirección{sinCoordenadas !== 1 && "es"} sin coordenadas.
                    El proceso toma ~{Math.ceil(sinCoordenadas * 1.1 / 60)} minuto{Math.ceil(sinCoordenadas * 1.1 / 60) !== 1 && "s"} (rate limit de Nominatim/OSM).
                </TextoSistema>
            </div>

            <BotonSistema
                variante="primario"
                icono={ejecutando ? Loader2 : MapPin}
                cargando={ejecutando}
                onClick={handleGeocodificar}
            >
                {ejecutando ? "Geocodificando..." : `Geocodificar ${Math.min(sinCoordenadas, 50)} direcciones`}
            </BotonSistema>

            {resultado && (
                <div className="space-y-1 rounded-lg border border-border p-3">
                    <TextoSistema tamaño="sm">
                        <span className="font-medium">Procesadas:</span> {resultado.totalProcesadas}
                    </TextoSistema>
                    <TextoSistema tamaño="sm" className="text-green-600">
                        <span className="font-medium">Geocodificadas:</span> {resultado.totalGeocodificadas}
                    </TextoSistema>
                    {resultado.totalFallidas > 0 && (
                        <TextoSistema tamaño="sm" className="text-amber-600">
                            <span className="font-medium">Fallidas:</span> {resultado.totalFallidas}
                        </TextoSistema>
                    )}
                </div>
            )}
        </div>
    );
}
