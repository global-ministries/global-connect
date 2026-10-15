'use client'

import { useState } from 'react'
import { TarjetaSistema, TituloSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { Calendar, Sparkles, Wrench, Shield, Package, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
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

/** Filter chip: 36px, 44px on touch screens (docs/design-system.md, sm). */
function claseChip(activo: boolean) {
    return cn(
        'inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium transition-colors duration-200 pointer-coarse:h-11',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        activo
            ? 'bg-[var(--brand-primary)] text-white'
            : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
    )
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
                <div className="mb-6" role="group" aria-labelledby="filtro-rol-titulo">
                    <div className="mb-3 flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <TextoSistema id="filtro-rol-titulo" variante="muted" tamaño="sm">
                            Filtrar por rol
                        </TextoSistema>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            aria-pressed={rolSeleccionado === null}
                            onClick={() => setRolSeleccionado(null)}
                            className={claseChip(rolSeleccionado === null)}
                        >
                            Todos
                        </button>
                        {rolesFiltro.map((rol) => (
                            <button
                                type="button"
                                key={rol}
                                aria-pressed={rolSeleccionado === rol}
                                onClick={() => setRolSeleccionado(rol === rolSeleccionado ? null : rol)}
                                className={claseChip(rolSeleccionado === rol)}
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
                                <div className="mb-1 flex flex-wrap items-center gap-2">
                                    <TituloSistema nivel={2} className="text-base sm:text-lg">{act.titulo}</TituloSistema>
                                    <BadgeSistema variante={colorTipo[act.tipo]} tamaño="sm" className="gap-1">
                                        <Icono className="h-3 w-3" aria-hidden="true" />
                                        {labelTipo[act.tipo]}
                                    </BadgeSistema>
                                </div>

                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                    <TextoSistema variante="muted" tamaño="sm">
                                        v{act.version}
                                    </TextoSistema>
                                    <span className="text-muted-foreground/40" aria-hidden="true">•</span>
                                    <div className="flex items-center gap-1 text-muted-foreground">
                                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                                        <TextoSistema variante="muted" tamaño="sm">
                                            {new Date(act.fecha + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
                                        </TextoSistema>
                                    </div>
                                </div>

                                <TextoSistema className="mb-3">{act.descripcion}</TextoSistema>

                                {/* Label del rol cuando hay filtro activo */}
                                {rolSeleccionado && detallesRol && (
                                    <div className="mb-2 flex items-center gap-1.5">
                                        <BadgeSistema variante="info" tamaño="sm">
                                            {etiquetasRol[rolSeleccionado]}
                                        </BadgeSistema>
                                    </div>
                                )}

                                <ul className="space-y-1.5">
                                    {detallesVisibles.map((d, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-primary)]" aria-hidden="true" />
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
