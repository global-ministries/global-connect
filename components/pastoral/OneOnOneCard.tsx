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
import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import { CLASE_ITEM_LISTA } from './estilos'

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

type VarianteEstado = 'default' | 'success' | 'warning' | 'error' | 'info'

/** Status color of a 1:1 session (shared with the detail page). */
export function varianteEstadoUnoAUno(estado: string): VarianteEstado {
  switch (estado) {
    case 'scheduled': return 'info'
    case 'in_progress': return 'warning'
    case 'completed': return 'success'
    case 'cancelled': return 'error'
    default: return 'default'
  }
}

/** Spanish label of a 1:1 session state (shared with the detail page). */
export function etiquetaEstadoUnoAUno(estado: string): string {
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
    <div
      className={cn(CLASE_ITEM_LISTA, 'transition-colors hover:border-[var(--brand-primary)]/40', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Header: date + badge */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <BadgeSistema variante={varianteEstadoUnoAUno(estado)} tamaño="sm">
              {etiquetaEstadoUnoAUno(estado)}
            </BadgeSistema>
            {pasosValidadosCount > 0 && (
              <BadgeSistema tamaño="sm">
                {pasosValidadosCount} paso{pasosValidadosCount !== 1 ? 's' : ''}
              </BadgeSistema>
            )}
          </div>

          {/* Date + time */}
          <div className="mb-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{formattedDate}</span>
            {formattedTime && (
              <>
                <Clock className="ml-2 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{formattedTime}</span>
              </>
            )}
          </div>

          {/* Names */}
          {assistedPersonaName && (
            <div className="mt-1 flex items-center gap-1.5 text-sm">
              <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate font-medium text-foreground">
                {assistedPersonaName}
              </span>
            </div>
          )}
          {showMentor && mentorPersonaName && (
            <div className="mt-1 flex items-center gap-1.5 text-sm">
              <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate text-muted-foreground">
                Mentor: {mentorPersonaName}
              </span>
            </div>
          )}
        </div>

        {/* Arrow: a 44px target */}
        <Link
          href={href}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Ver sesión 1:1 con ${assistedPersonaName ?? id}`}
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
