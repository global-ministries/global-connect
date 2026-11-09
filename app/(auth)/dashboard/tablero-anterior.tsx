/**
 * The previous per-role dashboard, kept inside the home's «A tu cargo» and
 * «Visión general» sections so nothing is lost while T4 of
 * odd/tasks/home-por-rol.md builds their new content. Loaded only when one of
 * those sections is present.
 */
import type { ReactElement, ReactNode } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { ChevronRight } from 'lucide-react'

import DashboardAdmin from '@/components/dashboard/roles/DashboardAdmin'
import DashboardDirector from '@/components/dashboard/roles/DashboardDirector'
import DashboardLider from '@/components/dashboard/roles/DashboardLider'
import type { HostHomeQueuesData, PendingHostHomeReviewItem } from '@/components/dashboard/widgets/HostHomeQueuesWidget'
import { CLASE_LISTA_INSET } from '@/components/inicio/partes-inicio'
import { rutaGrupo } from '@/components/inicio/textos-inicio'
import { TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { obtenerCasasRevisionPendiente, obtenerGruposSinCasaAnfitriona } from '@/lib/actions/casas-anfitrionas.actions'
import { canReviewHostHomes } from '@/lib/casas-anfitrionas/review-roles'
import { getDashboardPlatformNavigationFlags, resolveDashboardContextualAccess, type DashboardContextualShortcut } from '@/lib/dashboard/contextual-navigation'
import { obtenerDatosDashboard } from '@/lib/dashboard/obtenerDatosDashboard'
import type { CargoInicio } from '@/lib/inicio/decidir-secciones'
import { cn } from '@/lib/utils'

const operationalDashboardRoles = new Set(['admin', 'pastor', 'director-general', 'director-etapa', 'lider'])
export const HOST_HOME_QUEUE_FETCH_TIMEOUT_MS = 3000

// Written by CampusProvider (hooks/useCampus.tsx) when the person picks a campus.
const CAMPUS_COOKIE = 'gc_campus_activo'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The cookie is client-controlled, so only a well-formed uuid is accepted; it narrows the
// first paint to the selected campus and is never used for access control.
async function leerCampusInicial(): Promise<string | null> {
  const valor = (await cookies()).get(CAMPUS_COOKIE)?.value
  return valor && UUID_RE.test(valor) ? valor : null
}

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

export type TableroAnterior = { aCargo?: ReactNode; visionGeneral?: ReactNode }

function enlaceCargo(c: CargoInicio): { titulo: string; href: string } {
  switch (c.tipo) {
    case 'grupo-lider':
      return { titulo: c.nombre ?? 'Tu grupo', href: rutaGrupo(c.grupoId) }
    case 'etapa':
      return { titulo: 'Grupos de tu etapa', href: '/grupos-vida' }
    case 'segmento':
      return { titulo: 'Grupos de tu segmento', href: '/grupos-vida' }
    case 'area-dream-team':
      return { titulo: 'Mi equipo de Dream Team', href: '/dream-team/mi-equipo' }
  }
}

/** What the person has in charge when no previous dashboard covers it (e.g. a Dream Team area). */
function EnlacesCargo({ cargos }: { readonly cargos: CargoInicio[] }): ReactElement {
  const enlaces = cargos.map(enlaceCargo)
  return (
    <ul className={CLASE_LISTA_INSET}>
      {enlaces.map((e, i) => (
        <li key={`${e.href}-${i}`} className={cn('relative', i > 0 && 'before:absolute before:top-0 before:right-0 before:left-3.5 before:h-px before:bg-border/60')}>
          <Link href={e.href} className="focus-ring flex min-h-16 min-w-0 items-center gap-3 px-3.5 touch-manipulation transition-colors active:bg-accent md:hover:bg-accent/60">
            <span className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{e.titulo}</span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * Loads the previous dashboard for the sections present. Admin and pastor
 * keep their campus view under «Visión general»; the director general,
 * director de etapa and líder keep theirs under «A tu cargo».
 */
export async function cargarTableroAnterior({ cargos, conVision }: { cargos: CargoInicio[] | null; conVision: boolean }): Promise<TableroAnterior> {
  const data = await obtenerDatosDashboard(await leerCampusInicial())
  const hostHomeQueues = await obtenerColasCasasAnfitrionas(data.rol)
  const widgets = hostHomeQueues ? { ...data.widgets, casas_anfitrionas_queues: hostHomeQueues } : data.widgets
  const contextos = await resolveDashboardContextualAccess(data.platformSession, getDashboardPlatformNavigationFlags())
  const esCampus = data.rol === 'admin' || data.rol === 'pastor'

  const visionGeneral = conVision && esCampus ? <DashboardAdmin data={widgets} rol={data.rol} campusInicialId={data.campusId ?? null} /> : undefined

  let aCargo: ReactNode
  if (cargos) {
    aCargo =
      data.rol === 'director-general' ? (
        <DashboardAdmin data={widgets} rol={data.rol} campusInicialId={data.campusId ?? null} />
      ) : data.rol === 'director-etapa' ? (
        <DashboardDirector data={widgets} />
      ) : data.rol === 'lider' ? (
        <DashboardLider data={widgets} />
      ) : (
        <EnlacesCargo cargos={cargos} />
      )
  }

  const accesos = contextos.length > 0 ? <ContextosVisiblesDashboard items={contextos} /> : null
  if (accesos && visionGeneral) return { aCargo, visionGeneral: <>{visionGeneral}{accesos}</> }
  if (accesos && aCargo) return { aCargo: <>{aCargo}{accesos}</>, visionGeneral }
  return { aCargo, visionGeneral }
}

function ContextosVisiblesDashboard({ items }: { items: DashboardContextualShortcut[] }) {
  return (
    <TarjetaSistema className="p-4 md:p-5">
      <section aria-labelledby="contextos-visibles-dashboard" className="space-y-3">
        <div className="space-y-1">
          <TituloSistema id="contextos-visibles-dashboard" nivel={3}>Contextos visibles</TituloSistema>
          <TextoSistema variante="sutil" tamaño="sm">
            Accesos disponibles para tu sesión actual.
          </TextoSistema>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              aria-label={`Abrir ${item.label}`}
              className="rounded-xl border border-border bg-card/60 px-4 py-3 transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
            >
              <span className="block text-sm font-medium text-foreground">{item.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>
            </Link>
          ))}
        </div>
      </section>
    </TarjetaSistema>
  )
}
