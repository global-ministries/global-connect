"use client"

import { Users, UsersRound, Activity, UserCheck, Calendar, TrendingUp, MapPin } from "lucide-react"
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { useSwapy } from '@/hooks/useSwapy'
import { MetricWidget } from '@/components/dashboard/widgets/MetricWidget'
import { DonutWidget } from '@/components/dashboard/widgets/DonutWidget'
import { ActivityWidget } from '@/components/dashboard/widgets/ActivityWidget'
import { StatsWidget } from '@/components/dashboard/widgets/StatsWidget'
import { QuickActionsWidget } from '@/components/dashboard/widgets/QuickActionsWidget'

export default function PaginaTablero() {
  const { containerRef } = useSwapy({
    onSwap: (event) => {
      console.log('Tarjetas intercambiadas:', event)
      // Aquí podrías guardar el nuevo orden en localStorage o base de datos
    }
  })

  // Datos de métricas con gráficos
  const metricsData = {
    miembros: [
      { name: 'Ene', value: 2400 },
      { name: 'Feb', value: 2600 },
      { name: 'Mar', value: 2750 },
      { name: 'Abr', value: 2847 }
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

  // Datos para gráfico de dona - distribución por segmentos
  const segmentosData = [
    { name: 'Niños', value: 45, color: '#E96C20' },
    { name: 'Jóvenes', value: 32, color: '#F59E0B' },
    { name: 'Adultos', value: 28, color: '#10B981' },
    { name: 'Adultos Mayores', value: 15, color: '#6366F1' }
  ]

  // Datos de actividad reciente
  const actividadesRecientes = [
    {
      id: '1',
      title: 'Nuevo miembro registrado',
      description: 'Juan Carlos se unió al grupo Jóvenes Norte',
      time: 'Hace 2 horas',
      type: 'success' as const
    },
    {
      id: '2', 
      title: 'Reunión programada',
      description: 'Grupo Adultos Centro - Domingo 10:00 AM',
      time: 'Hace 4 horas',
      type: 'info' as const
    },
    {
      id: '3',
      title: 'Baja asistencia detectada',
      description: 'Grupo Jóvenes Sur - Solo 60% de asistencia',
      time: 'Hace 6 horas',
      type: 'warning' as const
    }
  ]

  // Datos para estadísticas por ubicación
  const ubicacionesData = [
    { name: 'Norte', value: 8 },
    { name: 'Sur', value: 6 },
    { name: 'Centro', value: 5 },
    { name: 'Este', value: 3 },
    { name: 'Oeste', value: 2 }
  ]

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Dashboard"
        subtitulo="Resumen interactivo de tu comunidad"
      >
        {/* Grid de tarjetas reordenables */}
        <div 
          ref={containerRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        >
          {/* Métricas principales */}
          <MetricWidget
            id="miembros"
            title="Total Miembros"
            value="2,847"
            change="+12.5%"
            isPositive={true}
            icon={Users}
            data={metricsData.miembros}
          />

          <MetricWidget
            id="grupos"
            title="Grupos Activos"
            value="24"
            change="+8.3%"
            isPositive={true}
            icon={UsersRound}
            data={metricsData.grupos}
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

          {/* Gráfico de distribución por segmentos */}
          <div className="md:col-span-2">
            <DonutWidget
              id="segmentos"
              title="Distribución por Segmentos"
              icon={TrendingUp}
              data={segmentosData}
              centerText={{
                value: "120",
                label: "Grupos Totales"
              }}
            />
          </div>

          {/* Actividad reciente */}
          <div className="md:col-span-2">
            <ActivityWidget
              id="actividad"
              title="Actividad Reciente"
              icon={Calendar}
              activities={actividadesRecientes}
            />
          </div>

          {/* Estadísticas por ubicación */}
          <div className="md:col-span-2">
            <StatsWidget
              id="ubicaciones"
              title="Grupos por Ubicación"
              icon={MapPin}
              data={ubicacionesData}
            />
          </div>

          {/* Acciones rápidas */}
          <QuickActionsWidget
            id="acciones"
            title="Acciones Rápidas"
            icon={Activity}
          />
        </div>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}