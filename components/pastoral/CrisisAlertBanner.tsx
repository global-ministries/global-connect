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
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

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

const CATEGORY_VARIANT: Record<string, 'destructive' | 'warning' | 'secondary'> = {
  duelo: 'warning',
  crisis_matrimonial: 'destructive',
  ideacion_suicida: 'destructive',
  violencia_intrafamiliar: 'destructive',
  crisis_de_fe: 'warning',
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CrisisAlertBanner({ alerts, className }: CrisisAlertBannerProps) {
  if (alerts.length === 0) return null

  const [mostUrgent, ...rest] = alerts

  return (
    <Card
      className={`border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-950/20 ${className ?? ''}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                Alerta de Crisis Detectada
              </span>
            </div>

            {/* Most urgent alert */}
            <p className="text-sm text-red-600/80 dark:text-red-400/80 font-medium">
              {CATEGORY_LABELS[mostUrgent.categoria] ?? mostUrgent.categoria}
              {mostUrgent.assistedPersonaName && ` — ${mostUrgent.assistedPersonaName}`}
            </p>

            {/* Keyword (no sensitive content) */}
            <p className="text-xs text-red-500/70 dark:text-red-500/60 mt-1">
              Palabra detectada: "{mostUrgent.keyword}"
            </p>

            {/* Additional alerts count */}
            {rest.length > 0 && (
              <p className="text-xs text-red-500/70 dark:text-red-500/60 mt-1">
                +{rest.length} alerta{rest.length !== 1 ? 's' : ''} adicional{rest.length !== 1 ? 'es' : ''}
              </p>
            )}
          </div>

          {/* CTA */}
          <Link href="/pastor/crisis">
            <Button
              variant="destructive"
              size="sm"
              className="shrink-0"
              aria-label="Ver todas las alertas de crisis"
            >
              Ver alertas
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
