import { redirect } from "next/navigation"
import { Layers } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard } from "@/components/ui/sistema-diseno"
import GestionSegmentos from "@/components/grupos/FormularioSegmento.client"

export default async function Page() {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData) {
    redirect("/login")
  }
  const rolesLiderazgo = ["admin", "pastor", "director-general", "director-etapa", "lider"]
  const tieneAcceso = userData.roles.some((r) => rolesLiderazgo.includes(r))
  if (!tieneAcceso) {
    redirect("/dashboard")
  }

  const { data: segmentos } = await supabase
    .from("segmentos")
    .select("id, nombre, descripcion")
    .order("nombre", { ascending: true })

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Segmentos"
        botonRegreso={{ href: "/grupos-vida", texto: "Volver" }}
      >
        <div className="space-y-4">
          <GestionSegmentos segmentos={segmentos ?? []} />
        </div>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
