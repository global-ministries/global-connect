"use client"

import Link from 'next/link'
import { TarjetaSistema, TituloSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { UserAvatar } from '@/components/ui/UserAvatar'

interface AusenteItem {
  id: string
  nombre_completo: string
  foto_url?: string | null
  ultima_ausencia: string
}

interface RecentAbsencesWidgetProps {
  id: string
  title?: string
  items: AusenteItem[]
}

function formatearFecha(fechaISO: string): string {
  try {
    const d = new Date(fechaISO)
    return d.toLocaleDateString('es-VE', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return fechaISO
  }
}

export function RecentAbsencesWidget({ id, title = 'Seguimiento de Ausencias', items }: RecentAbsencesWidgetProps) {
  return (
    <TarjetaSistema className="p-6">
      <TituloSistema nivel={3} className="mb-4">{title}</TituloSistema>
      {items.length === 0 ? (
        <TextoSistema variante="sutil">No hay ausencias en las últimas 2 reuniones</TextoSistema>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {items.map((p) => {
            const [nombre, ...resto] = p.nombre_completo.split(' ')
            const apellido = resto.join(' ')
            return (
              <Link key={p.id} href={`/dashboard/users/${p.id}/asistencia`} className="block">
                <div className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar photoUrl={p.foto_url || undefined} nombre={nombre} apellido={apellido} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{p.nombre_completo}</div>
                      <TextoSistema variante="sutil" tamaño="sm">Última ausencia: {formatearFecha(p.ultima_ausencia)}</TextoSistema>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </TarjetaSistema>
  )
}
