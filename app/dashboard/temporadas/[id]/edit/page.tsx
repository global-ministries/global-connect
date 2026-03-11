import { Calendar } from "lucide-react"
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
              <Calendar className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Temporada no encontrada</h3>
              <p className="text-muted-foreground mb-6">
                No se pudo cargar la información de la temporada con ID: {id}
              </p>
              <Link href="/dashboard/temporadas">
                <BotonSistema variante="primario">
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
        botonRegreso={{ href: '/dashboard/temporadas', texto: 'Volver a Temporadas' }}
      >
        <TarjetaSistema>
          <SeasonForm initialData={temporada} />
        </TarjetaSistema>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
