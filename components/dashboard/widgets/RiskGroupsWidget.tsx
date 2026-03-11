"use client"

import React from 'react'
import Link from 'next/link'
import { TarjetaSistema, TituloSistema, TextoSistema } from '@/components/ui/sistema-diseno'

interface GrupoRiesgoItem {
  id: string
  nombre: string
  porcentaje_asistencia?: number | null
  lideres?: string | null
}

interface RiskGroupsWidgetProps {
  id: string
  title: string
  items: GrupoRiesgoItem[]
}

export function RiskGroupsWidget({ id, title, items }: RiskGroupsWidgetProps) {
  return (
    <TarjetaSistema className="p-3 md:p-4 lg:p-6 h-full">
      <TituloSistema nivel={3} className="mb-4">{title}</TituloSistema>
      {items.length === 0 ? (
        <TextoSistema variante="sutil">No hay grupos en riesgo</TextoSistema>
      ) : (
        <div className="space-y-3">
          {items.map((g) => (
            <Link key={g.id} href={`/dashboard/grupos/${g.id}`} className="block">
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-[var(--surface-secondary)] transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{g.nombre}</div>
                  {g.lideres && (
                    <TextoSistema variante="sutil" tamaño="sm" className="truncate">{g.lideres}</TextoSistema>
                  )}
                </div>
                <div className="text-sm font-semibold text-red-600 dark:text-red-400 whitespace-nowrap tabular-nums">
                  {g.porcentaje_asistencia != null ? `${g.porcentaje_asistencia}%` : '—'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </TarjetaSistema>
  )
}
