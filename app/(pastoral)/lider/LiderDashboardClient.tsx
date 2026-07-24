"use client"

/**
 * W13 — DT-074 / DT-079 — Líder dashboard page.
 *
 * Shows:
 * - Upcoming 1:1 sessions
 * - Active tríadas
 * - Crisis alerts (if any)
 *
 * Uses auth.uid() via server-side session.
 */

import React from 'react'
import { Users, Calendar, AlertTriangle } from 'lucide-react'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import { TituloSistema } from '@/components/ui/sistema-diseno'
import { OneOnOneCard } from '@/components/pastoral/OneOnOneCard'
import { TriadaCard } from '@/components/pastoral/TriadaCard'
import { CrisisAlertBanner } from '@/components/pastoral/CrisisAlertBanner'
import { SkeletonSistema } from '@/components/ui/sistema-diseno'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

// ─── Types (from server) ─────────────────────────────────────────────────────

interface LiderDashboardClientProps {
  readonly unoAunos: ReadonlyArray<{
    id: string
    estado: string
    scheduledAtIso: string | null
    assistedPersonaName: string
    pasosValidadosCount: number
  }>
  readonly triadas: ReadonlyArray<{
    id: string
    estado: string
    contexto: string
    createdAtIso: string
    miembrosCount: number
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

// ─── Client component ─────────────────────────────────────────────────────────

export default function LiderDashboardClient({
  unoAunos,
  triadas,
  crisisAlerts,
  isLoading = false,
}: LiderDashboardClientProps) {
  const upcomingUnoAunos = unoAunos.filter((u) => u.estado === 'scheduled')
  const activeTriadas = triadas.filter((t) => t.estado === 'active')

  return (
    <ContenedorDashboard titulo="Mi Seguimiento Pastoral" descripcion="Gestiona tus sesiones 1:1 y tríadas">
      {/* Crisis alerts */}
      {crisisAlerts.length > 0 && (
        <CrisisAlertBanner alerts={crisisAlerts} />
      )}

      {/* Upcoming 1:1s */}
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
                href={`/lider/uno-auno/${u.id}`}
              />
            ))}
          </div>
        )}
      </TarjetaSistema>

      {/* Active tríadas */}
      <TarjetaSistema>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--brand-primary)]" />
            <TituloSistema nivel={2}>Tríadas Activas</TituloSistema>
          </div>
          <Link href="/lider/triada">
            <Button variant="ghost" size="sm">
              Ver todas
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <SkeletonSistema alto="80px" />
          </div>
        ) : activeTriadas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No tienes tríadas activas.
          </p>
        ) : (
          <div className="space-y-3">
            {activeTriadas.map((t) => (
              <TriadaCard
                key={t.id}
                id={t.id}
                estado={t.estado}
                contexto={t.contexto}
                createdAtIso={t.createdAtIso}
                miembrosCount={t.miembrosCount}
                href={`/lider/triada/${t.id}`}
              />
            ))}
          </div>
        )}
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
