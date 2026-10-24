"use client"

import React from 'react'
import { Calendar } from 'lucide-react'
import Link from 'next/link'
import { BotonSistema, PaginaSistema, TarjetaSistema, TituloSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'
import { OneOnOneCard } from '@/components/pastoral/OneOnOneCard'
import { CrisisAlertBanner } from '@/components/pastoral/CrisisAlertBanner'

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
    <PaginaSistema titulo="Mi Seguimiento Pastoral" descripcion="Gestiona tus sesiones 1:1">
      {crisisAlerts.length > 0 && (
        <CrisisAlertBanner alerts={crisisAlerts} />
      )}

      <TarjetaSistema>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Calendar className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
            <TituloSistema nivel={2}>Próximas Sesiones 1:1</TituloSistema>
          </div>
          <BotonSistema asChild variante="ghost" tamaño="sm">
            <Link href="/lider/uno-auno">
              Ver todas
            </Link>
          </BotonSistema>
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
    </PaginaSistema>
  )
}
