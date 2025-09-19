"use client"

import React from 'react'
import { DashboardCard } from '../DashboardCard'
import { BarChart } from '../charts/BarChart'
import { LucideIcon } from 'lucide-react'

interface StatsWidgetProps {
  id: string
  title: string
  icon: LucideIcon
  data: Array<{
    name: string
    value: number
  }>
}

export function StatsWidget({ 
  id, 
  title, 
  icon,
  data 
}: StatsWidgetProps) {
  return (
    <DashboardCard
      id={id}
      title={title}
      icon={icon}
    >
      <BarChart data={data} />
    </DashboardCard>
  )
}
