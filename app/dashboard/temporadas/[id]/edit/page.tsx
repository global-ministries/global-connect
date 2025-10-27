import { ArrowLeft, Calendar } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import SeasonForm from "@/components/forms/SeasonForm"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard, TarjetaSistema, BotonSistema } from "@/components/ui/sistema-diseno"

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditSeasonPage({ params }: Props) {
  const { id } = await params

  // Obtener temporada
  const supabase = await createSupabaseServerClient()
  const { data: temporada, error } = await supabase
    .from("temporadas")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !temporada) {
    return (
      <DashboardLayout>
        <ContenedorDashboard
          titulo="Error"
          descripcion="No se pudo cargar la temporada"
        >
          <TarjetaSistema className="p-8">
            <div className="text-center">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Temporada no encontrada</h3>
              <p className="text-gray-500 mb-6">
                No se pudo cargar la información de la temporada con ID: {id}
              </p>
              <Link href="/dashboard/temporadas">
                <BotonSistema variante="primario">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Volver a Temporadas
                </BotonSistema>
              </Link>
            </div>
          </TarjetaSistema>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo={temporada.nombre}
        descripcion="Modifica la información de esta temporada"
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
          <SeasonForm initialData={temporada} />
        </TarjetaSistema>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
