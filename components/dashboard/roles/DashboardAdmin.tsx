"use client"

import { MetricWidget } from '@/components/dashboard/widgets/MetricWidget'
import { DonutWidget } from '@/components/dashboard/widgets/DonutWidget'
import { ActivityWidget } from '@/components/dashboard/widgets/ActivityWidget'
import { StatsWidget } from '@/components/dashboard/widgets/StatsWidget'
import KpisGruposPanel from '@/components/dashboard/widgets/KpisGruposPanel'
import { Users, UsersRound, Activity, TrendingUp, Calendar, MapPin } from 'lucide-react'

interface DistribucionSegmentosItem {
  id: string
  nombre: string
  grupos: number
}

interface EstadisticasBase {
  totalUsuarios: number | null
  totalGruposActivos: number | null
  totalUsuariosSinGrupo: number | null
  distribucionSegmentos: DistribucionSegmentosItem[] | null
  totalGruposDistribucion: number | null
}

interface PropsDashboardAdmin {
  stats: EstadisticasBase | null
}

export default function DashboardAdmin({ stats }: PropsDashboardAdmin) {
  const formatoNumero = (n: number | null): string => {
    if (n == null) return 'N/D'
    return new Intl.NumberFormat('es-VE').format(n)
  }

  const palette = ['#E96C20', '#F59E0B', '#10B981', '#6366F1', '#8B5CF6', '#0EA5E9', '#F43F5E']
  const segmentosData = (stats?.distribucionSegmentos || []).map((s, idx) => ({
    name: s.nombre,
    value: s.grupos,
    color: palette[idx % palette.length]
  }))

  const actividadesRecientes = [
    { id: '1', title: 'Nuevo miembro registrado', description: 'Alta de usuario', time: 'Hace 2 horas', type: 'success' as const },
    { id: '2', title: 'Reunión programada', description: 'Domingo 10:00 AM', time: 'Hace 4 horas', type: 'info' as const },
    { id: '3', title: 'Baja asistencia detectada', description: 'Alerta semanal', time: 'Hace 6 horas', type: 'warning' as const }
  ]

  const ubicacionesData = [
    { name: 'Norte', value: 8 },
    { name: 'Sur', value: 6 },
    { name: 'Centro', value: 5 },
    { name: 'Este', value: 3 },
    { name: 'Oeste', value: 2 }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <MetricWidget
        id="miembros"
        title="Total Miembros"
        value={formatoNumero(stats?.totalUsuarios ?? null)}
        change=""
        isPositive={true}
        icon={Users}
        data={[{ name: 'N/A', value: 0 }]}
      />

      <MetricWidget
        id="grupos"
        title="Grupos Activos"
        value={formatoNumero(stats?.totalGruposActivos ?? null)}
        change=""
        isPositive={true}
        icon={UsersRound}
        data={[{ name: 'N/A', value: 0 }]}
      />

      <MetricWidget
        id="miembros-sin-grupo"
        title="No están en Grupo"
        value={formatoNumero(stats?.totalUsuariosSinGrupo ?? null)}
        change=""
        isPositive={true}
        icon={Users}
        data={[{ name: 'N/A', value: 0 }]}
      />

      <MetricWidget
        id="asistencia-global"
        title="Asistencia Global"
        value={"N/D"}
        change={""}
        isPositive={true}
        icon={Activity}
        data={[{ name: 'N/A', value: 0 }]}
      />

      <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
        <KpisGruposPanel />
      </div>

      <DonutWidget
        id="segmentos"
        title="Distribución por Segmentos"
        icon={TrendingUp}
        data={segmentosData}
        compact
        orderBy="value"
        orderDirection="desc"
        centerText={{
          value: segmentosData.length === 0 ? '0' : formatoNumero(stats?.totalGruposDistribucion ?? 0),
          label: 'Grupos (Temp. Activas)'
        }}
      />

      <div className="md:col-span-2">
        <ActivityWidget
          id="actividad"
          title="Actividad Reciente"
          icon={Calendar}
          activities={actividadesRecientes}
        />
      </div>

      <div className="md:col-span-2">
        <StatsWidget
          id="ubicaciones"
          title="Grupos por Ubicación"
          icon={MapPin}
          data={ubicacionesData}
        />
      </div>
    </div>
  )
}
