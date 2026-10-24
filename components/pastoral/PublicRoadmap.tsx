"use client"

/**
 * W13 — PublicRoadmap component (P6).
 *
 * Public view of the assisted person's pastoral roadmap.
 * Shows: next 1:1, validated milestones, next suggested step.
 * Hides: private notes, individual steps (P9).
 *
 * Mobile-first: stacked cards on mobile.
 */

import React from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar, CheckCircle2, ArrowRight, MapPin } from 'lucide-react'
import { BadgeSistema, TarjetaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import type { PublicRoadmap } from '@/lib/platform/pastoral/public-roadmap/types'

interface PublicRoadmapProps {
  readonly roadmap: PublicRoadmap
  readonly className?: string
}

// ─── Step key labels ─────────────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  primera_conexion: 'Primera Conexión',
  establecer_proposito: 'Establecer Propósito',
  crecimiento_proposito: 'Crecimiento en Propósito',
  servicio_inicial: 'Servicio Inicial',
  formacion_lider: 'Formación como Líder',
  envio: 'Envío',
  matrimonio_preparacion: 'Preparación para el Matrimonio',
  matrimonio_compromiso: 'Compromiso en el Matrimonio',
  matrimonio_comunidad: 'Matrimonio en Comunidad',
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PublicRoadmap({ roadmap, className }: PublicRoadmapProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Next 1:1 */}
      {roadmap.proximoUnoAuno && (
        <TarjetaSistema className="p-4 sm:p-6">
          <TituloSistema nivel={2} className="mb-3">Próxima Sesión 1:1</TituloSistema>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-medium">
                  {roadmap.proximoUnoAuno.scheduledAtIso
                    ? format(new Date(roadmap.proximoUnoAuno.scheduledAtIso), "d 'de' MMMM", { locale: es })
                    : 'Sin fecha programada'}
                </span>
              </div>
              <BadgeSistema variante={roadmap.proximoUnoAuno.estado === 'scheduled' ? 'info' : 'warning'} tamaño="sm">
                {roadmap.proximoUnoAuno.estado === 'scheduled' ? 'Programada' : 'En progreso'}
              </BadgeSistema>
            </div>
            <Link
              href={`/asistido/uno-auno`}
              aria-label="Ver todas mis sesiones"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
        </TarjetaSistema>
      )}

      {/* Suggested next step */}
      {roadmap.proximoPasoSugerido && (
        <div className="rounded-2xl border border-brand/30 bg-brand/5 p-4">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">Tu próximo paso sugerido</p>
              <p className="text-sm font-semibold text-brand-text">
                {STEP_LABELS[roadmap.proximoPasoSugerido] ?? roadmap.proximoPasoSugerido}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Compartido por tu mentor después de tu última sesión.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Validated milestones */}
      {roadmap.pasosValidadosTotal.length > 0 && (
        <TarjetaSistema className="p-4 sm:p-6">
          <TituloSistema nivel={2}>Hitos Alcanzados</TituloSistema>
          <p className="mb-3 mt-1 text-sm text-muted-foreground">
            Estos hitos fueron validados con tu mentor.
          </p>
          <ul className="space-y-2">
            {roadmap.pasosValidadosTotal.map((step) => (
              <li key={step.id} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <span className="min-w-0 text-sm">
                  {STEP_LABELS[step.stepKey] ?? step.stepKey}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {format(new Date(step.validatedAtIso), 'MMM yyyy', { locale: es })}
                </span>
              </li>
            ))}
          </ul>
        </TarjetaSistema>
      )}

      {/* Empty state */}
      {roadmap.sesiones.length === 0 && (
        <TarjetaSistema className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Tu roadmap pastoral se generará cuando tu mentor programe tu primera sesión 1:1.
          </p>
        </TarjetaSistema>
      )}
    </div>
  )
}
