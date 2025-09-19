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
}

export function DonutWidget({ 
  id, 
  title, 
  icon,
  data,
  centerText 
}: DonutWidgetProps) {
  return (
    <DashboardCard
      id={id}
      title={title}
      icon={icon}
    >
      <DonutChart data={data} centerText={centerText} />
    </DashboardCard>
  )
}
