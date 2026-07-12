import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { obtenerDatosDashboard } from '@/lib/dashboard/obtenerDatosDashboard'
import DashboardAdmin from '@/components/dashboard/roles/DashboardAdmin'
import DashboardDirector from '@/components/dashboard/roles/DashboardDirector'
import DashboardLider from '@/components/dashboard/roles/DashboardLider'
import DashboardMiembro from '@/components/dashboard/roles/DashboardMiembro'
import { obtenerCasasRevisionPendiente, obtenerGruposSinCasaAnfitriona } from '@/lib/actions/casas-anfitrionas.actions'
import { canReviewHostHomes } from '@/lib/casas-anfitrionas/review-roles'
import type { HostHomeQueuesData, MissingHostHomeQueueItem, PendingHostHomeReviewItem } from '@/components/dashboard/widgets/HostHomeQueuesWidget'

export const dynamic = 'force-dynamic'

const operationalDashboardRoles = new Set(['admin', 'pastor', 'director-general', 'director-etapa', 'lider'])
export const HOST_HOME_QUEUE_FETCH_TIMEOUT_MS = 3000

type QueueActionResult<T> = {
  success: boolean
  data?: T[]
  degraded?: boolean
  error?: string
}

function degradedQueueResult<T>(): QueueActionResult<T> {
  return { success: false, data: [], degraded: true, error: 'No pudimos cargar esta cola' }
}

function withQueueFallback<T>(operation: Promise<QueueActionResult<T>>, queueName: string): Promise<QueueActionResult<T>> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('Casa host-home queue fetch timed out; using degraded fallback.', {
        queueName,
        timeoutMs: HOST_HOME_QUEUE_FETCH_TIMEOUT_MS,
      })
      resolve(degradedQueueResult<T>())
    }, HOST_HOME_QUEUE_FETCH_TIMEOUT_MS)

    operation
      .then((result) => {
        clearTimeout(timeout)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timeout)
        console.error('Error cargando colas de Casas Anfitrionas:', error)
        resolve(degradedQueueResult<T>())
      })
  })
}

async function obtenerColasCasasAnfitrionas(rol: string): Promise<HostHomeQueuesData | undefined> {
  if (!operationalDashboardRoles.has(rol)) return undefined

  const canReviewHostHomeQueue = canReviewHostHomes(rol)
  const [missingResult, pendingResult] = await Promise.all([
    withQueueFallback(obtenerGruposSinCasaAnfitriona({ scope: 'active' }), 'missing-host-home-groups'),
    canReviewHostHomeQueue
      ? withQueueFallback(obtenerCasasRevisionPendiente(), 'pending-host-home-reviews')
      : Promise.resolve<QueueActionResult<PendingHostHomeReviewItem>>({ success: true, data: [] }),
  ])

  return {
    missingGroups: missingResult.success ? missingResult.data ?? [] : [],
    missingGroupsDegraded: !missingResult.success,
    pendingReviews: pendingResult.success ? pendingResult.data ?? [] : [],
    pendingReviewsDegraded: canReviewHostHomeQueue && !pendingResult.success,
  }
}

export default async function PaginaTablero() {
  const data = await obtenerDatosDashboard()
  const hostHomeQueues = await obtenerColasCasasAnfitrionas(data.rol)
  const widgets = hostHomeQueues
    ? { ...data.widgets, casas_anfitrionas_queues: hostHomeQueues }
    : data.widgets

  const titulo = 'Dashboard'
  const descripcion =
    data.rol === 'admin' || data.rol === 'pastor'
      ? 'Visión estratégica global de la organización'
      : data.rol === 'director-general'
      ? 'Visión de tus segmentos asignados'
      : data.rol === 'director-etapa'
      ? 'Supervisión y gestión de tu etapa'
      : data.rol === 'lider'
      ? 'Gestión operativa de tu(s) grupo(s)'
      : 'Conexión e información personal'

  return (
    <DashboardLayout>
      <ContenedorDashboard titulo={titulo} descripcion={descripcion}>
        {data.rol === 'admin' || data.rol === 'pastor' || data.rol === 'director-general' ? (
          <DashboardAdmin data={widgets} rol={data.rol} />
        ) : data.rol === 'director-etapa' ? (
          <DashboardDirector data={widgets} />
        ) : data.rol === 'lider' ? (
          <DashboardLider data={widgets} />
        ) : (
          <DashboardMiembro data={widgets} />
        )}
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
