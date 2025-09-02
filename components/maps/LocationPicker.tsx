"use client";

import { useMemo, useState, useEffect } from "react";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";

interface LocationPickerProps {
  lat: number;
  lng: number;
  center: { lat: number; lng: number };
  onLocationChange: (coords: { lat: number; lng: number }) => void;
}

const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;

export default function LocationPicker(props: LocationPickerProps) {
  const { lat, lng, center, onLocationChange } = props;
  const [markerPosition, setMarkerPosition] = useState(center);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  // Sincronizar markerPosition con cambios en las props center
  useEffect(() => {
    setMarkerPosition(center);
  }, [center.lat, center.lng]);

  // Recentrar el mapa cuando cambia center (si hay instancia de mapa)
  useEffect(() => {
    if (map) {
      map.panTo(center);
    }
  }, [center.lat, center.lng, map]);

  if (!apiKey) {
    return <div className="text-red-500">No se encontró la clave de Google Maps</div>;
  }

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        defaultCenter={center}
        zoom={15}
        mapId={mapId}
        style={{ width: "100%", height: 400, borderRadius: 12 }}
        gestureHandling="greedy"
        disableDefaultUI={false}
        zoomControl={true}
        streetViewControl={false}
        mapTypeControl={true}
        fullscreenControl={true}
        onCameraChanged={(e) => setMap(e.map)}
      >
        <AdvancedMarker
          position={markerPosition}
          draggable={true}
          onDragEnd={(e: google.maps.MapMouseEvent) => {
            if (e.latLng) {
              const newPos = {
                lat: e.latLng.lat(),
                lng: e.latLng.lng(),
              };
              setMarkerPosition(newPos);
              onLocationChange(newPos);
            }
          }}
        />
      </Map>
    </APIProvider>
  );
}
