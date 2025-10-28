"use client"

import { MetricWidget } from '@/components/dashboard/widgets/MetricWidget'
import { DonutWidget } from '@/components/dashboard/widgets/DonutWidget'
import { ActivityWidget } from '@/components/dashboard/widgets/ActivityWidget'
import { BirthdayWidget } from '@/components/dashboard/widgets/BirthdayWidget'
import { RiskGroupsWidget } from '@/components/dashboard/widgets/RiskGroupsWidget'
import { Users, UsersRound, Activity, TrendingUp, Calendar } from 'lucide-react'

interface PropsDashboardAdmin {
  data: any
}

export default function DashboardAdmin({ data }: PropsDashboardAdmin) {
  const aNumero = (v: any): number | null => {
    if (v == null) return null
    const num = Number(v)
    return Number.isFinite(num) ? num : null
  }
  const formatoNumero = (n: number | null | undefined): string => {
    const num = aNumero(n)
    return new Intl.NumberFormat('es-VE').format(num ?? 0)
  }

  const kpis = data?.kpis_globales || {}
  const totalMiembros = aNumero(kpis?.total_miembros?.valor) ?? 0
  const variacionMiembros = aNumero(kpis?.total_miembros?.variacion) ?? undefined
  const asistenciaSemanal = aNumero(kpis?.asistencia_semanal?.valor)
  const gruposActivos = aNumero(kpis?.grupos_activos?.valor) ?? 0
  const nuevosMiembrosMes = aNumero(kpis?.nuevos_miembros_mes?.valor) ?? 0

  const actividadReciente = data?.actividad_reciente || []
  const cumpleanos = data?.proximos_cumpleanos || []
  const gruposRiesgo = data?.grupos_en_riesgo || []
  const tendencia = data?.tendencia_asistencia || []
  const distSeg = data?.distribucion_segmentos || []

  const palette = ['#E96C20', '#F59E0B', '#10B981', '#6366F1', '#8B5CF6', '#0EA5E9', '#F43F5E']
  const segmentosData = (Array.isArray(distSeg) ? distSeg : []).map((s: any, idx: number) => ({
    name: s.nombre,
    value: Number(s.total_miembros || 0),
    color: palette[idx % palette.length]
  }))
  const totalDistribucion = segmentosData.reduce((acc: number, it: any) => acc + (Number(it.value) || 0), 0)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <MetricWidget
        id="miembros"
        title="Total Miembros"
        value={formatoNumero(totalMiembros)}
        change=""
        isPositive={true}
        icon={Users}
        data={[{ name: 'N/A', value: 0 }]}
        varianteColor="naranja"
        variacion={variacionMiembros}
      />

      <MetricWidget
        id="asistencia-semanal"
        title="Asistencia Semanal"
        value={asistenciaSemanal != null ? `${asistenciaSemanal}%` : '0%'}
        change=""
        isPositive={true}
        icon={Activity}
        data={[{ name: 'N/A', value: 0 }]}
        varianteColor="azul"
      />

      <MetricWidget
        id="grupos-activos"
        title="Grupos Activos"
        value={formatoNumero(gruposActivos)}
        change=""
        isPositive={true}
        icon={UsersRound}
        data={[{ name: 'N/A', value: 0 }]}
        varianteColor="verde"
      />

      <MetricWidget
        id="nuevos-miembros"
        title="Nuevos Miembros (30 días)"
        value={formatoNumero(nuevosMiembrosMes)}
        change=""
        isPositive={true}
        icon={Users}
        data={[{ name: 'N/A', value: 0 }]}
        varianteColor="purpura"
      />

      <div className="md:col-span-2 lg:col-span-2 xl:col-span-2">
        <DonutWidget
          id="segmentos"
          title="Distribución por Segmentos"
          icon={TrendingUp}
          data={segmentosData}
          orderBy="value"
          orderDirection="desc"
          centerText={{
            value: formatoNumero(totalDistribucion),
            label: 'Miembros en grupos'
          }}
        />
      </div>

      <div className="md:col-span-2 xl:col-span-2">
        <ActivityWidget
          id="actividad"
          title="Actividad Reciente"
          icon={Calendar}
          items={actividadReciente}
        />
      </div>


      <div className="md:col-span-2 xl:col-span-2">
        <BirthdayWidget
          id="cumpleanos"
          title="Próximos Cumpleaños"
          items={cumpleanos}
        />
      </div>

      <div className="md:col-span-2">
        <RiskGroupsWidget
          id="riesgo"
          title="Grupos que Necesitan Atención"
          items={gruposRiesgo}
        />
      </div>
    </div>
  )
}
