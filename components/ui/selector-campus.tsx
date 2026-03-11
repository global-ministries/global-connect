"use client"

import React from "react"
import { useCampus } from "@/hooks/useCampus"
import { Building2, MapPin, ChevronDown } from "lucide-react"

/**
 * Selector de campus y localidad para el header.
 * Solo se muestra si hay más de un campus disponible o si el usuario es superadmin.
 * Usa glassmorphism acorde al design system.
 */
export function SelectorCampus() {
    const {
        campusActivo,
        localidadActiva,
        campusDisponibles,
        localidadesDisponibles,
        esSuperadmin,
        loading,
        seleccionarCampus,
        seleccionarLocalidad,
    } = useCampus()

    // No mostrar si cargando o si solo tiene 1 campus y no es superadmin
    if (loading) return null
    if (campusDisponibles.length <= 1 && !esSuperadmin) return null

    return (
        <div className="flex flex-col gap-1.5 w-full">
            {/* Selector de Campus */}
            <div className="relative">
                <select
                    value={campusActivo?.id ?? ""}
                    onChange={(e) => seleccionarCampus(e.target.value || null)}
                    className="
                        appearance-none
                        pl-7 pr-6 py-1.5
                        text-xs font-medium
                        bg-[var(--surface-secondary)]
                        border border-[var(--glass-border)]
                        rounded-xl
                        text-foreground
                        hover:bg-[var(--brand-accent)]
                        focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/40 focus:border-[var(--brand-primary)]/50
                        transition-[background-color,border-color,box-shadow] duration-200 ease-expo
                        cursor-pointer
                        min-w-[110px] w-full
                    "
                    aria-label="Seleccionar campus"
                >
                    {esSuperadmin && <option value="">Todos los campus</option>}
                    {campusDisponibles.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.nombre}
                        </option>
                    ))}
                </select>
                <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>

            {/* Selector de Localidad (solo si hay localidades) */}
            {localidadesDisponibles.length > 1 && (
                <div className="relative">
                    <select
                        value={localidadActiva?.id ?? ""}
                        onChange={(e) => seleccionarLocalidad(e.target.value || null)}
                        className="
                            appearance-none
                            pl-7 pr-6 py-1.5
                            text-xs font-medium
                            bg-[var(--surface-secondary)]
                            border border-[var(--glass-border)]
                            rounded-xl
                            text-foreground
                            hover:bg-[var(--brand-accent)]
                            focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/40 focus:border-[var(--brand-primary)]/50
                            transition-[background-color,border-color,box-shadow] duration-200 ease-expo
                            cursor-pointer
                            min-w-[100px] w-full
                        "
                        aria-label="Seleccionar localidad"
                    >
                        <option value="">Todas las localidades</option>
                        {localidadesDisponibles.map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.nombre}
                            </option>
                        ))}
                    </select>
                    <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                </div>
            )}
        </div>
    )
}
