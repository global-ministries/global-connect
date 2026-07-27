"use client"

import React from 'react'
import { AlertTriangle, Users, Calendar, UserCog } from 'lucide-react'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import { TituloSistema } from '@/components/ui/sistema-diseno'
import { CrisisAlertBanner } from '@/components/pastoral/CrisisAlertBanner'
import { Card, CardContent } from '@/components/ui/card'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface PastorDashboardClientProps {
  readonly metrics: {
    readonly unoAunoPorPeriodo: string | number
    readonly lideresActivos: string | number
    readonly alarmas90dias: string | number
  }
  readonly crisisAlerts: ReadonlyArray<{
    readonly oneOnOneId: string
    readonly categoria: string
    readonly keyword: string
    readonly detectedAtIso: string
    readonly assistedPersonaId: string
    readonly assistedPersonaName?: string
  }>
  readonly hasAdminManage?: boolean
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
  hasAdminManage = false,
}: PastorDashboardClientProps) {
  return (
    <ContenedorDashboard
      titulo="Dashboard Pastoral"
      descripcion="Vista global de seguimiento pastoral — pastor/admin"
    >
      {crisisAlerts.length > 0 && (
        <CrisisAlertBanner alerts={crisisAlerts} />
      )}

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
          title="Alarmas 90 días"
          value={metrics.alarmas90dias}
          icon={AlertTriangle}
          description="GDV sin 1:1"
        />
      </div>

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
              Ver sesiones 1:1
            </Button>
          </Link>
        </div>
      </TarjetaSistema>

      {hasAdminManage && (
        <TarjetaSistema>
          <TituloSistema nivel={2} className="mb-3">Administración</TituloSistema>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/pastor/usuarios">
              <Button variant="outline" size="sm">
                <UserCog className="h-4 w-4 mr-1" />
                Gestión de usuarios
              </Button>
            </Link>
          </div>
        </TarjetaSistema>
      )}
    </ContenedorDashboard>
  )
}
