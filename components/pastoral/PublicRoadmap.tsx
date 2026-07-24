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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
    <div className={`space-y-4 ${className ?? ''}`}>
      {/* Next 1:1 */}
      {roadmap.proximoUnoAuno && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Próxima Sesión 1:1</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {roadmap.proximoUnoAuno.scheduledAtIso
                      ? format(new Date(roadmap.proximoUnoAuno.scheduledAtIso), "d 'de' MMMM", { locale: es })
                      : 'Sin fecha programada'}
                  </span>
                </div>
                <Badge variant="outline">
                  {roadmap.proximoUnoAuno.estado === 'scheduled' ? 'Programada' : 'En progreso'}
                </Badge>
              </div>
              <Link href={`/asistido/uno-auno`}>
                <Button variant="ghost" size="sm" aria-label="Ver todas mis sesiones">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggested next step */}
      {roadmap.proximoPasoSugerido && (
        <Card className="border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-[var(--brand-primary)] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Tu próximo paso sugerido</p>
                <p className="text-sm text-[var(--brand-primary)] font-semibold">
                  {STEP_LABELS[roadmap.proximoPasoSugerido] ?? roadmap.proximoPasoSugerido}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Compartido por tu mentor después de tu última sesión.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validated milestones */}
      {roadmap.pasosValidadosTotal.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Hitos Alcanzados</CardTitle>
            <CardDescription>
              Estos hitos fueron validados con tu mentor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {roadmap.pasosValidadosTotal.map((step) => (
                <li key={step.id} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-sm">
                    {STEP_LABELS[step.stepKey] ?? step.stepKey}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {format(new Date(step.validatedAtIso), 'MMM yyyy', { locale: es })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {roadmap.sesiones.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Tu roadmap pastoral se generará cuando tu mentor programe tu primera sesión 1:1.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
