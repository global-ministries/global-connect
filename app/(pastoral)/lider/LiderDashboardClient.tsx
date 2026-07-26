"use client"

import React from 'react'
import { Calendar } from 'lucide-react'
import { ContenedorDashboard, TarjetaSistema, TituloSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'
import { OneOnOneCard } from '@/components/pastoral/OneOnOneCard'
import { CrisisAlertBanner } from '@/components/pastoral/CrisisAlertBanner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface LiderDashboardClientProps {
  readonly unoAunos: ReadonlyArray<{
    id: string
    estado: string
    scheduledAtIso: string | null
    assistedPersonaName: string
    pasosValidadosCount: number
  }>
  readonly crisisAlerts: ReadonlyArray<{
    oneOnOneId: string
    categoria: string
    keyword: string
    detectedAtIso: string
    assistedPersonaId: string
    assistedPersonaName?: string
  }>
  readonly isLoading?: boolean
}

export default function LiderDashboardClient({
  unoAunos,
  crisisAlerts,
  isLoading = false,
}: LiderDashboardClientProps) {
  const upcomingUnoAunos = unoAunos.filter((u) => u.estado === 'scheduled')

  return (
    <ContenedorDashboard titulo="Mi Seguimiento Pastoral" descripcion="Gestiona tus sesiones 1:1">
      {crisisAlerts.length > 0 && (
        <CrisisAlertBanner alerts={crisisAlerts} />
      )}

      <TarjetaSistema>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-[var(--brand-primary)]" />
            <TituloSistema nivel={2}>Próximas Sesiones 1:1</TituloSistema>
          </div>
          <Link href="/lider/uno-auno">
            <Button variant="ghost" size="sm">
              Ver todas
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <SkeletonSistema alto="80px" />
            <SkeletonSistema alto="80px" />
          </div>
        ) : upcomingUnoAunos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No tienes sesiones 1:1 programadas.
          </p>
        ) : (
          <div className="space-y-3">
            {upcomingUnoAunos.slice(0, 5).map((u) => (
              <OneOnOneCard
                key={u.id}
                id={u.id}
                estado={u.estado}
                scheduledAtIso={u.scheduledAtIso}
                assistedPersonaName={u.assistedPersonaName}
                pasosValidadosCount={u.pasosValidadosCount}
                href={`/lider/uno-a-uno/${u.id}`}
              />
            ))}
          </div>
        )}
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
