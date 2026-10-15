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
import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import { CLASE_ITEM_LISTA } from './estilos'

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

function estadoBadgeVariant(estado: string): 'default' | 'success' | 'warning' | 'error' | 'info' {
  switch (estado) {
    case 'pending_confirmation': return 'warning'
    case 'active': return 'success'
    case 'en_pausa': return 'info'
    case 'disbanded': return 'error'
    default: return 'default'
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
    <div
      className={cn(CLASE_ITEM_LISTA, 'transition-colors hover:border-brand/40', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Badges */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <BadgeSistema variante={estadoBadgeVariant(estado)} tamaño="sm">
              {estadoLabel(estado)}
            </BadgeSistema>
            <BadgeSistema tamaño="sm">
              {contextoLabel(contexto)}
            </BadgeSistema>
          </div>

          {/* Created date */}
          <div className="mb-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">Creada {formattedDate}</span>
          </div>

          {/* Members count */}
          <div className="mt-1 flex items-center gap-1.5 text-sm">
            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-foreground">
              {miembrosCount} miembro{miembrosCount !== 3 ? 's' : ''} (3 requeridos)
            </span>
          </div>
        </div>

        {/* Arrow: a 44px target */}
        <Link
          href={href}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Ver tríada ${id}`}
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
