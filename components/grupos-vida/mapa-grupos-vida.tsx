"use client";

import dynamic from "next/dynamic";
import { SkeletonSistema } from "@/components/ui/sistema-diseno";
import type { GrupoMapa } from "./mapa-host-home-model";

const MapaInteractivoInner = dynamic(
    () =>
        import("./mapa-interactivo-inner").then((mod) => mod.MapaInteractivoInner),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center rounded-2xl border border-border bg-muted/30" style={{ height: "500px" }}>
                <div className="space-y-3 text-center">
                    <SkeletonSistema ancho="200px" alto="20px" />
                    <SkeletonSistema ancho="150px" alto="14px" />
                </div>
            </div>
        ),
    }
);

interface MapaGruposVidaProps {
    grupos: GrupoMapa[];
    centro?: [number, number];
    zoom?: number;
    altura?: string;
    onGrupoClick?: (grupoId: string) => void;
}

/**
 * Wrapper dinámico del mapa Leaflet.
 * Usa `next/dynamic` con `ssr: false` para evitar errores de `window` en SSR.
 * Renderiza un skeleton mientras se carga el módulo Leaflet.
 */
export function MapaGruposVida({
    grupos,
    centro,
    zoom,
    altura,
    onGrupoClick,
}: MapaGruposVidaProps) {
    return (
        <MapaInteractivoInner
            grupos={grupos}
            centro={centro}
            zoom={zoom}
            altura={altura}
            onGrupoClick={onGrupoClick}
        />
    );
}

export type { GrupoMapa };
