import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { LocationPickerProps } from "./LocationPicker";

const LocationPicker = dynamic(() => import("@/components/maps/LocationPicker"), { ssr: false }) as ComponentType<LocationPickerProps>;
export default LocationPicker;
