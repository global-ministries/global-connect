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
  varianteColor?: 'naranja' | 'azul' | 'verde' | 'purpura'
  variacion?: number
}

export function MetricWidget({ 
  id, 
  title, 
  value, 
  change, 
  isPositive, 
  icon,
  data,
  varianteColor = 'naranja',
  variacion
}: MetricWidgetProps) {
  const Icono = icon
  const gradientes: Record<string, string> = {
    naranja: 'from-orange-500 to-orange-600',
    azul: 'from-blue-500 to-cyan-500',
    verde: 'from-green-500 to-emerald-500',
    purpura: 'from-purple-500 to-indigo-500',
  }
  const gradiente = gradientes[varianteColor] || gradientes.naranja
  const claseVariacion = variacion == null ? '' : variacion >= 0 ? 'text-green-600' : 'text-red-600'
  return (
    <TarjetaSistema className="p-6">
      <div className="flex items-center gap-4">
        <div className={`p-3 bg-gradient-to-br ${gradiente} rounded-xl flex-shrink-0`}>
          <Icono className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <TextoSistema variante="sutil" tamaño="sm">
            {title}
          </TextoSistema>
          <div className="flex items-baseline gap-2">
            <TituloSistema nivel={2} className="text-3xl font-bold text-gray-900">
              {value}
            </TituloSistema>
            {variacion != null && (
              <span className={`text-sm font-medium ${claseVariacion}`}>
                {variacion > 0 ? `+${variacion}%` : `${variacion}%`}
              </span>
            )}
          </div>
        </div>
      </div>
    </TarjetaSistema>
  )
}
