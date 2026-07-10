
import { ContenedorDashboard, TarjetaSistema } from "@/components/ui/sistema-diseno"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { redirect } from "next/navigation"
import { AlertTriangle } from "lucide-react"
import MiembrosRiesgoClient from "./MiembrosRiesgo.client"

const ROLES_PERMITIDOS = ["admin", "pastor", "director-etapa", "director-general"]

export default async function MiembrosRiesgoPage() {
    const supabase = await createSupabaseServerClient()
    const userData = await getUserWithRoles(supabase)
    if (!userData) redirect("/login")

    const tieneAcceso = userData.roles.some((r) => ROLES_PERMITIDOS.includes(r))
    if (!tieneAcceso) redirect("/grupos-vida")

    // Consultar miembros en riesgo con nombre de grupo via RPC simple
    const { data, error } = await (supabase.rpc as CallableFunction)(
        "obtener_miembros_en_riesgo",
        { p_auth_id: userData.user.id }
    )

    if (error) {
        return (
<ContenedorDashboard
                    titulo="Miembros en Riesgo"
                    botonRegreso={{ href: "/grupos-vida/dashboard-riesgo", texto: "Volver" }}
                >
                    <TarjetaSistema variante="outlined" className="p-6 text-center">
                        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-muted-foreground">{error.message}</p>
                    </TarjetaSistema>
                </ContenedorDashboard>
)
    }

    return (
<ContenedorDashboard
                titulo="Miembros en Riesgo"
                descripcion="Listado completo de miembros que necesitan seguimiento pastoral."
                botonRegreso={{ href: "/grupos-vida/dashboard-riesgo", texto: "Dashboard" }}
            >
                <MiembrosRiesgoClient miembros={data ?? []} />
            </ContenedorDashboard>
)
}
