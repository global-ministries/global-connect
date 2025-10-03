"use client"

import { Users, UsersRound, Activity, UserCheck, Calendar, TrendingUp, MapPin } from 'lucide-react'
import { useSwapy } from '@/hooks/useSwapy'
import { TextoSistema } from '@/components/ui/sistema-diseno'
import { MetricWidget } from '@/components/dashboard/widgets/MetricWidget'
import { DonutWidget } from '@/components/dashboard/widgets/DonutWidget'
import { ActivityWidget } from '@/components/dashboard/widgets/ActivityWidget'
import { StatsWidget } from '@/components/dashboard/widgets/StatsWidget'
import { QuickActionsWidget } from '@/components/dashboard/widgets/QuickActionsWidget'

interface DashboardClientProps {
  stats: {
    totalUsuarios: number | null
    totalGruposActivos: number | null
    totalUsuariosSinGrupo: number | null
    distribucionSegmentos: { id: string; nombre: string; grupos: number }[] | null
    totalGruposDistribucion: number | null
  }
}

export default function DashboardClient({ stats }: DashboardClientProps) {
  const { containerRef, isMobile } = useSwapy({
    onSwap: (event) => {
      console.log('Tarjetas intercambiadas:', event)
    }
  })

  const formatNumber = (n: number | null): string => {
    if (n == null) return 'N/D'
    return new Intl.NumberFormat('es-VE').format(n)
  }

  // Datos mock (mantener mientras no se implementan reales)
  const metricsData = {
    miembros: [
      { name: 'Ene', value: 0 },
      { name: 'Feb', value: 0 },
      { name: 'Mar', value: 0 },
      { name: 'Abr', value: 0 }
    ],
    grupos: [
      { name: 'Ene', value: 20 },
      { name: 'Feb', value: 22 },
      { name: 'Mar', value: 23 },
      { name: 'Abr', value: 24 }
    ],
    asistencia: [
      { name: 'Ene', value: 92 },
      { name: 'Feb', value: 89 },
      { name: 'Mar', value: 91 },
      { name: 'Abr', value: 89 }
    ],
    lideres: [
      { name: 'Ene', value: 135 },
      { name: 'Feb', value: 142 },
      { name: 'Mar', value: 148 },
      { name: 'Abr', value: 156 }
    ]
  }

  // Mapear distribución real a formato DonutWidget (asignar color determinístico simple)
  const palette = ['#E96C20', '#F59E0B', '#10B981', '#6366F1', '#8B5CF6', '#0EA5E9', '#F43F5E']
  const segmentosData = (stats.distribucionSegmentos || []).map((s, idx) => ({
    name: s.nombre,
    value: s.grupos,
    color: palette[idx % palette.length]
  }))

  const actividadesRecientes = [
    { id: '1', title: 'Nuevo miembro registrado', description: 'Juan Carlos se unió al grupo Jóvenes Norte', time: 'Hace 2 horas', type: 'success' as const },
    { id: '2', title: 'Reunión programada', description: 'Grupo Adultos Centro - Domingo 10:00 AM', time: 'Hace 4 horas', type: 'info' as const },
    { id: '3', title: 'Baja asistencia detectada', description: 'Grupo Jóvenes Sur - Solo 60% de asistencia', time: 'Hace 6 horas', type: 'warning' as const }
  ]

  const ubicacionesData = [
    { name: 'Norte', value: 8 },
    { name: 'Sur', value: 6 },
    { name: 'Centro', value: 5 },
    { name: 'Este', value: 3 },
    { name: 'Oeste', value: 2 }
  ]

  return (
    <>
      {isMobile && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <TextoSistema tamaño="sm" className="text-orange-700">
            💡 En móvil puedes hacer scroll normalmente. El reordenamiento está disponible en desktop.
          </TextoSistema>
        </div>
      )}
      <div
        ref={containerRef}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
      >
        <MetricWidget
          id="miembros"
          title="Total Miembros"
          value={formatNumber(stats.totalUsuarios)}
          change=""
          isPositive={true}
          icon={Users}
          data={metricsData.miembros}
        />

        <MetricWidget
          id="grupos"
          title="Grupos Activos"
          value={formatNumber(stats.totalGruposActivos)}
          change=""
          isPositive={true}
          icon={UsersRound}
          data={metricsData.grupos}
        />

        <MetricWidget
          id="miembros-sin-grupo"
          title="No están en Grupo"
          value={formatNumber(stats.totalUsuariosSinGrupo)}
          change=""
          isPositive={true}
          icon={Users}
          data={metricsData.miembros}
        />

        <MetricWidget
          id="asistencia"
          title="Asistencia Global"
          value="89.2%"
          change="-2.1%"
          isPositive={false}
          icon={Activity}
          data={metricsData.asistencia}
        />

        <MetricWidget
          id="lideres"
          title="Líderes Activos"
          value="156"
          change="+15.7%"
          isPositive={true}
          icon={UserCheck}
          data={metricsData.lideres}
        />

        <DonutWidget
          id="segmentos"
          title="Distribución por Segmentos"
          icon={TrendingUp}
          data={segmentosData}
          compact
          orderBy="value"
          orderDirection="desc"
          centerText={{
            value: segmentosData.length === 0 ? '0' : formatNumber(stats.totalGruposDistribucion),
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

        <QuickActionsWidget
          id="acciones"
          title="Acciones Rápidas"
          icon={Activity}
        />
      </div>
    </>
  )
}
