"use client"

/**
 * W13 — OneOnOneCard component.
 *
 * Reusable card for displaying a pastoral 1:1 session.
 * Used in: lider 1:1 list, asistido roadmap, pastor reading view.
 *
 * Mobile-first: full-width on mobile, card layout on desktop.
 */

import React from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar, Clock, User, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface OneOnOneCardProps {
  readonly id: string
  readonly estado: string
  readonly scheduledAtIso: string | null
  readonly assistedPersonaName?: string
  readonly mentorPersonaName?: string
  readonly pasosValidadosCount?: number
  readonly href: string
  readonly showMentor?: boolean
  readonly className?: string
}

// ─── State badge ─────────────────────────────────────────────────────────────

function estadoBadgeVariant(estado: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (estado) {
    case 'scheduled': return 'outline'
    case 'in_progress': return 'secondary'
    case 'completed': return 'default'
    case 'cancelled': return 'destructive'
    default: return 'outline'
  }
}

function estadoLabel(estado: string): string {
  switch (estado) {
    case 'scheduled': return 'Programado'
    case 'in_progress': return 'En progreso'
    case 'completed': return 'Completado'
    case 'cancelled': return 'Cancelado'
    default: return estado
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function OneOnOneCard({
  id,
  estado,
  scheduledAtIso,
  assistedPersonaName,
  mentorPersonaName,
  pasosValidadosCount = 0,
  href,
  showMentor = false,
  className,
}: OneOnOneCardProps) {
  const formattedDate = scheduledAtIso
    ? format(new Date(scheduledAtIso), "d 'de' MMMM 'de' yyyy", { locale: es })
    : 'Sin fecha'

  const formattedTime = scheduledAtIso
    ? format(new Date(scheduledAtIso), 'HH:mm')
    : null

  return (
    <Card
      className={`hover:border-[var(--brand-primary)]/40 transition-colors ${className ?? ''}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Header: date + badge */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Badge variant={estadoBadgeVariant(estado)}>
                {estadoLabel(estado)}
              </Badge>
              {pasosValidadosCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {pasosValidadosCount} paso{pasosValidadosCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            {/* Date + time */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{formattedDate}</span>
              {formattedTime && (
                <>
                  <Clock className="h-3.5 w-3.5 shrink-0 ml-2" />
                  <span>{formattedTime}</span>
                </>
              )}
            </div>

            {/* Names */}
            {assistedPersonaName && (
              <div className="flex items-center gap-1.5 text-sm mt-1">
                <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-foreground font-medium">
                  {assistedPersonaName}
                </span>
              </div>
            )}
            {showMentor && mentorPersonaName && (
              <div className="flex items-center gap-1.5 text-sm mt-1">
                <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-muted-foreground">
                  Mentor: {mentorPersonaName}
                </span>
              </div>
            )}
          </div>

          {/* Arrow */}
          <Link
            href={href}
            className="shrink-0 p-2 rounded-lg hover:bg-accent transition-colors"
            aria-label={`Ver sesión 1:1 con ${assistedPersonaName ?? id}`}
          >
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
