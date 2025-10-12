"use client"

import React from 'react'
import { TarjetaSistema, TituloSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { LucideIcon } from 'lucide-react'

interface DashboardCardProps {
  id: string
  title: string
  children: React.ReactNode
  className?: string
  icon?: LucideIcon
  badge?: {
    text: string
    variant: 'default' | 'success' | 'warning' | 'error' | 'info'
  }
  oneLineTitle?: boolean
}

export function DashboardCard({ 
  id, 
  title, 
  children, 
  className = "", 
  icon: Icon,
  badge,
  oneLineTitle = false
}: DashboardCardProps) {
  return (
    <div data-swapy-slot={id}>
      <div data-swapy-item={id}>
        <TarjetaSistema className={`p-6 h-full md:cursor-grab md:active:cursor-grabbing hover:shadow-lg transition-all duration-200 ${className}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {Icon && (
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-white" />
                </div>
              )}
              <TituloSistema
                nivel={3}
                className={oneLineTitle ? 'text-gray-900 leading-snug max-w-full truncate' : 'text-gray-900 leading-snug max-w-[11rem] whitespace-normal line-clamp-2'}
              >
                {title}
              </TituloSistema>
            </div>
            {badge && (
              <BadgeSistema variante={badge.variant} tamaño="sm" className="flex-shrink-0">
                {badge.text}
              </BadgeSistema>
            )}
          </div>
          <div className="flex-1 min-h-0">
            {children}
          </div>
        </TarjetaSistema>
      </div>
    </div>
  )
}
