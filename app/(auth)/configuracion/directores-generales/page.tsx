import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { checkPlatformRouteAccess } from "@/lib/platform/routeGuard"
import { redirect } from "next/navigation"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard } from "@/components/ui/sistema-diseno"
import { GestionDGClient } from "./GestionDGClient"
import {
  obtenerDirectoresGenerales,
  obtenerSegmentosDisponibles,
} from "@/lib/actions/dg-segmentos.actions"
import { obtenerDEsAsignadosPorDG } from "@/lib/actions/dg-directores.actions"

export const metadata = {
  title: "Directores Generales | Configuración",
  description: "Gestión de segmentos y directores de etapa asignados a Directores Generales",
}

export default async function DirectoresGeneralesPage() {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData?.user) redirect("/login")

  const rolesPermitidos = ["admin", "pastor", "director-general"]
  const tieneAcceso = userData.roles.some((r) => rolesPermitidos.includes(r))
  if (!tieneAcceso) redirect("/dashboard")

  const routeGuard = checkPlatformRouteAccess({
    platformSession: userData.platformSession,
    requiredCapability: "configuracion.directores-generales.manage",
  })
  if (!routeGuard.allowed) redirect("/dashboard")

  const [directores, segmentos, desAsignadosPorDG] = await Promise.all([
    obtenerDirectoresGenerales(),
    obtenerSegmentosDisponibles(),
    obtenerDEsAsignadosPorDG(),
  ])

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Directores Generales"
        botonRegreso={{ href: "/configuracion", texto: "Configuración" }}
      >
        <GestionDGClient
          directoresIniciales={directores}
          segmentosDisponibles={segmentos}
          desAsignadosPorDG={desAsignadosPorDG}
          usuarioActualId={userData.user.id}
          rolesUsuario={userData.roles}
        />
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
