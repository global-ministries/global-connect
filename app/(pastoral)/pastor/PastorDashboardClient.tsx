"use client"

import React from 'react'
import { AlertTriangle, Users, Calendar, UserCog } from 'lucide-react'
import Link from 'next/link'
import { BotonSistema, PaginaSistema, TarjetaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { CrisisAlertBanner } from '@/components/pastoral/CrisisAlertBanner'
import { CLASE_BOTON_PELIGRO, CLASE_ENLACE_BOTON } from '@/components/pastoral/estilos'
import { cn } from '@/lib/utils'

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
    <TarjetaSistema className="p-4">
      <div className="flex items-center gap-3">
        <div className="shrink-0 rounded-xl bg-[var(--brand-primary)]/10 p-2">
          <Icon className="h-5 w-5 text-[var(--brand-primary)]" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{title}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
    </TarjetaSistema>
  )
}

export default function PastorDashboardClient({
  metrics,
  crisisAlerts,
  hasAdminManage = false,
}: PastorDashboardClientProps) {
  return (
    <PaginaSistema
      titulo="Dashboard Pastoral"
      descripcion="Vista global de seguimiento pastoral — pastor/admin"
    >
      {crisisAlerts.length > 0 && (
        <CrisisAlertBanner alerts={crisisAlerts} />
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
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
          <Link href="/pastor/crisis" className={cn(CLASE_ENLACE_BOTON, 'w-full sm:w-auto')}>
            <BotonSistema tabIndex={-1} icono={AlertTriangle} className={cn(CLASE_BOTON_PELIGRO, 'w-full sm:w-auto')}>
              Ver alertas de crisis
            </BotonSistema>
          </Link>
          <Link href="/pastor/lecturas" className={cn(CLASE_ENLACE_BOTON, 'w-full sm:w-auto')}>
            <BotonSistema tabIndex={-1} variante="outline" className="w-full sm:w-auto">
              Ver sesiones 1:1
            </BotonSistema>
          </Link>
        </div>
      </TarjetaSistema>

      {hasAdminManage && (
        <TarjetaSistema>
          <TituloSistema nivel={2} className="mb-3">Administración</TituloSistema>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/pastor/usuarios" className={cn(CLASE_ENLACE_BOTON, 'w-full sm:w-auto')}>
              <BotonSistema tabIndex={-1} variante="outline" icono={UserCog} className="w-full sm:w-auto">
                Gestión de usuarios
              </BotonSistema>
            </Link>
          </div>
        </TarjetaSistema>
      )}
    </PaginaSistema>
  )
}
