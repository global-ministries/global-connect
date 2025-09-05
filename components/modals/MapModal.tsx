"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import LocationPicker from "@/components/maps/LocationPicker.client";


interface MapModalProps {
  lat: number;
  lng: number;
  isOpen: boolean;
  onClose: () => void;
  calle?: string;
  barrio?: string;
}

export default function MapModal({ lat, lng, isOpen, onClose, calle, barrio }: MapModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={open => !open ? onClose() : undefined}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-8 pt-8">
          <DialogTitle>Ubicación en el mapa</DialogTitle>
        </DialogHeader>
        <div className="px-8 pb-4 flex flex-col gap-2">
          <div className="flex flex-wrap gap-6 text-base text-gray-700">
            <div><span className="font-semibold">Calle:</span> {calle || '-'}</div>
            <div><span className="font-semibold">Barrio:</span> {barrio || '-'}</div>
          </div>
        </div>
        <div className="h-[500px] w-full px-8 pb-8">
          <LocationPicker
            lat={lat}
            lng={lng}
            center={{ lat, lng }}
            onLocationChange={() => {}}
            draggable={false}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
