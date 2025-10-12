"use client"

import React from 'react'
import { DashboardCard } from '../DashboardCard'
import { DonutChart } from '../charts/DonutChart'
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
      // name
      return orderDirection === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    })
    return copia
  }, [data, orderBy, orderDirection])
  return (
    <DashboardCard
      id={id}
      title={title}
      icon={icon}
      oneLineTitle
    >
      <div className={compact ? 'h-56 overflow-hidden' : ''}>
        <DonutChart data={sortedData} centerText={centerText} />
      </div>
    </DashboardCard>
  )
}
