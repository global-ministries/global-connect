'use client'

import { useState } from 'react'
import { TarjetaSistema, TituloSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { Calendar, Sparkles, Wrench, Shield, Package, Users } from 'lucide-react'
import { actualizaciones, etiquetasRol, type RolSistema } from '@/lib/data/actualizaciones'

/* ── Helpers ── */

const iconoTipo = {
    feature: Sparkles,
    mejora: Package,
    correccion: Wrench,
    seguridad: Shield,
} as const

const colorTipo = {
    feature: 'success' as const,
    mejora: 'info' as const,
    correccion: 'warning' as const,
    seguridad: 'error' as const,
}

const labelTipo = {
    feature: 'Nueva función',
    mejora: 'Mejora',
    correccion: 'Corrección',
    seguridad: 'Seguridad',
}

/** Roles disponibles para filtrar. */
const rolesFiltro: RolSistema[] = [
    'admin',
    'pastor',
    'director_general',
    'director_etapa',
    'lider',
    'miembro',
]

interface ActualizacionesClientProps {
    /** true si el usuario tiene rol de lider o superior. */
    puedeVerTodo: boolean
    /** Rol mapeado del usuario para auto-filtrar. */
    rolUsuario: RolSistema
}

/**
 * Componente client de la página de actualizaciones.
 * - Miembros: ven solo detalles filtrados para su rol, sin filtros manuales.
 * - Líderes y superiores: ven todo con opción de filtrar por cualquier rol.
 */
export default function ActualizacionesClient({ puedeVerTodo, rolUsuario }: ActualizacionesClientProps) {
    // Miembros: filtro fijo, sin posibilidad de cambiar
    const filtroInicial = puedeVerTodo ? null : rolUsuario
    const [rolSeleccionado, setRolSeleccionado] = useState<RolSistema | null>(filtroInicial)

    return (
        <>
            {/* ── Filtro por rol (solo visible para líderes+) ── */}
            {puedeVerTodo && (
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <TextoSistema variante="muted" tamaño="sm">
                            Filtrar por rol
                        </TextoSistema>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setRolSeleccionado(null)}
                            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors duration-200 ${rolSeleccionado === null
                                    ? 'bg-[var(--brand-primary)] text-white'
                                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                        >
                            Todos
                        </button>
                        {rolesFiltro.map((rol) => (
                            <button
                                key={rol}
                                onClick={() => setRolSeleccionado(rol === rolSeleccionado ? null : rol)}
                                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors duration-200 ${rolSeleccionado === rol
                                        ? 'bg-[var(--brand-primary)] text-white'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                    }`}
                            >
                                {etiquetasRol[rol]}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Lista de actualizaciones ── */}
            <div className="space-y-6">
                {actualizaciones
                    .filter((act) => {
                        if (!rolSeleccionado) return true
                        return act.impactoRoles?.includes(rolSeleccionado) ||
                            act.detallesPorRol?.[rolSeleccionado]
                    })
                    .map((act) => {
                        const Icono = iconoTipo[act.tipo]
                        const detallesRol = rolSeleccionado && act.detallesPorRol?.[rolSeleccionado]
                        const detallesVisibles = detallesRol || act.detalles

                        return (
                            <TarjetaSistema key={act.version} className="p-5 sm:p-6">
                                {/* Header */}
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <TituloSistema nivel={3}>{act.titulo}</TituloSistema>
                                    <BadgeSistema variante={colorTipo[act.tipo]} tamaño="sm">
                                        <Icono className="w-3 h-3" />
                                        {labelTipo[act.tipo]}
                                    </BadgeSistema>
                                </div>

                                <div className="flex items-center gap-2 mb-3">
                                    <TextoSistema variante="muted" tamaño="sm">
                                        v{act.version}
                                    </TextoSistema>
                                    <span className="text-muted-foreground/40">•</span>
                                    <div className="flex items-center gap-1 text-muted-foreground">
                                        <Calendar className="w-3.5 h-3.5" />
                                        <TextoSistema variante="muted" tamaño="sm">
                                            {new Date(act.fecha + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
                                        </TextoSistema>
                                    </div>
                                </div>

                                <TextoSistema className="mb-3">{act.descripcion}</TextoSistema>

                                {/* Label del rol cuando hay filtro activo */}
                                {rolSeleccionado && detallesRol && (
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <BadgeSistema variante="info" tamaño="sm">
                                            {etiquetasRol[rolSeleccionado]}
                                        </BadgeSistema>
                                    </div>
                                )}

                                <ul className="space-y-1.5">
                                    {detallesVisibles.map((d, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] flex-shrink-0" />
                                            <TextoSistema tamaño="sm">{d}</TextoSistema>
                                        </li>
                                    ))}
                                </ul>
                            </TarjetaSistema>
                        )
                    })}
            </div>
        </>
    )
}
