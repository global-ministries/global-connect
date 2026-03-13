"use client"

import React, { useState } from 'react'
import Link from 'next/link'
import { TarjetaSistema, TituloSistema, TextoSistema, BotonSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { LucideIcon, BellRing, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react'

interface PendingLeaderItem {
  grupo_id: string
  grupo_nombre: string
  lideres: string
}

interface PendingLeadersWidgetProps {
  id: string
  title?: string
  icon?: LucideIcon
  items: PendingLeaderItem[]
}

const ITEMS_COLLAPSED = 4

export function PendingLeadersWidget({ id, title = 'Líderes Pendientes de Reporte de Asistencia', icon: HeaderIcon = BellRing, items }: PendingLeadersWidgetProps) {
  const [expanded, setExpanded] = useState(false)
  const toast = useNotificaciones()

  const visibleItems = expanded ? items : items.slice(0, ITEMS_COLLAPSED)
  const hasMore = items.length > ITEMS_COLLAPSED

  return (
    <TarjetaSistema className="p-3 md:p-4 lg:p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg ring-1 ring-white/20 shadow-lg shrink-0">
            <HeaderIcon className="w-5 h-5 text-white" />
          </div>
          <TituloSistema nivel={3} className="text-sm sm:text-base leading-tight">{title}</TituloSistema>
        </div>
        {items.length > 0 && (
          <BadgeSistema variante="warning" tamaño="sm">{items.length}</BadgeSistema>
        )}
      </div>

      {/* Content */}
      {items.length === 0 ? (
        <div className="text-center py-8 flex-1 flex items-center justify-center">
          <TextoSistema variante="sutil">Todos los líderes han reportado esta semana 🎉</TextoSistema>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-2">
          {/* List */}
          <div className="space-y-2">
            {visibleItems.map((it) => (
              <div
                key={it.grupo_id}
                className="flex items-center gap-3 p-2.5 sm:p-3 bg-muted/50 rounded-xl hover:bg-muted transition-colors"
              >
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/grupos-vida/${it.grupo_id}`}
                    className="block text-sm font-semibold text-foreground truncate hover:text-orange-600 transition-colors"
                  >
                    {it.grupo_nombre}
                  </Link>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {it.lideres}
                  </p>
                </div>

                {/* Action */}
                <BotonSistema variante="outline" tamaño="sm" className="shrink-0 gap-1.5" onClick={() => toast.info('Próximamente: función de contacto directo')}>
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Contactar</span>
                </BotonSistema>
              </div>
            ))}
          </div>

          {/* Show more / less */}
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-2 mt-1"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Ver menos
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Ver {items.length - ITEMS_COLLAPSED} más
                </>
              )}
            </button>
          )}
        </div>
      )}
    </TarjetaSistema>
  )
}
