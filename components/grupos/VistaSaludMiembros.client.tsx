"use client"

import { BadgeSistema, TarjetaSistema } from "@/components/ui/sistema-diseno"
import type { SaludMiembro } from "@/lib/types/asistencia-avanzada.types"
import { AlertTriangle, Heart, ShieldAlert, TrendingDown, User } from "lucide-react"

interface Props {
    miembros: SaludMiembro[]
    grupoId: string
}

const NIVEL_CONFIG = {
    normal: {
        icono: Heart,
        color: "text-emerald-500",
        bgColor: "bg-emerald-500/10",
        badge: "success" as const,
        label: "Normal",
    },
    atencion: {
        icono: AlertTriangle,
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
        badge: "warning" as const,
        label: "Atención",
    },
    riesgo: {
        icono: TrendingDown,
        color: "text-orange-500",
        bgColor: "bg-orange-500/10",
        badge: "error" as const,
        label: "Riesgo",
    },
    critico: {
        icono: ShieldAlert,
        color: "text-red-600",
        bgColor: "bg-red-600/10",
        badge: "error" as const,
        label: "Crítico",
    },
}

export default function VistaSaludMiembros({ miembros, grupoId }: Props) {
    // Ordenar: críticos primero, luego riesgo, atención, normal
    const orden: Record<string, number> = { critico: 0, riesgo: 1, atencion: 2, normal: 3 }
    const ordenados = [...miembros].sort(
        (a, b) => (orden[a.nivel_riesgo] ?? 3) - (orden[b.nivel_riesgo] ?? 3)
    )

    const stats = {
        critico: miembros.filter(m => m.nivel_riesgo === "critico").length,
        riesgo: miembros.filter(m => m.nivel_riesgo === "riesgo").length,
        atencion: miembros.filter(m => m.nivel_riesgo === "atencion").length,
        normal: miembros.filter(m => m.nivel_riesgo === "normal").length,
    }

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(Object.entries(NIVEL_CONFIG) as Array<[keyof typeof NIVEL_CONFIG, typeof NIVEL_CONFIG[keyof typeof NIVEL_CONFIG]]>).map(
                    ([nivel, config]) => {
                        const Icono = config.icono
                        return (
                            <TarjetaSistema key={nivel} variante="default" className="p-3">
                                <div className="flex items-center gap-2">
                                    <div className={`p-2 rounded-lg ${config.bgColor}`}>
                                        <Icono className={`h-4 w-4 ${config.color}`} />
                                    </div>
                                    <div>
                                        <p className="text-lg font-bold text-foreground">{stats[nivel]}</p>
                                        <p className="text-xs text-muted-foreground">{config.label}</p>
                                    </div>
                                </div>
                            </TarjetaSistema>
                        )
                    }
                )}
            </div>

            {/* Lista de miembros */}
            <div className="border border-border rounded-xl divide-y divide-border overflow-hidden">
                {/* Encabezado */}
                <div className="hidden sm:grid grid-cols-12 gap-2 p-3 bg-muted text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <div className="col-span-4">Miembro</div>
                    <div className="col-span-2 text-center">Asistencia</div>
                    <div className="col-span-2 text-center">Semanas ausente</div>
                    <div className="col-span-2 text-center">% Asistencia</div>
                    <div className="col-span-2 text-center">Estado</div>
                </div>

                {ordenados.map(m => {
                    const config = NIVEL_CONFIG[m.nivel_riesgo]
                    const Icono = config.icono

                    return (
                        <div
                            key={m.usuario_id}
                            className="p-3 hover:bg-muted/50 transition-colors duration-200"
                        >
                            {/* Desktop */}
                            <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-4 flex items-center gap-2">
                                    <div className={`p-1.5 rounded-lg ${config.bgColor}`}>
                                        <Icono className={`h-3.5 w-3.5 ${config.color}`} />
                                    </div>
                                    <div>
                                        <p className="font-medium text-foreground text-sm">{m.nombre_completo}</p>
                                        <p className="text-xs text-muted-foreground">{m.rol || "Miembro"}</p>
                                    </div>
                                </div>
                                <div className="col-span-2 text-center text-sm">
                                    {m.total_presencias}/{m.total_eventos}
                                </div>
                                <div className="col-span-2 text-center">
                                    <span className={`text-sm font-medium ${m.semanas_ausente >= 4 ? "text-destructive" : "text-foreground"}`}>
                                        {m.semanas_ausente === 99 ? "—" : m.semanas_ausente}
                                    </span>
                                </div>
                                <div className="col-span-2 text-center">
                                    <span className={`text-sm font-medium ${m.pct_asistencia >= 80 ? "text-emerald-500" :
                                            m.pct_asistencia >= 50 ? "text-amber-500" : "text-destructive"
                                        }`}>
                                        {m.pct_asistencia}%
                                    </span>
                                </div>
                                <div className="col-span-2 text-center">
                                    <BadgeSistema variante={config.badge} tamaño="sm">
                                        {config.label}
                                    </BadgeSistema>
                                </div>
                            </div>

                            {/* Mobile */}
                            <div className="sm:hidden">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={`p-1.5 rounded-lg ${config.bgColor}`}>
                                            <Icono className={`h-3.5 w-3.5 ${config.color}`} />
                                        </div>
                                        <div>
                                            <p className="font-medium text-foreground text-sm">{m.nombre_completo}</p>
                                            <p className="text-xs text-muted-foreground">{m.rol || "Miembro"}</p>
                                        </div>
                                    </div>
                                    <BadgeSistema variante={config.badge} tamaño="sm">
                                        {config.label}
                                    </BadgeSistema>
                                </div>
                                <div className="flex items-center gap-4 mt-2 ml-9 text-xs text-muted-foreground">
                                    <span>{m.total_presencias}/{m.total_eventos} asistencias</span>
                                    <span>{m.pct_asistencia}%</span>
                                    {m.semanas_ausente < 99 && (
                                        <span className={m.semanas_ausente >= 4 ? "text-destructive" : ""}>
                                            {m.semanas_ausente} sem. ausente
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}

                {miembros.length === 0 && (
                    <div className="p-6 text-center text-muted-foreground">
                        <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No hay datos de salud disponibles</p>
                        <p className="text-xs mt-1">Se requiere al menos un evento registrado</p>
                    </div>
                )}
            </div>
        </div>
    )
}
