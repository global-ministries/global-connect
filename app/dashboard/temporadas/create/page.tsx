import { ArrowLeft, Calendar } from "lucide-react"
import Link from "next/link"
import SeasonForm from "@/components/forms/SeasonForm"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard, TarjetaSistema, BotonSistema } from "@/components/ui/sistema-diseno"

export default function CreateSeasonPage() {
  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Crear Temporada"
        descripcion="Ingresa los datos para crear una nueva temporada"
        accionPrincipal={
          <Link href="/dashboard/temporadas">
            <BotonSistema variante="outline" tamaño="sm">
              <ArrowLeft className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Volver</span>
            </BotonSistema>
          </Link>
        }
      >
        <TarjetaSistema>
          <SeasonForm />
        </TarjetaSistema>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
