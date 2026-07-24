"use client"

/**
 * W13 — Pastor dashboard client component.
 *
 * Shows all pastoral metrics (from W12) + crisis alerts.
 * Only visible to pastoral.read.all capability.
 */

import React from 'react'
import { AlertTriangle, Users, Calendar, TrendingUp } from 'lucide-react'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import { TituloSistema } from '@/components/ui/sistema-diseno'
import { CrisisAlertBanner } from '@/components/pastoral/CrisisAlertBanner'
import { Card, CardContent } from '@/components/ui/card'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface PastorDashboardClientProps {
  readonly metrics: {
    readonly unoAunoPorPeriodo: number
    readonly lideresActivos: number
    readonly triadasActivas: number
    readonly alarmas90dias: number
  }
  readonly crisisAlerts: ReadonlyArray<{
    readonly oneOnOneId: string
    readonly categoria: string
    readonly keyword: string
    readonly detectedAtIso: string
    readonly assistedPersonaId: string
    readonly assistedPersonaName?: string
  }>
}

function MetricCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string
  value: string | number
  icon: React.ElementType
  description?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--brand-primary)]/10">
            <Icon className="h-5 w-5 text-[var(--brand-primary)]" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{title}</p>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function PastorDashboardClient({
  metrics,
  crisisAlerts,
}: PastorDashboardClientProps) {
  return (
    <ContenedorDashboard
      titulo="Dashboard Pastoral"
      descripcion="Vista global de seguimiento pastoral — pastor/admin"
    >
      {/* Crisis alerts */}
      {crisisAlerts.length > 0 && (
        <CrisisAlertBanner alerts={crisisAlerts} />
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          title="Sesiones 1:1"
          value={metrics.unoAunoPorPeriodo}
          icon={Calendar}
          description="Últimos 30 días"
        />
        <MetricCard
          title="Líderes Activos"
          value={metrics.lideresActivos}
          icon={Users}
          description="Con sesión en ventana"
        />
        <MetricCard
          title="Tríadas Activas"
          value={metrics.triadasActivas}
          icon={TrendingUp}
        />
        <MetricCard
          title="Alarmas 90 días"
          value={metrics.alarmas90dias}
          icon={AlertTriangle}
          description="GDV sin 1:1"
        />
      </div>

      {/* Quick actions */}
      <TarjetaSistema>
        <TituloSistema nivel={2} className="mb-3">Accesos Rápidos</TituloSistema>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/pastor/crisis">
            <Button variant="destructive" size="sm">
              <AlertTriangle className="h-4 w-4" />
              Ver alertas de crisis
            </Button>
          </Link>
          <Link href="/pastor/lecturas">
            <Button variant="outline" size="sm">
              Ver sesiones 1:1 y tríadas
            </Button>
          </Link>
        </div>
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
