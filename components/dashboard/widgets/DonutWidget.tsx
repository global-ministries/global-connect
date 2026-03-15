"use client"

import React from 'react'
import { TarjetaSistema, TituloSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { LucideIcon } from 'lucide-react'

interface DonutWidgetProps {
  id: string
  title: string
  icon: LucideIcon
  data: Array<{
    name: string
    value: number
    color: string
  }>
  centerText?: {
    value: string
    label: string
  }
  compact?: boolean
  orderBy?: 'name' | 'value'
  orderDirection?: 'asc' | 'desc'
}

export function DonutWidget({
  id,
  title,
  icon,
  data,
  centerText,
  compact = false,
  orderBy = 'value',
  orderDirection = 'desc'
}: DonutWidgetProps) {
  const sortedData = React.useMemo(() => {
    const copia = [...data]
    copia.sort((a, b) => {
      if (orderBy === 'value') {
        return orderDirection === 'asc' ? a.value - b.value : b.value - a.value
      }
      return orderDirection === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    })
    return copia
  }, [data, orderBy, orderDirection])
  const HeaderIcon = icon
  const total = sortedData.reduce((acc, it) => acc + (Number(it.value) || 0), 0)
  return (
    <TarjetaSistema className="p-3 md:p-4 lg:p-6 h-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg ring-1 ring-white/20 shadow-lg">
          <HeaderIcon className="w-5 h-5 text-white" />
        </div>
        <TituloSistema nivel={3}>{title}</TituloSistema>
      </div>
      <div className="space-y-3">
        {sortedData.length === 0 ? (
          <TextoSistema variante="sutil">Sin datos</TextoSistema>
        ) : (
          sortedData.map((item, idx) => {
            const v = Number(item.value) || 0
            const pct = total === 0 ? 0 : Math.round((v / total) * 1000) / 10
            return (
              <div key={idx} className="w-full">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-3 h-3 rounded-full ring-2 ring-card shadow" style={{ backgroundColor: item.color }} />
                    <span className="text-foreground break-words whitespace-normal" title={item.name}>{item.name}</span>
                  </div>
                  <span className="font-semibold text-foreground tabular-nums ml-2 whitespace-nowrap">{v} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                </div>
                <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-[width] duration-500 ease-expo" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                </div>
              </div>
            )
          })
        )}
      </div>
    </TarjetaSistema>
  )
}
