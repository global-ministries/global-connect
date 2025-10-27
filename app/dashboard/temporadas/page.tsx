import { Plus } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import TemporadasListClient from "@/components/temporadas/TemporadasList.client"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard, BotonSistema } from "@/components/ui/sistema-diseno"

export default async function Page() {
  // Seguridad: verificar roles de liderazgo
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData) {
    redirect("/login")
  }
  const rolesLiderazgo = ["admin", "pastor", "director-general", "director-etapa", "lider"]
  const tieneAcceso = userData.roles.some(r => rolesLiderazgo.includes(r))
  if (!tieneAcceso) {
    redirect("/dashboard")
  }

  // Obtener temporadas
  const { data: temporadas, error } = await supabase
    .from("temporadas")
    .select("*")
    .order("fecha_inicio", { ascending: false })

  if (error) {
    console.error('Error al obtener temporadas:', error)
  }

  const roles = userData.roles || []

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Temporadas"
        descripcion="Administra los períodos temporales de tu organización"
        accionPrincipal={
          <Link href="/dashboard/temporadas/create">
            <BotonSistema variante="primario" tamaño="sm">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Crear Temporada</span>
            </BotonSistema>
          </Link>
        }
      >
        <TemporadasListClient 
          temporadas={temporadas || []} 
          userRoles={roles}
        />
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
