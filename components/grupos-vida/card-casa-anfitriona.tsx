"use client";

import { TarjetaSistema, TextoSistema, TituloSistema, BadgeSistema } from "@/components/ui/sistema-diseno";
import { Home, Users, MapPin, CheckCircle, Clock, XCircle } from "lucide-react";
import Image from "next/image";

interface CardCasaAnfitrionaProps {
    id: string;
    nombreLugar: string;
    capacidadMaxima: number | null;
    anfitrionNombre: string;
    anfitrionParejaNombre: string | null;
    calle: string | null;
    barrio: string | null;
    aprobada: boolean;
    activa: boolean;
    gruposUsando: number;
    fotosUrls: string[];
    onClick?: (id: string) => void;
}

/**
 * Tarjeta que muestra la información resumida de una casa anfitriona.
 * Incluye foto, nombre, anfitrión, dirección, estado y capacidad.
 */
export function CardCasaAnfitriona({
    id,
    nombreLugar,
    capacidadMaxima,
    anfitrionNombre,
    anfitrionParejaNombre,
    calle,
    barrio,
    aprobada,
    activa,
    gruposUsando,
    fotosUrls,
    onClick,
}: CardCasaAnfitrionaProps) {
    const estadoBadge = aprobada && activa
        ? { variante: "success" as const, icono: CheckCircle, texto: "Aprobada" }
        : aprobada && !activa
            ? { variante: "warning" as const, icono: Clock, texto: "Inactiva" }
            : { variante: "error" as const, icono: XCircle, texto: "Pendiente" };

    const direccionTexto = [calle, barrio].filter(Boolean).join(", ") || "Sin dirección";

    return (
        <TarjetaSistema
            variante="default"
            className="cursor-pointer transition-colors duration-200 hover:bg-muted/50"
            onClick={() => onClick?.(id)}
        >
            <div className="flex gap-4">
                {/* Foto o placeholder */}
                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
                    {fotosUrls.length > 0 ? (
                        <Image
                            src={fotosUrls[0]}
                            alt={nombreLugar}
                            fill
                            className="object-cover"
                            sizes="80px"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center">
                            <Home className="h-8 w-8 text-muted-foreground" />
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                    <div className="flex items-center justify-between gap-2">
                        <TituloSistema nivel={4} className="truncate">
                            {nombreLugar}
                        </TituloSistema>
                        <BadgeSistema variante={estadoBadge.variante} tamaño="sm">
                            <estadoBadge.icono className="mr-1 h-3 w-3" />
                            {estadoBadge.texto}
                        </BadgeSistema>
                    </div>

                    <TextoSistema variante="muted" tamaño="sm" className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 flex-shrink-0" />
                        {anfitrionNombre}
                        {anfitrionParejaNombre && ` y ${anfitrionParejaNombre}`}
                    </TextoSistema>

                    <TextoSistema variante="muted" tamaño="sm" className="flex items-center gap-1 truncate">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                        {direccionTexto}
                    </TextoSistema>

                    <div className="flex items-center gap-3 pt-0.5">
                        {capacidadMaxima && (
                            <TextoSistema variante="sutil" tamaño="sm">
                                Cap: {capacidadMaxima}
                            </TextoSistema>
                        )}
                        {gruposUsando > 0 && (
                            <TextoSistema variante="sutil" tamaño="sm">
                                {gruposUsando} grupo{gruposUsando !== 1 ? "s" : ""} activo{gruposUsando !== 1 ? "s" : ""}
                            </TextoSistema>
                        )}
                    </div>
                </div>
            </div>
        </TarjetaSistema>
    );
}
