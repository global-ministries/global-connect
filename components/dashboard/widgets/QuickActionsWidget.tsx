"use client"

import React from 'react'
import { DashboardCard } from '../DashboardCard'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { LucideIcon, Plus, Users, Calendar, Settings } from 'lucide-react'

interface QuickAction {
  id: string
  label: string
  icon: LucideIcon
  onClick: () => void
  variant?: 'primario' | 'secundario' | 'outline'
}

interface QuickActionsWidgetProps {
  id: string
  title: string
  icon: LucideIcon
  actions?: QuickAction[]
}

const defaultActions: QuickAction[] = [
  {
    id: 'add-member',
    label: 'Agregar Miembro',
    icon: Plus,
    onClick: () => console.log('Agregar miembro'),
    variant: 'primario'
  },
  {
    id: 'manage-groups',
    label: 'Gestionar Grupos',
    icon: Users,
    onClick: () => console.log('Gestionar grupos'),
    variant: 'secundario'
  },
  {
    id: 'schedule-event',
    label: 'Programar Evento',
    icon: Calendar,
    onClick: () => console.log('Programar evento'),
    variant: 'outline'
  },
  {
    id: 'settings',
    label: 'Configuración',
    icon: Settings,
    onClick: () => console.log('Configuración'),
    variant: 'outline'
  }
]

export function QuickActionsWidget({ 
  id, 
  title, 
  icon,
  actions = defaultActions 
}: QuickActionsWidgetProps) {
  return (
    <DashboardCard
      id={id}
      title={title}
      icon={icon}
    >
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => {
          const ActionIcon = action.icon
          return (
            <BotonSistema
              key={action.id}
              variante={action.variant || 'outline'}
              tamaño="sm"
              onClick={action.onClick}
              className="flex flex-col items-center gap-2 h-20 text-xs"
            >
              <ActionIcon className="w-5 h-5" />
              <span className="text-center leading-tight">{action.label}</span>
            </BotonSistema>
          )
        })}
      </div>
    </DashboardCard>
  )
}
