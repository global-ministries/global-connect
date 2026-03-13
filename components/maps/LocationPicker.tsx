"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default icons issue with Next.js/Webpack
const iconDefault = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = iconDefault;

export interface LocationPickerProps {
  /** Coordenada lat inicial (puede omitirse si se provee center) */
  lat?: number;
  /** Coordenada lng inicial (puede omitirse si se provee center) */
  lng?: number;
  /** Centro del mapa. Si falta o es inválido se usa fallback */
  center?: { lat: number; lng: number };
  /** Callback cuando se mueve el marcador */
  onLocationChange?: (coords: { lat: number; lng: number }) => void;
  /** Permitir arrastrar el marcador */
  draggable?: boolean;
  /** Zoom inicial opcional (default 15) */
  zoom?: number;
  /** Alto del mapa (px) */
  height?: number;
  /** Desactivar UI por defecto (zoom controls, etc.) */
  disableDefaultUI?: boolean;
}

/** Componente hijo que sincroniza el centro del mapa cuando cambian las props */
function MapSync({
  center,
}: {
  center: { lat: number; lng: number };
}) {
  const map = useMap();
  const prevCenter = useRef(center);

  useEffect(() => {
    if (
      prevCenter.current.lat !== center.lat ||
      prevCenter.current.lng !== center.lng
    ) {
      map.flyTo([center.lat, center.lng], map.getZoom(), { duration: 1.2 });
      prevCenter.current = center;
    }
  }, [center.lat, center.lng, map]);

  return null;
}

/** Fallback: Barquisimeto, Lara, Venezuela */
const FALLBACK_CENTER = { lat: 10.07, lng: -69.32 };

/**
 * LocationPicker con Leaflet + OpenStreetMap.
 * Zero API keys requeridas. Misma API pública que la versión anterior.
 */
export default function LocationPicker(props: LocationPickerProps) {
  const {
    lat,
    lng,
    center,
    onLocationChange,
    draggable = true,
    zoom = 15,
    height = 400,
    disableDefaultUI = false,
  } = props;

  // Calcular centro válido
  const initialCenter = useMemo(() => {
    const c =
      center ?? (lat != null && lng != null ? { lat, lng } : undefined);
    if (!c || isNaN(c.lat) || isNaN(c.lng)) return FALLBACK_CENTER;
    return c;
  }, [center, lat, lng]);

  const [markerPosition, setMarkerPosition] = useState(initialCenter);

  // Sincronizar markerPosition con cambios en center/lat/lng externas
  useEffect(() => {
    const nuevo =
      center ?? (lat != null && lng != null ? { lat, lng } : undefined);
    if (nuevo && !isNaN(nuevo.lat) && !isNaN(nuevo.lng)) {
      setMarkerPosition(nuevo);
    }
  }, [center?.lat, center?.lng, lat, lng]);

  // Handler para drag end
  const handleDragEnd = useCallback(
    (e: L.DragEndEvent) => {
      const latlng = (e.target as L.Marker).getLatLng();
      const newPos = { lat: latlng.lat, lng: latlng.lng };
      setMarkerPosition(newPos);
      onLocationChange?.(newPos);
    },
    [onLocationChange]
  );

  // Alertar si center recibido era inválido
  const centerInvalido =
    center && (isNaN(center.lat) || isNaN(center.lng));

  return (
    <div className="space-y-2">
      {centerInvalido && (
        <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
          Coordenadas inválidas recibidas, usando fallback.
        </div>
      )}
      <div
        className="overflow-hidden rounded-xl border border-border"
        style={{ height }}
      >
        <MapContainer
          center={[initialCenter.lat, initialCenter.lng]}
          zoom={zoom}
          scrollWheelZoom
          zoomControl={!disableDefaultUI}
          attributionControl={!disableDefaultUI}
          style={{ height: "100%", width: "100%" }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapSync center={markerPosition} />

          <Marker
            position={[markerPosition.lat, markerPosition.lng]}
            draggable={draggable}
            eventHandlers={
              draggable ? { dragend: handleDragEnd } : undefined
            }
          />
        </MapContainer>
      </div>
    </div>
  );
}
