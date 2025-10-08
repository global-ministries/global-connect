"use client";

import { useMemo, useState, useEffect } from "react";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";

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
  /** Desactivar UI por defecto */
  disableDefaultUI?: boolean;
}

const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;


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

  // Fallback robusto para coordenadas inválidas
  const fallbackCenter = useMemo(() => ({ lat: 4.65, lng: -74.1 }), []); // Bogotá como fallback

  const initialCenter = useMemo(() => {
    const c = center ?? (lat != null && lng != null ? { lat, lng } : undefined);
    if (!c || isNaN(c.lat) || isNaN(c.lng)) return fallbackCenter;
    return c;
  }, [center?.lat, center?.lng, lat, lng, fallbackCenter]);

  const [markerPosition, setMarkerPosition] = useState(initialCenter);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  // Sincronizar markerPosition con cambios en center/lat/lng externas
  useEffect(() => {
    const nuevo = center ?? (lat != null && lng != null ? { lat, lng } : undefined);
    if (nuevo && !isNaN(nuevo.lat) && !isNaN(nuevo.lng)) {
      setMarkerPosition(nuevo);
    }
  }, [center?.lat, center?.lng, lat, lng]);

  // Recentrar el mapa cuando cambia center
  useEffect(() => {
    if (map) {
      map.panTo(markerPosition);
    }
  }, [markerPosition.lat, markerPosition.lng, map]);

  if (!apiKey) {
    return <div className="text-red-500 text-sm">No se encontró la clave de Google Maps (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)</div>;
  }

  // Alertar si el center recibido era inválido
  const centerInvalido = (center && (isNaN(center.lat) || isNaN(center.lng)));

  return (
    <div className="space-y-2">
      {centerInvalido && (
        <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
          Coordenadas inválidas recibidas, usando fallback.
        </div>
      )}
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={initialCenter}
          zoom={zoom}
          mapId={mapId}
          style={{ width: "100%", height, borderRadius: 12 }}
          gestureHandling="greedy"
          disableDefaultUI={disableDefaultUI}
          zoomControl={!disableDefaultUI}
          streetViewControl={false}
          mapTypeControl={!disableDefaultUI}
          fullscreenControl={!disableDefaultUI}
          onCameraChanged={(e) => setMap(e.map)}
        >
          <AdvancedMarker
            position={markerPosition}
            draggable={draggable}
            onDragEnd={draggable ? (e: google.maps.MapMouseEvent) => {
              if (e.latLng) {
                const newPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                setMarkerPosition(newPos);
                onLocationChange?.(newPos);
              }
            } : undefined}
          />
        </Map>
      </APIProvider>
    </div>
  );
}
