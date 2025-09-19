"use client"

import React from 'react'
import { DashboardCard } from '../DashboardCard'
import { MetricChart } from '../charts/MetricChart'
import { TituloSistema, TextoSistema } from '@/components/ui/sistema-diseno'
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
  return (
    <DashboardCard
      id={id}
      title={title}
      icon={icon}
      badge={{
        text: change,
        variant: isPositive ? 'success' : 'error'
      }}
    >
      <div className="space-y-4">
        <div>
          <TituloSistema nivel={2} className="text-3xl font-bold text-gray-900">
            {value}
          </TituloSistema>
          <TextoSistema variante="sutil" tamaño="sm">
            {title}
          </TextoSistema>
        </div>
        <MetricChart data={data} />
      </div>
    </DashboardCard>
  )
}
