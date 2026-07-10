
import { ContenedorDashboard, TarjetaSistema } from "@/components/ui/sistema-diseno"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { redirect } from "next/navigation"
import { obtenerDashboardRiesgo } from "@/lib/actions/asistencia-avanzada.actions"
import DashboardRiesgoClient from "@/components/reportes/DashboardRiesgo.client"
import { AlertTriangle } from "lucide-react"

/** Roles permitidos para acceder al dashboard de riesgo */
const ROLES_PERMITIDOS = ["admin", "pastor", "director-etapa", "director-general"]

export default async function DashboardRiesgoPage() {
    const supabase = await createSupabaseServerClient()
    const userData = await getUserWithRoles(supabase)
    if (!userData) redirect("/login")

    const tieneAcceso = userData.roles.some((r) => ROLES_PERMITIDOS.includes(r))
    if (!tieneAcceso) redirect("/grupos-vida")

    const result = await obtenerDashboardRiesgo()

    if (!result.success || !result.data) {
        return (
<ContenedorDashboard
                    titulo="Salud de los Grupos"
                    descripcion="Vista panorámica de la salud de todos los grupos de vida."
                    botonRegreso={{ href: "/grupos-vida", texto: "Volver" }}
                >
                    <TarjetaSistema variante="outlined" className="p-6 text-center">
                        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-muted-foreground">
                            {result.error || "No se pudo cargar el dashboard. Verifica tus permisos."}
                        </p>
                    </TarjetaSistema>
                </ContenedorDashboard>
)
    }

    return (
<ContenedorDashboard
                titulo="Salud de los Grupos"
                descripcion="Monitoreo de asistencia, riesgo y tendencias de todos los grupos de vida."
                botonRegreso={{ href: "/grupos-vida", texto: "Volver" }}
            >
                <DashboardRiesgoClient data={result.data} />
            </ContenedorDashboard>
)
}
