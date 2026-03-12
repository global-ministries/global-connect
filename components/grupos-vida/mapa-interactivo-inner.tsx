"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TextoSistema, BadgeSistema } from "@/components/ui/sistema-diseno";
import { BadgeEstadoCiclo } from "./badge-estado-ciclo";
import { Users, Clock, MapPin } from "lucide-react";

// Fix Leaflet default icons issue with Next.js/Webpack
const iconDefault = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = iconDefault;

export interface GrupoMapa {
    id: string;
    nombre: string;
    latitud: number;
    longitud: number;
    direccion: string;
    lugar_reunion: string;
    dia_reunion: string | null;
    hora_reunion: string | null;
    estado_ciclo: string;
    segmento: string;
    temporada: string;
    total_miembros: number;
    capacidad_maxima: number | null;
    lideres: Array<{ nombre: string; foto: string | null }> | null;
}

interface MapaInteractivoInnerProps {
    grupos: GrupoMapa[];
    centro?: [number, number];
    zoom?: number;
    altura?: string;
    onGrupoClick?: (grupoId: string) => void;
}

/** Auto-fit bounds to markers */
function FitBounds({ grupos }: { grupos: GrupoMapa[] }) {
    const map = useMap();
    const fitted = useRef(false);

    useEffect(() => {
        if (fitted.current || grupos.length === 0) return;
        const bounds = L.latLngBounds(
            grupos.map((g) => [g.latitud, g.longitud] as [number, number])
        );
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        fitted.current = true;
    }, [grupos, map]);

    return null;
}

/**
 * Componente interno del mapa interactivo con Leaflet.
 * Renderiza marcadores para cada grupo con popups informativos
 * que muestran nombre, estado, dirección, horario, miembros y líderes.
 * Auto-ajusta los bounds para mostrar todos los marcadores.
 */
export function MapaInteractivoInner({
    grupos,
    centro = [10.07, -69.32], // Barquisimeto, Lara, Venezuela
    zoom = 12,
    altura = "500px",
    onGrupoClick,
}: MapaInteractivoInnerProps) {
    const gruposConCoords = grupos.filter(
        (g) => g.latitud != null && g.longitud != null
    );

    return (
        <div className="overflow-hidden rounded-2xl border border-border" style={{ height: altura }}>
            <MapContainer
                center={centro}
                zoom={zoom}
                scrollWheelZoom
                style={{ height: "100%", width: "100%" }}
                className="z-0"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {gruposConCoords.length > 0 && <FitBounds grupos={gruposConCoords} />}

                {gruposConCoords.map((grupo) => (
                    <Marker
                        key={grupo.id}
                        position={[grupo.latitud, grupo.longitud]}
                        eventHandlers={{
                            click: () => onGrupoClick?.(grupo.id),
                        }}
                    >
                        <Popup minWidth={220} maxWidth={300}>
                            <div className="space-y-2 p-1">
                                {/* Nombre + estado */}
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-semibold text-foreground">
                                        {grupo.nombre}
                                    </span>
                                    <BadgeEstadoCiclo estado={grupo.estado_ciclo} tamaño="sm" />
                                </div>

                                {/* Segmento */}
                                <BadgeSistema variante="info" tamaño="sm">
                                    {grupo.segmento}
                                </BadgeSistema>

                                {/* Dirección */}
                                <TextoSistema
                                    variante="muted"
                                    tamaño="sm"
                                    className="flex items-center gap-1"
                                >
                                    <MapPin className="h-3 w-3 flex-shrink-0" />
                                    {grupo.lugar_reunion} — {grupo.direccion}
                                </TextoSistema>

                                {/* Horario */}
                                {grupo.dia_reunion && (
                                    <TextoSistema
                                        variante="muted"
                                        tamaño="sm"
                                        className="flex items-center gap-1"
                                    >
                                        <Clock className="h-3 w-3 flex-shrink-0" />
                                        {grupo.dia_reunion}
                                        {grupo.hora_reunion && ` a las ${grupo.hora_reunion}`}
                                    </TextoSistema>
                                )}

                                {/* Miembros */}
                                <TextoSistema
                                    variante="muted"
                                    tamaño="sm"
                                    className="flex items-center gap-1"
                                >
                                    <Users className="h-3 w-3 flex-shrink-0" />
                                    {grupo.total_miembros} miembro
                                    {grupo.total_miembros !== 1 && "s"}
                                    {grupo.capacidad_maxima &&
                                        ` / ${grupo.capacidad_maxima} cap.`}
                                </TextoSistema>

                                {/* Líderes */}
                                {grupo.lideres && grupo.lideres.length > 0 && (
                                    <div className="pt-1 text-xs text-muted-foreground">
                                        <span className="font-medium">Líderes:</span>{" "}
                                        {grupo.lideres.map((l) => l.nombre).join(", ")}
                                    </div>
                                )}
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
}
