"use client"

/**
 * W13 — CrisisAlertBanner component.
 *
 * Alert banner for pastor/admin when crisis is detected.
 * Sensitivity-aware: shows keyword category, not full content.
 * Only visible to pastor/admin (pastoral.read.all).
 *
 * Mobile-first: full-width banner.
 */

import React from 'react'
import Link from 'next/link'
import { AlertTriangle, ShieldAlert, ArrowRight } from 'lucide-react'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'

interface CrisisAlert {
  readonly oneOnOneId: string
  readonly categoria: string
  readonly keyword: string
  readonly detectedAtIso: string
  readonly assistedPersonaId: string
  readonly assistedPersonaName?: string
}

interface CrisisAlertBannerProps {
  readonly alerts: ReadonlyArray<CrisisAlert>
  readonly className?: string
}

// ─── Category labels ─────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  duelo: 'Duelo',
  crisis_matrimonial: 'Crisis Matrimonial',
  ideacion_suicida: 'Ideación Suicida',
  violencia_intrafamiliar: 'Violencia Intrafamiliar',
  crisis_de_fe: 'Crisis de Fe',
}


// ─── Component ───────────────────────────────────────────────────────────────

export function CrisisAlertBanner({ alerts, className }: CrisisAlertBannerProps) {
  if (alerts.length === 0) return null

  const [mostUrgent, ...rest] = alerts

  return (
    <section
      aria-label="Alerta de crisis"
      className={cn('rounded-2xl border border-danger/30 bg-danger/10 p-4', className)}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            {/* Header */}
            <div className="mb-1 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
              <span className="text-sm font-semibold text-danger-text">Alerta de Crisis Detectada</span>
            </div>

            {/* Most urgent alert */}
            <p className="text-sm font-medium text-foreground">
              {CATEGORY_LABELS[mostUrgent.categoria] ?? mostUrgent.categoria}
              {mostUrgent.assistedPersonaName && ` — ${mostUrgent.assistedPersonaName}`}
            </p>

            {/* Keyword (no sensitive content) */}
            <p className="mt-1 text-xs text-muted-foreground">
              Palabra detectada: &quot;{mostUrgent.keyword}&quot;
            </p>

            {/* Additional alerts count */}
            {rest.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                +{rest.length} alerta{rest.length !== 1 ? 's' : ''} adicional{rest.length !== 1 ? 'es' : ''}
              </p>
            )}
          </div>
        </div>

        {/* CTA */}
        <BotonSistema
          asChild
          variante="peligro"
          icono={ArrowRight}
          iconoPosicion="derecha"
          className="w-full sm:w-auto"
        >
          <Link href="/pastor/crisis">
            Ver alertas
          </Link>
        </BotonSistema>
      </div>
    </section>
  )
}
