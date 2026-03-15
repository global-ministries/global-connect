"use client"

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"

// ─── Tipos ──────────────────────────────────────────
interface Campus {
    id: string
    nombre: string
    codigo: string
    tipo: string
    activo: boolean
}

interface CampusLocalidad {
    id: string
    nombre: string
    campus_id: string
    activo: boolean
}

interface CampusContextType {
    /** Campus actualmente seleccionado (null = sin filtro / ver todo) */
    campusActivo: Campus | null
    /** Localidad actualmente seleccionada (null = todas del campus) */
    localidadActiva: CampusLocalidad | null
    /** Lista de campus disponibles para el usuario */
    campusDisponibles: Campus[]
    /** Localidades del campus activo */
    localidadesDisponibles: CampusLocalidad[]
    /** ID del campus activo (atajo para RPCs) */
    campusId: string | null
    /** ID de la localidad activa (atajo para RPCs) */
    localidadId: string | null
    /** ¿Es superadmin (puede ver todos los campus)? */
    esSuperadmin: boolean
    /** Cargando datos */
    loading: boolean
    /** Cambiar el campus seleccionado */
    seleccionarCampus: (campusId: string | null) => void
    /** Cambiar la localidad seleccionada */
    seleccionarLocalidad: (localidadId: string | null) => void
}

const CampusContext = createContext<CampusContextType>({
    campusActivo: null,
    localidadActiva: null,
    campusDisponibles: [],
    localidadesDisponibles: [],
    campusId: null,
    localidadId: null,
    esSuperadmin: false,
    loading: true,
    seleccionarCampus: () => { },
    seleccionarLocalidad: () => { },
})

// ─── Constantes ─────────────────────────────────────
const STORAGE_KEY_CAMPUS = "gc_campus_activo"
const STORAGE_KEY_LOCALIDAD = "gc_localidad_activa"
const ROLES_SUPERADMIN = ["admin", "pastor"]

// ─── Provider ───────────────────────────────────────
export function CampusProvider({ children }: { children: React.ReactNode }) {
    const [campusDisponibles, setCampusDisponibles] = useState<Campus[]>([])
    const [localidadesDisponibles, setLocalidadesDisponibles] = useState<CampusLocalidad[]>([])
    const [campusActivoId, setCampusActivoId] = useState<string | null>(null)
    const [localidadActivaId, setLocalidadActivaId] = useState<string | null>(null)
    const [esSuperadmin, setEsSuperadmin] = useState(false)
    const [loading, setLoading] = useState(true)

    // Cargar datos iniciales
    useEffect(() => {
        const cargar = async () => {
            try {
                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) { setLoading(false); return }

                // Obtener roles
                const { data: roles } = await supabase.rpc("obtener_roles_usuario", { p_auth_id: user.id })
                const userRoles = Array.isArray(roles)
                    ? roles.map((r: unknown) => typeof r === "string" ? r : (r as { nombre_interno?: string })?.nombre_interno).filter(Boolean) as string[]
                    : []
                const isSuperadmin = userRoles.some(r => ROLES_SUPERADMIN.includes(r))
                setEsSuperadmin(isSuperadmin)

                // Obtener campus disponibles
                let campusList: Campus[]
                if (isSuperadmin) {
                    // Superadmin ve todos los campus activos
                    const { data } = await supabase
                        .from("campus")
                        .select("id, nombre, codigo, tipo, activo")
                        .eq("activo", true)
                        .order("nombre")
                    campusList = (data ?? []) as Campus[]
                } else {
                    // Otros usuarios solo ven sus campus asignados
                    const { data } = await supabase
                        .from("usuario_campus")
                        .select("campus:campus_id(id, nombre, codigo, tipo, activo)")
                        .eq("usuario_id", user.id)
                    campusList = (data ?? [])
                        .map((d: unknown) => (d as { campus: Campus }).campus)
                        .filter((c: Campus) => c.activo)
                }
                setCampusDisponibles(campusList)

                // Restaurar selección desde localStorage
                const savedCampus = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_CAMPUS) : null
                const savedLocalidad = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_LOCALIDAD) : null

                if (savedCampus && campusList.some(c => c.id === savedCampus)) {
                    setCampusActivoId(savedCampus)
                } else if (campusList.length === 1) {
                    // Si solo tiene un campus, seleccionarlo automáticamente
                    setCampusActivoId(campusList[0].id)
                }

                if (savedLocalidad) {
                    setLocalidadActivaId(savedLocalidad)
                }
            } catch (err) {
                console.error("Error cargando campus:", err)
            } finally {
                setLoading(false)
            }
        }
        cargar()
    }, [])

    // Cuando cambia el campus activo, cargar localidades
    useEffect(() => {
        if (!campusActivoId) {
            setLocalidadesDisponibles([])
            setLocalidadActivaId(null)
            return
        }

        const cargarLocalidades = async () => {
            const supabase = createClient()
            const { data } = await supabase
                .from("campus_localidades")
                .select("id, nombre, campus_id, activo")
                .eq("campus_id", campusActivoId)
                .eq("activo", true)
                .order("nombre")
            setLocalidadesDisponibles((data ?? []) as CampusLocalidad[])
        }
        cargarLocalidades()
    }, [campusActivoId])

    // Persistir selección
    const seleccionarCampus = useCallback((id: string | null) => {
        setCampusActivoId(id)
        setLocalidadActivaId(null)
        if (typeof window !== "undefined") {
            if (id) localStorage.setItem(STORAGE_KEY_CAMPUS, id)
            else localStorage.removeItem(STORAGE_KEY_CAMPUS)
            localStorage.removeItem(STORAGE_KEY_LOCALIDAD)
        }
    }, [])

    const seleccionarLocalidad = useCallback((id: string | null) => {
        setLocalidadActivaId(id)
        if (typeof window !== "undefined") {
            if (id) localStorage.setItem(STORAGE_KEY_LOCALIDAD, id)
            else localStorage.removeItem(STORAGE_KEY_LOCALIDAD)
        }
    }, [])

    // Derivados
    const campusActivo = useMemo(
        () => campusDisponibles.find(c => c.id === campusActivoId) ?? null,
        [campusDisponibles, campusActivoId]
    )
    const localidadActiva = useMemo(
        () => localidadesDisponibles.find(l => l.id === localidadActivaId) ?? null,
        [localidadesDisponibles, localidadActivaId]
    )

    const value = useMemo<CampusContextType>(() => ({
        campusActivo,
        localidadActiva,
        campusDisponibles,
        localidadesDisponibles,
        campusId: campusActivoId,
        localidadId: localidadActivaId,
        esSuperadmin,
        loading,
        seleccionarCampus,
        seleccionarLocalidad,
    }), [
        campusActivo, localidadActiva, campusDisponibles,
        localidadesDisponibles, campusActivoId, localidadActivaId,
        esSuperadmin, loading, seleccionarCampus, seleccionarLocalidad,
    ])

    return (
        <CampusContext.Provider value={value}>
            {children}
        </CampusContext.Provider>
    )
}

// ─── Hook ───────────────────────────────────────────
export function useCampus(): CampusContextType {
    const ctx = useContext(CampusContext)
    if (ctx === undefined) {
        throw new Error("useCampus debe usarse dentro de un CampusProvider")
    }
    return ctx
}
