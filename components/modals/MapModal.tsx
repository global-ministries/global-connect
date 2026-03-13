"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { TextoSistema, SeparadorSistema } from "@/components/ui/sistema-diseno";
import { MapPin, Home, Users } from "lucide-react";
import LocationPicker from "@/components/maps/LocationPicker.client";

interface MapModalProps {
  lat: number;
  lng: number;
  isOpen: boolean;
  onClose: () => void;
  calle?: string;
  barrio?: string;
  /** Info de casa anfitriona (opcional) */
  casaAnfitriona?: {
    nombre_lugar?: string;
    anfitrion_nombre?: string;
    co_anfitrion_nombre?: string;
  } | null;
}

export default function MapModal({ lat, lng, isOpen, onClose, calle, barrio, casaAnfitriona }: MapModalProps) {
  const tieneUbicacion = lat !== 0 || lng !== 0;
  const tieneDireccion = calle || barrio;
  const tieneCasa = casaAnfitriona?.nombre_lugar;
  const tieneInfo = tieneDireccion || tieneCasa;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open ? onClose() : undefined}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden max-h-[90dvh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-0 sm:px-6 sm:pt-6">
          <DialogTitle className="text-base sm:text-lg">Ubicación en el mapa</DialogTitle>
        </DialogHeader>

        {/* Info compacta */}
        <div className="px-4 pb-2 sm:px-6 sm:pb-3 space-y-1.5 sm:space-y-2.5">
          {tieneDireccion && (
            <div className="flex items-start gap-2 text-xs sm:text-sm">
              <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 mt-0.5 text-orange-500" />
              <p className="leading-snug">
                <span className="font-medium text-foreground">Dirección:</span>{" "}
                <span className="text-muted-foreground">
                  {[calle, barrio].filter(Boolean).join(", ")}
                </span>
              </p>
            </div>
          )}

          {tieneCasa && (
            <div className="flex items-start gap-2 text-xs sm:text-sm">
              <Home className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 mt-0.5 text-orange-500" />
              <p className="leading-snug">
                <span className="font-medium text-foreground">Casa anfitriona:</span>{" "}
                <span className="text-muted-foreground">{casaAnfitriona.nombre_lugar}</span>
              </p>
            </div>
          )}

          {casaAnfitriona?.anfitrion_nombre && (
            <div className="flex items-start gap-2 text-xs sm:text-sm">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 mt-0.5 text-orange-500" />
              <p className="leading-snug">
                <span className="font-medium text-foreground">Anfitriones:</span>{" "}
                <span className="text-muted-foreground">
                  {casaAnfitriona.anfitrion_nombre}
                  {casaAnfitriona.co_anfitrion_nombre && `, ${casaAnfitriona.co_anfitrion_nombre}`}
                </span>
              </p>
            </div>
          )}

          {!tieneInfo && (
            <TextoSistema variante="muted" tamaño="sm">Sin información de dirección disponible</TextoSistema>
          )}

          {tieneInfo && <SeparadorSistema />}
        </div>

        {/* Mapa — flex-1 para llenar el espacio restante */}
        <div className="flex-1 min-h-[250px] sm:min-h-[400px] max-h-[50dvh] sm:max-h-[500px] w-full px-4 pb-4 sm:px-6 sm:pb-6">
          {tieneUbicacion ? (
            <LocationPicker
              lat={lat}
              lng={lng}
              center={{ lat, lng }}
              onLocationChange={() => { }}
              draggable={false}
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-muted/50 rounded-xl">
              <TextoSistema variante="muted">Sin coordenadas disponibles</TextoSistema>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
