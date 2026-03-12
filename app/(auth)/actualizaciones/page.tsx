'use client'

import { TarjetaSistema, TituloSistema, TextoSistema, BadgeSistema, ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { Calendar, Sparkles, Wrench, Shield, Package } from 'lucide-react'
import { actualizaciones } from '@/lib/data/actualizaciones'

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

/* ── Page ── */

/**
 * Página de actualizaciones del sistema.
 * Muestra el historial de cambios y mejoras para usuarios internos.
 * Server Component — no requiere interactividad del lado del cliente.
 */
export default function ActualizacionesPage() {
    return (
        <ContenedorDashboard titulo="Actualizaciones" descripcion="Historial de cambios y mejoras del sistema">
            <div className="space-y-6">
                {actualizaciones.map((act) => {
                    const Icono = iconoTipo[act.tipo]
                    return (
                        <TarjetaSistema key={act.version} className="p-6">
                            <div className="flex items-start gap-4">
                                {/* Icono */}
                                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                                    <Icono className="w-5 h-5 text-orange-600" />
                                </div>

                                {/* Contenido */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <TituloSistema nivel={3}>{act.titulo}</TituloSistema>
                                        <BadgeSistema variante={colorTipo[act.tipo]} tamaño="sm">
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

                                    <ul className="space-y-1.5">
                                        {act.detalles.map((d, i) => (
                                            <li key={i} className="flex items-start gap-2">
                                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                                                <TextoSistema tamaño="sm">{d}</TextoSistema>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </TarjetaSistema>
                    )
                })}
            </div>
        </ContenedorDashboard>
    )
}
