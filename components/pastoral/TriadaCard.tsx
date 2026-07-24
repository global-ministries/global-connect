"use client"

/**
 * W13 — TriadaCard component.
 *
 * Reusable card for displaying a pastoral triada.
 * Used in: lider triada list, pastor triada view.
 *
 * Mobile-first: full-width on mobile.
 */

import React from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Users, ChevronRight, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface TriadaCardProps {
  readonly id: string
  readonly estado: string
  readonly contexto: string
  readonly createdAtIso: string
  readonly miembrosCount: number
  readonly ultimoEventoAtIso?: string | null
  readonly href: string
  readonly className?: string
}

// ─── State badge ─────────────────────────────────────────────────────────────

function estadoBadgeVariant(estado: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (estado) {
    case 'pending_confirmation': return 'outline'
    case 'active': return 'default'
    case 'en_pausa': return 'secondary'
    case 'disbanded': return 'destructive'
    default: return 'outline'
  }
}

function estadoLabel(estado: string): string {
  switch (estado) {
    case 'pending_confirmation': return 'Pendiente confirmar'
    case 'active': return 'Activa'
    case 'en_pausa': return 'En pausa'
    case 'disbanded': return 'Disuelta'
    default: return estado
  }
}

function contextoLabel(contexto: string): string {
  switch (contexto) {
    case 'nuevo_paso': return 'Nuevo paso'
    case 'simultaneidad': return 'Simultaneidad'
    case 'inicial': return 'Inicial'
    case 'reformada': return 'Reformada'
    default: return contexto
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TriadaCard({
  id,
  estado,
  contexto,
  createdAtIso,
  miembrosCount,
  ultimoEventoAtIso,
  href,
  className,
}: TriadaCardProps) {
  const formattedDate = format(new Date(createdAtIso), "d 'de' MMM 'de' yyyy", { locale: es })

  return (
    <Card
      className={`hover:border-[var(--brand-primary)]/40 transition-colors ${className ?? ''}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Badge variant={estadoBadgeVariant(estado)}>
                {estadoLabel(estado)}
              </Badge>
              <Badge variant="secondary">
                {contextoLabel(contexto)}
              </Badge>
            </div>

            {/* Created date */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Creada {formattedDate}</span>
            </div>

            {/* Members count */}
            <div className="flex items-center gap-1.5 text-sm mt-1">
              <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-foreground">
                {miembrosCount} miembro{miembrosCount !== 3 ? 's' : ''} (3 requeridos)
              </span>
            </div>
          </div>

          {/* Arrow */}
          <Link
            href={href}
            className="shrink-0 p-2 rounded-lg hover:bg-accent transition-colors"
            aria-label={`Ver tríada ${id}`}
          >
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
