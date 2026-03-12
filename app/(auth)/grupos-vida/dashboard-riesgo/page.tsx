import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard, TarjetaSistema, TituloSistema, BadgeSistema, BotonSistema } from "@/components/ui/sistema-diseno"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { redirect } from "next/navigation"
import { obtenerDashboardRiesgo } from "@/lib/actions/asistencia-avanzada.actions"
import type { DashboardRiesgo } from "@/lib/types/asistencia-avanzada.types"
import Link from "next/link"
import {
    AlertTriangle, ShieldAlert, TrendingDown, Users,
    Calendar, FileText, UserPlus,
} from "lucide-react"

/** Roles permitidos para acceder al dashboard de riesgo */
const ROLES_PERMITIDOS = ["admin", "pastor", "director_etapa", "director_general"]

export default async function DashboardRiesgoPage() {
    const supabase = await createSupabaseServerClient()
    const userData = await getUserWithRoles(supabase)
    if (!userData) redirect("/login")

    const tieneAcceso = userData.roles.some((r) => ROLES_PERMITIDOS.includes(r))
    if (!tieneAcceso) redirect("/grupos-vida")

    const result = await obtenerDashboardRiesgo()

    if (!result.success || !result.data) {
        return (
            <DashboardLayout>
                <ContenedorDashboard
                    titulo="Dashboard de Riesgo"
                    descripcion="Vista panorámica de salud de todos los grupos."
                    botonRegreso={{ href: "/grupos-vida", texto: "Volver" }}
                >
                    <TarjetaSistema variante="outlined" className="p-6 text-center">
                        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-muted-foreground">
                            {result.error || "No se pudo cargar el dashboard. Verifica tus permisos."}
                        </p>
                    </TarjetaSistema>
                </ContenedorDashboard>
            </DashboardLayout>
        )
    }

    const d = result.data

    return (
        <DashboardLayout>
            <ContenedorDashboard
                titulo="Dashboard de Riesgo"
                descripcion="Vista panorámica de la salud de los grupos de vida."
                botonRegreso={{ href: "/grupos-vida", texto: "Volver" }}
            >
                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    <TarjetaSistema variante="default" className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-600/10">
                                <ShieldAlert className="h-5 w-5 text-red-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-foreground">{d.miembros_criticos}</p>
                                <p className="text-xs text-muted-foreground">Críticos</p>
                            </div>
                        </div>
                    </TarjetaSistema>

                    <TarjetaSistema variante="default" className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-orange-500/10">
                                <TrendingDown className="h-5 w-5 text-orange-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-foreground">{d.miembros_en_riesgo}</p>
                                <p className="text-xs text-muted-foreground">En riesgo</p>
                            </div>
                        </div>
                    </TarjetaSistema>

                    <TarjetaSistema variante="default" className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-amber-500/10">
                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-foreground">{d.miembros_en_atencion}</p>
                                <p className="text-xs text-muted-foreground">Atención</p>
                            </div>
                        </div>
                    </TarjetaSistema>

                    <TarjetaSistema variante="default" className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-500/10">
                                <Users className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-foreground">{d.total_grupos}</p>
                                <p className="text-xs text-muted-foreground">Grupos activos</p>
                            </div>
                        </div>
                    </TarjetaSistema>
                </div>

                {/* Segunda fila: info complementaria */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-4">
                    <TarjetaSistema variante="default" className="p-4 flex items-center gap-3">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                        <div>
                            <p className="text-lg font-bold text-foreground">{d.grupos_sin_reunion_esta_semana}</p>
                            <p className="text-xs text-muted-foreground">Sin reunión esta semana</p>
                        </div>
                    </TarjetaSistema>

                    <TarjetaSistema variante="default" className="p-4 flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                            <p className="text-lg font-bold text-foreground">{d.solicitudes_pendientes}</p>
                            <p className="text-xs text-muted-foreground">Solicitudes pendientes</p>
                        </div>
                    </TarjetaSistema>

                    <TarjetaSistema variante="default" className="p-4 flex items-center gap-3">
                        <UserPlus className="h-5 w-5 text-muted-foreground" />
                        <div>
                            <p className="text-lg font-bold text-foreground">{d.visitantes_del_mes}</p>
                            <p className="text-xs text-muted-foreground">Visitantes del mes</p>
                        </div>
                    </TarjetaSistema>
                </div>

                {/* Top 5 grupos con riesgo */}
                {d.top_5_grupos_riesgo.length > 0 && (
                    <div className="mt-6">
                        <TituloSistema nivel={3}>Grupos con mayor riesgo</TituloSistema>
                        <div className="mt-3 border border-border rounded-xl divide-y divide-border overflow-hidden">
                            {d.top_5_grupos_riesgo.map((g: DashboardRiesgo["top_5_grupos_riesgo"][number], i: number) => (
                                <Link
                                    key={g.grupo_id}
                                    href={`/grupos-vida/${g.grupo_id}/salud`}
                                    className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors duration-200"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm text-muted-foreground w-6 text-center">{i + 1}</span>
                                        <div>
                                            <p className="font-medium text-foreground text-sm">{g.grupo_nombre}</p>
                                            <p className="text-xs text-muted-foreground">{g.total_miembros} miembros</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {g.criticos > 0 && (
                                            <BadgeSistema variante="error" tamaño="sm">
                                                {g.criticos} críticos
                                            </BadgeSistema>
                                        )}
                                        <BadgeSistema variante="warning" tamaño="sm">
                                            {g.riesgo_total} en riesgo
                                        </BadgeSistema>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tendencia de asistencia 4 semanas */}
                {d.tendencia_asistencia_4_semanas.length > 0 && (
                    <div className="mt-6">
                        <TituloSistema nivel={3}>Tendencia de asistencia (últimas 4 semanas)</TituloSistema>
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {d.tendencia_asistencia_4_semanas.map((t: DashboardRiesgo["tendencia_asistencia_4_semanas"][number], i: number) => (
                                <TarjetaSistema key={i} variante="default" className="p-3 text-center">
                                    <p className="text-xs text-muted-foreground">{t.semana}</p>
                                    <p className={`text-xl font-bold mt-1 ${t.pct >= 80 ? "text-emerald-500" :
                                        t.pct >= 60 ? "text-amber-500" : "text-destructive"
                                        }`}>
                                        {t.pct}%
                                    </p>
                                </TarjetaSistema>
                            ))}
                        </div>
                    </div>
                )}
            </ContenedorDashboard>
        </DashboardLayout>
    )
}
