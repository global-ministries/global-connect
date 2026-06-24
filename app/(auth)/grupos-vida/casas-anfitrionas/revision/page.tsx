import { redirect } from "next/navigation"
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard, TarjetaSistema, TextoSistema, TituloSistema } from "@/components/ui/sistema-diseno"
import { obtenerCasasRevisionPendiente } from "@/lib/actions/casas-anfitrionas.actions"
import { RevisionCasaClient, type PendingReviewOption } from "./revision-casa-client"

export const dynamic = "force-dynamic"

const REVIEW_LOAD_ERROR_MESSAGE = "No pudimos cargar las Casas pendientes de revisión"

type PendingReviewRow = {
  review_id: string
  casa_id: string
  casa_nombre: string
  review_type: "create" | "location_change"
  created_at: string
  requested_by: string | null
}

export default async function RevisionCasaAnfitrionaPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const reviewResult = await Promise.allSettled([obtenerCasasRevisionPendiente()])
  const pendingResult = reviewResult[0]
  const reviewsLoaded = pendingResult.status === "fulfilled" && pendingResult.value.success
  const reviews = reviewsLoaded ? (pendingResult.value.data ?? []).map(toReviewOption) : []

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Revisión de Casas Anfitrionas"
        botonRegreso={{ href: "/dashboard", texto: "Dashboard" }}
      >
        <TarjetaSistema variante="outlined" className="p-4 sm:p-5">
          <TextoSistema variante="sutil">
            Aprueba o rechaza Casas Anfitrionas pendientes dentro de tu alcance. Las ubicaciones pendientes no aparecen en el mapa hasta ser aprobadas.
          </TextoSistema>
        </TarjetaSistema>
        {reviewsLoaded ? <RevisionCasaClient reviews={reviews} /> : <RevisionLoadError />}
      </ContenedorDashboard>
    </DashboardLayout>
  )
}

function RevisionLoadError() {
  return (
    <TarjetaSistema className="p-4 sm:p-6">
      <div role="alert" className="space-y-4">
        <div className="space-y-2">
          <TituloSistema nivel={3}>No pudimos cargar la cola de revisión</TituloSistema>
          <TextoSistema variante="sutil" tamaño="sm">
            La revisión no se puede iniciar con datos incompletos. Reintenta la carga o vuelve al dashboard.
          </TextoSistema>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{REVIEW_LOAD_ERROR_MESSAGE}</li>
        </ul>
        <div className="flex flex-wrap gap-3">
          <Link href="/grupos-vida/casas-anfitrionas/revision">Reintentar carga</Link>
          <Link href="/dashboard">Volver al dashboard</Link>
        </div>
      </div>
    </TarjetaSistema>
  )
}

function toReviewOption(review: PendingReviewRow): PendingReviewOption {
  return {
    id: review.review_id,
    casaId: review.casa_id,
    name: review.casa_nombre,
    type: review.review_type,
    createdAt: review.created_at,
    requestedBy: review.requested_by ?? "Solicitante no registrado",
  }
}
