import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { redirect } from "next/navigation"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard } from "@/components/ui/sistema-diseno"
import { ConfiguracionGlobalClient } from "./ConfiguracionGlobalClient"

export const metadata = {
  title: "Configuración | GlobalConnect",
  description: "Configuración global del sistema",
}

export default async function PaginaConfiguracion() {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)

  if (!userData?.user) {
    redirect("/login")
  }

  const roles = userData.roles || []
  const esAdmin = roles.includes("admin")
  const esPastor = roles.includes("pastor")

  if (!esAdmin && !esPastor) {
    redirect("/dashboard")
  }

  // Obtener datos de la organización (primer campus como referencia)
  const { data: campus } = await supabase
    .from("campus")
    .select("id, nombre, direccion, telefono, email, created_at")
    .limit(1)
    .single()

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Configuración"
        botonRegreso={{ href: "/dashboard", texto: "Dashboard" }}
      >
        <ConfiguracionGlobalClient
          datosOrganizacion={campus ? {
            nombre: campus.nombre || "",
            direccion: campus.direccion || "",
            telefono: campus.telefono || "",
            email: campus.email || "",
          } : undefined}
        />
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
