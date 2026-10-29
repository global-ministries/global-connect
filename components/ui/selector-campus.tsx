"use client"

import React from "react"
import { useCampus } from "@/hooks/useCampus"
import { Building2, MapPin, ChevronDown } from "lucide-react"

/**
 * Whether the campus selector has anything to offer: more than one campus, or
 * a superadmin (who can pick "Todos los campus"). Hidden while loading.
 */
export function useSelectorCampusVisible(): boolean {
    const { campusDisponibles, esSuperadmin, loading } = useCampus()
    return !loading && (campusDisponibles.length > 1 || esSuperadmin)
}

/** The active campus name for labels ("Campus: Barquisimeto"). */
export function useNombreCampusActivo(): string {
    const { campusActivo } = useCampus()
    return campusActivo?.nombre ?? "Todos los campus"
}

const CLASE_SELECT =
    "w-full min-h-11 appearance-none rounded-xl border border-border bg-card pl-9 pr-8 text-sm font-medium text-foreground " +
    "cursor-pointer hover:bg-accent focus-ring transition-colors"

/**
 * Campus and locality selector at the top of the sidebar (and in the rail's
 * campus flyout): 44px native selects on the card surface. Only shown when
 * there is a choice (see useSelectorCampusVisible).
 */
export function SelectorCampus() {
    const {
        campusActivo,
        localidadActiva,
        campusDisponibles,
        localidadesDisponibles,
        esSuperadmin,
        seleccionarCampus,
        seleccionarLocalidad,
    } = useCampus()
    const visible = useSelectorCampusVisible()

    if (!visible) return null

    return (
        <div className="flex flex-col gap-1.5 w-full">
            <div className="relative">
                <select
                    value={campusActivo?.id ?? ""}
                    onChange={(e) => seleccionarCampus(e.target.value || null)}
                    className={CLASE_SELECT}
                    aria-label="Seleccionar campus"
                >
                    {esSuperadmin && <option value="">Todos los campus</option>}
                    {campusDisponibles.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.nombre}
                        </option>
                    ))}
                </select>
                <Building2 aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <ChevronDown aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            </div>

            {localidadesDisponibles.length > 1 && (
                <div className="relative">
                    <select
                        value={localidadActiva?.id ?? ""}
                        onChange={(e) => seleccionarLocalidad(e.target.value || null)}
                        className={CLASE_SELECT}
                        aria-label="Seleccionar localidad"
                    >
                        <option value="">Todas las localidades</option>
                        {localidadesDisponibles.map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.nombre}
                            </option>
                        ))}
                    </select>
                    <MapPin aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <ChevronDown aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                </div>
            )}
        </div>
    )
}
