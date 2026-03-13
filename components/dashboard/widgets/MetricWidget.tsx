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
  const claseVariacion = variacion == null ? '' : variacion >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
  return (
    <TarjetaSistema className="p-3 md:p-4 lg:p-6 h-full">
      <div className="flex items-start gap-3 lg:gap-4">
        <div className={`p-2 lg:p-3 bg-gradient-to-br ${gradiente} rounded-lg lg:rounded-xl flex-shrink-0 ring-1 ring-white/20 shadow-lg`}>
          <Icono className="w-4 h-4 lg:w-6 lg:h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <TextoSistema variante="sutil" tamaño="sm" className="text-[11px] md:text-xs lg:text-sm leading-tight">
            {title}
          </TextoSistema>
          <div className="flex items-baseline gap-1 lg:gap-2">
            <TituloSistema nivel={2} className="text-lg md:text-xl lg:text-3xl font-bold text-foreground tabular-nums">
              {value}
            </TituloSistema>
            {variacion != null && (
              <span className={`text-[10px] lg:text-sm font-medium ${claseVariacion}`}>
                {variacion > 0 ? `+${variacion}%` : `${variacion}%`}
              </span>
            )}
          </div>
        </div>
      </div>
    </TarjetaSistema>
  )
}
