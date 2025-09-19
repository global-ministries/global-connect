"use client"

import React from 'react'
import { DashboardCard } from '../DashboardCard'
import { TituloSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { LucideIcon } from 'lucide-react'

interface ActivityItem {
  id: string
  title: string
  description: string
  time: string
  type: 'success' | 'warning' | 'info' | 'error'
}

interface ActivityWidgetProps {
  id: string
  title: string
  icon: LucideIcon
  activities: ActivityItem[]
}

export function ActivityWidget({ 
  id, 
  title, 
  icon,
  activities 
}: ActivityWidgetProps) {
  return (
    <DashboardCard
      id={id}
      title={title}
      icon={icon}
    >
      <div className="space-y-3 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <TextoSistema variante="sutil">No hay actividad reciente</TextoSistema>
          </div>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3 p-3 bg-gray-50/50 rounded-lg hover:bg-gray-50 transition-colors">
              <BadgeSistema variante={activity.type} tamaño="sm">
                •
              </BadgeSistema>
              <div className="flex-1 min-w-0">
                <TituloSistema nivel={4} className="text-sm font-medium text-gray-900 truncate">
                  {activity.title}
                </TituloSistema>
                <TextoSistema variante="sutil" tamaño="sm" className="truncate">
                  {activity.description}
                </TextoSistema>
                <TextoSistema variante="sutil" tamaño="sm" className="mt-1 text-xs">
                  {activity.time}
                </TextoSistema>
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardCard>
  )
}
