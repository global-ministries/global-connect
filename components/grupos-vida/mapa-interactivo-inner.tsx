"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TextoSistema, BadgeSistema } from "@/components/ui/sistema-diseno";
import { BadgeEstadoCiclo } from "./badge-estado-ciclo";
import { describeHostHomeLocation, type GrupoMapa } from "./mapa-host-home-model";
import { Users, Clock, MapPin, Home } from "lucide-react";

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

function HostHomeLocationDetails({ grupo }: { grupo: GrupoMapa }) {
    const location = describeHostHomeLocation(grupo);

    return (
        <>
            <div className="flex items-start gap-1.5 text-xs">
                <Home className="h-3 w-3 flex-shrink-0 mt-0.5 text-orange-500" />
                <div>
                    <span className="font-medium text-foreground">{location.locationTypeLabel}</span>
                </div>
            </div>

            <TextoSistema
                variante="muted"
                tamaño="sm"
                className="flex items-center gap-1"
            >
                <MapPin className="h-3 w-3 flex-shrink-0" />
                {location.publicLocationLabel}
            </TextoSistema>

            {location.publicNotes && (
                <TextoSistema variante="muted" tamaño="sm">
                    {location.publicNotes}
                </TextoSistema>
            )}

            <TextoSistema variante="muted" tamaño="sm">
                {location.privacyMessage}
            </TextoSistema>
        </>
    );
}

/**
 * Componente interno del mapa interactivo con Leaflet.
 * Renderiza marcadores para cada grupo con popups informativos
 * que muestran nombre, estado, ubicación aprobada, horario y miembros.
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
                        <Popup minWidth={240} maxWidth={320}>
                            <div className="space-y-2 p-1">
                                {/* Nombre + estado */}
                                <div className="flex items-center justify-between gap-2">
                                    <a
                                        href={`/grupos-vida/${grupo.id}`}
                                        className="text-sm font-semibold text-foreground hover:text-orange-600 transition-colors underline-offset-2 hover:underline"
                                    >
                                        {grupo.nombre}
                                    </a>
                                    <BadgeEstadoCiclo estado={grupo.estado_ciclo} tamaño="sm" />
                                </div>

                                {/* Segmento + Temporada */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <BadgeSistema variante="info" tamaño="sm">
                                        {grupo.segmento}
                                    </BadgeSistema>
                                    {grupo.temporada && (
                                        <BadgeSistema variante="default" tamaño="sm">
                                            {grupo.temporada}
                                        </BadgeSistema>
                                    )}
                                </div>

                                <HostHomeLocationDetails grupo={grupo} />

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

                                {/* Link al grupo */}
                                <div className="pt-1 border-t border-border/50">
                                    <a
                                        href={`/grupos-vida/${grupo.id}`}
                                        className="text-xs font-medium text-orange-600 hover:text-orange-700 transition-colors"
                                    >
                                        Ver detalle del grupo →
                                    </a>
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
}
