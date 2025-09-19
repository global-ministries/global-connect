import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { LocationPickerProps } from "./LocationPicker";

const LocationPicker = dynamic(() => import("@/components/maps/LocationPicker"), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-64">Cargando mapa...</div>
}) as ComponentType<LocationPickerProps>;
export default LocationPicker;
