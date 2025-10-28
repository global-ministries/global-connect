"use client"

import React from 'react'
import Link from 'next/link'
import { TarjetaSistema, TituloSistema, TextoSistema, BotonSistema } from '@/components/ui/sistema-diseno'
import { LucideIcon, BellRing } from 'lucide-react'

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

export function PendingLeadersWidget({ id, title = 'Líderes Pendientes de Reporte', icon: HeaderIcon = BellRing, items }: PendingLeadersWidgetProps) {
  return (
    <TarjetaSistema className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg">
          <HeaderIcon className="w-5 h-5 text-white" />
        </div>
        <TituloSistema nivel={3}>{title}</TituloSistema>
      </div>
      {items.length === 0 ? (
        <div className="text-center py-8">
          <TextoSistema variante="sutil">Todos los líderes han reportado esta semana 🎉</TextoSistema>
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          {items.map((it) => (
            <div key={it.grupo_id} className="flex items-start justify-between gap-3 p-3 bg-gray-50/50 rounded-lg hover:bg-gray-50 transition-colors">
              <div className="min-w-0">
                <Link href={`/dashboard/grupos/${it.grupo_id}`} className="block text-sm font-semibold text-gray-900 truncate">
                  {it.grupo_nombre}
                </Link>
                <TextoSistema variante="sutil" tamaño="sm" className="truncate">
                  {it.lideres}
                </TextoSistema>
              </div>
              <div className="flex-shrink-0">
                <BotonSistema variante="outline" tamaño="sm">Contactar</BotonSistema>
              </div>
            </div>
          ))}
        </div>
      )}
    </TarjetaSistema>
  )
}
