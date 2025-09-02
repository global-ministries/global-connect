"use client"

import { useMemo, useState, useEffect } from "react";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";

interface LocationPickerProps {
  lat: number;
  lng: number;
  onLocationChange: (coords: { lat: number; lng: number }) => void;
}

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;

  // Estado interno para la posición del marcador
export default function LocationPicker(props: LocationPickerProps) {
  const { lat, lng, onLocationChange } = props;
  const [markerPosition, setMarkerPosition] = useState({ lat, lng });

  // Sincronizar markerPosition con cambios en las props lat/lng
  useEffect(() => {
    setMarkerPosition({ lat, lng });
  }, [lat, lng]);

  if (!apiKey) {
    return <div className="text-red-500">No se encontró la clave de Google Maps</div>;
  }

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        center={markerPosition}
        zoom={15}
        mapId={mapId}
        style={{ width: "100%", height: 400, borderRadius: 12 }}
        gestureHandling="greedy"
        disableDefaultUI={false}
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
