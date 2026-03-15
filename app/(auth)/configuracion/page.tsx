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

  // Obtener configuración de la plataforma (org data + branding)
  const { data: config } = await supabase
    .from("configuracion_plataforma")
    .select("*")
    .limit(1)
    .single()

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Configuración"
        botonRegreso={{ href: "/dashboard", texto: "Dashboard" }}
      >
        <ConfiguracionGlobalClient
          datosOrganizacion={config ? {
            nombre: config.nombre_organizacion || "",
            direccion: config.direccion || "",
            telefono: config.telefono || "",
            email: config.email_contacto || "",
          } : undefined}
          datosBranding={config ? {
            logoLightUrl: config.logo_light_url,
            logoDarkUrl: config.logo_dark_url,
            faviconUrl: config.favicon_url,
            colorPrimario: config.color_primario || "#E96C20",
            colorSecundario: config.color_secundario || "#F59E0B",
          } : undefined}
        />
      </ContenedorDashboard>
    </DashboardLayout>
  )
}

