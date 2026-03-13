"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { BadgeSistema, TextoSistema, SeparadorSistema } from "@/components/ui/sistema-diseno";
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

  return (
    <Dialog open={isOpen} onOpenChange={open => !open ? onClose() : undefined}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 sm:px-8 sm:pt-8">
          <DialogTitle>Ubicación en el mapa</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-3 sm:px-8 space-y-3">
          {/* Dirección */}
          {tieneDireccion && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5 text-orange-500" />
              <div>
                <span className="font-medium text-foreground">Dirección:</span>{" "}
                <span className="text-muted-foreground">
                  {[calle, barrio].filter(Boolean).join(", ")}
                </span>
              </div>
            </div>
          )}

          {/* Casa anfitriona */}
          {tieneCasa && (
            <div className="flex items-start gap-2 text-sm">
              <Home className="h-4 w-4 flex-shrink-0 mt-0.5 text-orange-500" />
              <div>
                <span className="font-medium text-foreground">Casa anfitriona:</span>{" "}
                <span className="text-muted-foreground">{casaAnfitriona.nombre_lugar}</span>
              </div>
            </div>
          )}

          {/* Anfitriones */}
          {casaAnfitriona?.anfitrion_nombre && (
            <div className="flex items-start gap-2 text-sm">
              <Users className="h-4 w-4 flex-shrink-0 mt-0.5 text-orange-500" />
              <div>
                <span className="font-medium text-foreground">Anfitriones:</span>{" "}
                <span className="text-muted-foreground">
                  {casaAnfitriona.anfitrion_nombre}
                  {casaAnfitriona.co_anfitrion_nombre && `, ${casaAnfitriona.co_anfitrion_nombre}`}
                </span>
              </div>
            </div>
          )}

          {!tieneDireccion && !tieneCasa && (
            <TextoSistema variante="muted" tamaño="sm">Sin información de dirección disponible</TextoSistema>
          )}

          {(tieneDireccion || tieneCasa) && <SeparadorSistema />}
        </div>

        <div className="h-[400px] sm:h-[500px] w-full px-6 pb-6 sm:px-8 sm:pb-8">
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
