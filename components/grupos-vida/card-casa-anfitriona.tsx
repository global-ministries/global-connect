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
    /** URLs de fotos de perfil de los propietarios (anfitrión + cónyuge) */
    fotosUrls: string[];
    onClick?: (id: string) => void;
}

/**
 * Tarjeta que muestra la información resumida de una casa anfitriona.
 * Incluye avatares de propietarios, nombre, dirección, estado y capacidad.
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
                {/* Avatares de propietarios */}
                <div className="flex-shrink-0">
                    {fotosUrls.length > 0 ? (
                        <div className="flex -space-x-3">
                            {fotosUrls.slice(0, 2).map((url, i) => (
                                <div
                                    key={i}
                                    className="relative h-12 w-12 overflow-hidden rounded-full border-2 border-card"
                                    style={{ zIndex: fotosUrls.length - i }}
                                >
                                    <Image
                                        src={url}
                                        alt={i === 0 ? anfitrionNombre : (anfitrionParejaNombre ?? "Cónyuge")}
                                        fill
                                        className="object-cover"
                                        sizes="48px"
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                            <Home className="h-6 w-6 text-muted-foreground" />
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
