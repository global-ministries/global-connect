"use client"

import React from 'react'
import { TarjetaSistema, TituloSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { LucideIcon } from 'lucide-react'

interface MetricWidgetProps {
  id: string
  title: string
  value: string
  change: string
  isPositive: boolean
  icon: LucideIcon
  data: Array<{
    name: string
    value: number
  }>
}

export function MetricWidget({ 
  id, 
  title, 
  value, 
  change, 
  isPositive, 
  icon,
  data 
}: MetricWidgetProps) {
  const Icono = icon
  return (
    <TarjetaSistema className="p-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex-shrink-0">
          <Icono className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <TextoSistema variante="sutil" tamaño="sm">
            {title}
          </TextoSistema>
          <TituloSistema nivel={2} className="text-3xl font-bold text-gray-900">
            {value}
          </TituloSistema>
        </div>
      </div>
    </TarjetaSistema>
  )
}
