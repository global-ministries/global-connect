"use client"

import type React from 'react'
import Link from 'next/link'
import { AlertTriangle, ClipboardCheck, Home } from 'lucide-react'
import { BadgeSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'

export type MissingHostHomeQueueItem = {
  grupo_id: string
  grupo_nombre: string
  estado_ciclo: string | null
  segmento: string | null
  temporada: string | null
}

export type PendingHostHomeReviewItem = {
  review_id: string
  casa_id: string
  casa_nombre: string
  review_type: 'create' | 'location_change'
  created_at: string
  requested_by: string | null
}

export type HostHomeQueuesData = {
  missingGroups: MissingHostHomeQueueItem[]
  missingGroupsDegraded?: boolean
  pendingReviews: PendingHostHomeReviewItem[]
  pendingReviewsDegraded?: boolean
}

type HostHomeQueuesWidgetProps = {
  canReviewHostHomes?: boolean
  queues?: HostHomeQueuesData
}

const MAX_VISIBLE_ITEMS = 3
const ASSIGNMENT_QUEUE_HREF = '/grupos-vida/casas-anfitrionas/asignar'
const REVIEW_QUEUE_HREF = '/grupos-vida/casas-anfitrionas/revision'

export function HostHomeQueuesWidget({ canReviewHostHomes = false, queues }: HostHomeQueuesWidgetProps) {
  const missingGroups = queues?.missingGroups ?? []
  const pendingReviews = canReviewHostHomes ? queues?.pendingReviews ?? [] : []
  const showMissingGroupsWarning = queues?.missingGroupsDegraded ?? false
  const showPendingReviewsWarning = canReviewHostHomes && (queues?.pendingReviewsDegraded ?? false)

  if (missingGroups.length === 0 && pendingReviews.length === 0 && !showMissingGroupsWarning && !showPendingReviewsWarning) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
      {showMissingGroupsWarning && (
        <QueueLoadWarning
          title="No pudimos cargar la cola de grupos sin Casa Anfitriona"
          description="El dashboard sigue disponible, pero esta cola puede tener trabajo pendiente. Reintenta antes de asumir que no hay grupos por asignar."
          retryHref={ASSIGNMENT_QUEUE_HREF}
          retryLabel="Reintentar asignación"
        />
      )}

      {showPendingReviewsWarning && (
        <QueueLoadWarning
          title="No pudimos cargar la cola de revisión de Casas Anfitrionas"
          description="El dashboard sigue disponible, pero la cola de revisión puede tener decisiones pendientes. Reintenta antes de asumir que no hay revisiones."
          retryHref={REVIEW_QUEUE_HREF}
          retryLabel="Reintentar revisión"
        />
      )}

      {missingGroups.length > 0 && (
        <OperationalQueueCard
          title="Grupos de Vida sin Casa Anfitriona asignada en el sistema"
          count={missingGroups.length}
          icon="missing"
          description="Advertencia no bloqueante: los grupos siguen operativos mientras se completa la asignación."
          actionHref={ASSIGNMENT_QUEUE_HREF}
          actionLabel="Asignar Casa Anfitriona"
        >
          {missingGroups.slice(0, MAX_VISIBLE_ITEMS).map((group) => (
            <QueueItem key={group.grupo_id} title={group.grupo_nombre} subtitle={formatMissingGroupSubtitle(group)} />
          ))}
        </OperationalQueueCard>
      )}

      {pendingReviews.length > 0 && (
        <OperationalQueueCard
          title="Casas Anfitrionas pendientes de revisión"
          count={pendingReviews.length}
          icon="pending"
          description="Revisión no bloqueante: las casas pendientes permanecen fuera del mapa hasta su aprobación."
          actionHref={REVIEW_QUEUE_HREF}
          actionLabel="Revisar Casas Anfitrionas"
        >
          {pendingReviews.slice(0, MAX_VISIBLE_ITEMS).map((review) => (
            <QueueItem key={review.review_id} title={review.casa_nombre} subtitle={formatPendingReviewSubtitle(review)} />
          ))}
        </OperationalQueueCard>
      )}
    </div>
  )
}

function QueueLoadWarning({
  description,
  retryHref,
  retryLabel,
  title,
}: {
  description: string
  retryHref: string
  retryLabel: string
  title: string
}) {
  return (
    <TarjetaSistema role="alert" className="p-3 md:p-4 lg:p-6 h-full">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-lg ring-1 ring-white/20 shadow-lg shrink-0">
          <AlertTriangle className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0 space-y-2">
          <TituloSistema nivel={3} className="text-sm sm:text-base leading-tight">{title}</TituloSistema>
          <TextoSistema variante="sutil" tamaño="sm">{description}</TextoSistema>
          <Link
            href={retryHref}
            className="inline-flex min-h-[44px] items-center rounded-xl border-2 border-border px-3 py-2 text-sm font-medium text-foreground transition-[background-color,box-shadow,transform] duration-200 ease-expo hover:border-border/80 hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          >
            {retryLabel}
          </Link>
        </div>
      </div>
    </TarjetaSistema>
  )
}

function OperationalQueueCard({
  children,
  count,
  description,
  icon,
  title,
  actionHref,
  actionLabel,
}: {
  children: React.ReactNode
  actionHref: string
  actionLabel: string
  count: number
  description: string
  icon: 'missing' | 'pending'
  title: string
}) {
  const Icon = icon === 'missing' ? Home : ClipboardCheck

  return (
    <TarjetaSistema role="region" aria-label={title} className="p-3 md:p-4 lg:p-6 h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg ring-1 ring-white/20 shadow-lg shrink-0">
            <Icon className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <TituloSistema nivel={3} className="text-sm sm:text-base leading-tight">{title}</TituloSistema>
            <TextoSistema variante="sutil" tamaño="sm" className="mt-1">{description}</TextoSistema>
          </div>
        </div>
        <BadgeSistema variante="warning" tamaño="sm">{count}</BadgeSistema>
      </div>

      <div className="space-y-2 flex-1">{children}</div>

      <div className="mt-4">
        <Link
          href={actionHref}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border-2 border-border px-3 py-2 text-sm font-medium text-foreground transition-[background-color,box-shadow,transform] duration-200 ease-expo hover:border-border/80 hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background sm:w-auto"
        >
          {actionLabel}
        </Link>
      </div>
    </TarjetaSistema>
  )
}

function QueueItem({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <div className="text-sm font-semibold text-foreground truncate">{title}</div>
      <TextoSistema variante="sutil" tamaño="sm" className="truncate">{subtitle}</TextoSistema>
    </div>
  )
}

function formatMissingGroupSubtitle(group: MissingHostHomeQueueItem): string {
  const details = [group.segmento, group.temporada].filter(Boolean)
  if (details.length > 0) return details.join(' · ')
  return group.estado_ciclo ?? 'Grupo activo'
}

function formatPendingReviewSubtitle(review: PendingHostHomeReviewItem): string {
  const typeLabel = review.review_type === 'location_change' ? 'Cambio de ubicación' : 'Solicitud nueva'
  return `${typeLabel} · ${review.requested_by ?? 'Solicitante no registrado'}`
}
