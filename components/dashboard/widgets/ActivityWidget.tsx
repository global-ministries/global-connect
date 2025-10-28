"use client"

import React from 'react'
import { TarjetaSistema, TituloSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { LucideIcon, UserPlus, Users, ClipboardList, CalendarCheck2 } from 'lucide-react'

type TipoActividad = 'NUEVO_MIEMBRO' | 'NUEVO_GRUPO' | 'USUARIO_A_GRUPO' | 'REPORTE_ASISTENCIA'

interface ActividadRecienteItem {
  tipo: TipoActividad
  texto: string
  fecha: string
}

interface ActivityWidgetProps {
  id: string
  title: string
  icon: LucideIcon
  items: ActividadRecienteItem[]
}

function getIcono(tipo: TipoActividad) {
  switch (tipo) {
    case 'NUEVO_MIEMBRO':
      return UserPlus
    case 'NUEVO_GRUPO':
      return Users
    case 'USUARIO_A_GRUPO':
      return ClipboardList
    case 'REPORTE_ASISTENCIA':
      return CalendarCheck2
    default:
      return Users
  }
}

function formatearFechaHora(fechaISO: string): string {
  try {
    const d = new Date(fechaISO)
    return d.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return fechaISO
  }
}

export function ActivityWidget({ id, title, icon: HeaderIcon, items }: ActivityWidgetProps) {
  return (
    <TarjetaSistema className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
          <HeaderIcon className="w-5 h-5 text-white" />
        </div>
        <TituloSistema nivel={3}>{title}</TituloSistema>
      </div>
      <div className="space-y-3 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        {items.length === 0 ? (
          <div className="text-center py-8">
            <TextoSistema variante="sutil">No hay actividad reciente</TextoSistema>
          </div>
        ) : (
          items.map((item, idx) => {
            const Icono = getIcono(item.tipo)
            return (
              <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50/50 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="p-2 bg-gray-100 rounded-md">
                  <Icono className="w-4 h-4 text-gray-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <TextoSistema tamaño="sm" className="text-gray-900">
                    {item.texto}
                  </TextoSistema>
                  <TextoSistema variante="sutil" tamaño="sm" className="mt-1 text-xs">
                    {formatearFechaHora(item.fecha)}
                  </TextoSistema>
                </div>
              </div>
            )
          })
        )}
      </div>
    </TarjetaSistema>
  )
}
