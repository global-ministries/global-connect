import { redirect } from "next/navigation"
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard, TarjetaSistema, TextoSistema, TituloSistema } from "@/components/ui/sistema-diseno"
import { extraerRelacion } from "@/lib/supabase/helpers"
import { listarCasasAnfitrionas, obtenerGruposSinCasaAnfitriona } from "@/lib/actions/casas-anfitrionas.actions"
import { AsignarCasaAnfitrionaClient, type AssignmentCasaOption, type AssignmentGroupOption } from "./asignar-casa-client"

export const dynamic = "force-dynamic"

const GROUPS_LOAD_ERROR_MESSAGE = "No pudimos cargar los grupos pendientes"
const CASAS_LOAD_ERROR_MESSAGE = "No pudimos cargar las Casas disponibles"
const ASSIGNMENT_LOADER_FAILURE_LOG = "[casas-anfitrionas.asignar] Assignment loader failed"

const safeAssignmentActionErrors = new Set([
  "Usuario no autenticado",
  "Usuario no encontrado",
  "No tienes permisos para gestionar casas anfitrionas",
  "Respuesta inesperada del servidor",
  "No pudimos completar la solicitud. Intenta nuevamente.",
])

type AssignmentLoaderName = "groups" | "casas"
type AssignmentLoadResult = { success: boolean; error?: string; data?: unknown }

export default async function AsignarCasaAnfitrionaPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [groupsResult, casasResult] = await Promise.allSettled([
    obtenerGruposSinCasaAnfitriona({ scope: "active" }),
    listarCasasAnfitrionas({ soloActivas: true, soloAprobadas: true }),
  ])

  const groupsLoaded = groupsResult.status === "fulfilled" && groupsResult.value.success
  const casasLoaded = casasResult.status === "fulfilled" && casasResult.value.success
  const grupos = groupsLoaded ? (groupsResult.value.data ?? []).map(toGroupOption) : []
  const casas = casasLoaded ? (casasResult.value.data ?? []).map(toCasaOption) : []
  const loadErrors = [
    groupsLoaded ? null : GROUPS_LOAD_ERROR_MESSAGE,
    casasLoaded ? null : CASAS_LOAD_ERROR_MESSAGE,
  ].filter((message): message is string => Boolean(message))

  if (!groupsLoaded) logAssignmentLoadIssue("groups", groupsResult)
  if (!casasLoaded) logAssignmentLoadIssue("casas", casasResult)

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Asignar Casa Anfitriona"
        botonRegreso={{ href: "/dashboard", texto: "Dashboard" }}
      >
        <TarjetaSistema variante="outlined" className="p-4 sm:p-5">
          <TextoSistema variante="sutil">
            Completa la asignación de grupos activos sin Casa Anfitriona. Los grupos se enlazan únicamente mediante la acción segura del servidor.
          </TextoSistema>
        </TarjetaSistema>
        {loadErrors.length > 0 ? (
          <AssignmentLoadError messages={loadErrors} />
        ) : (
          <AsignarCasaAnfitrionaClient grupos={grupos} casas={casas} />
        )}
      </ContenedorDashboard>
    </DashboardLayout>
  )
}

function AssignmentLoadError({ messages }: { messages: string[] }) {
  return (
    <TarjetaSistema className="p-4 sm:p-6">
      <div role="alert" className="space-y-4">
        <div className="space-y-2">
          <TituloSistema nivel={3}>No pudimos cargar la cola de asignación</TituloSistema>
          <TextoSistema variante="sutil" tamaño="sm">
            La asignación no se puede iniciar con datos incompletos. Reintenta la carga o vuelve al dashboard.
          </TextoSistema>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <Link href="/grupos-vida/casas-anfitrionas/asignar">Reintentar carga</Link>
          <Link href="/dashboard">Volver al dashboard</Link>
        </div>
      </div>
    </TarjetaSistema>
  )
}

function logAssignmentLoadIssue(
  loader: AssignmentLoaderName,
  result: PromiseSettledResult<AssignmentLoadResult>
): void {
  if (result.status === "rejected") {
    console.error(ASSIGNMENT_LOADER_FAILURE_LOG, {
      loader,
      status: "rejected",
      error: getRejectedLoadErrorMetadata(result.reason),
    })
    return
  }

  console.error(ASSIGNMENT_LOADER_FAILURE_LOG, {
    loader,
    status: "fulfilled",
    success: result.value.success,
    error: getSafeReturnedActionError(result.value.error),
  })
}

function getSafeReturnedActionError(error: string | undefined): string {
  if (error && safeAssignmentActionErrors.has(error)) return error
  return "Assignment loader failure details redacted"
}

function getRejectedLoadErrorMetadata(error: unknown): Record<string, string | undefined> {
  if (error instanceof Error) {
    return { name: error.name, message: "Assignment loader exception details redacted" }
  }

  return { message: "Assignment loader exception details redacted" }
}

function toGroupOption(group: {
  grupo_id: string
  grupo_nombre: string
  estado_ciclo: string | null
  segmento: string | null
  temporada: string | null
}): AssignmentGroupOption {
  const details = [group.segmento, group.temporada].filter(Boolean).join(" · ")
  return {
    id: group.grupo_id,
    name: group.grupo_nombre,
    details: details || group.estado_ciclo || "Grupo activo",
  }
}

function toCasaOption(casa: {
  id: string
  nombre_lugar: string
  capacidad_maxima: number | null
  usuarios: unknown
}): AssignmentCasaOption {
  const host = extraerRelacion<{ nombre: string; apellido: string }>(casa.usuarios)
  const hostName = host ? `${host.nombre} ${host.apellido}`.trim() : "Anfitrión no registrado"
  const capacity = casa.capacidad_maxima ? `Capacidad ${casa.capacidad_maxima}` : "Capacidad no especificada"

  return {
    id: casa.id,
    name: casa.nombre_lugar,
    details: `${hostName} · ${capacity}`,
  }
}
