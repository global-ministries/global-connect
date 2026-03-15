"use client"

import { MetricWidget } from '@/components/dashboard/widgets/MetricWidget'
import { ActivityWidget } from '@/components/dashboard/widgets/ActivityWidget'
import { BirthdayWidget } from '@/components/dashboard/widgets/BirthdayWidget'
import { RiskGroupsWidget } from '@/components/dashboard/widgets/RiskGroupsWidget'
import { PendingLeadersWidget } from '@/components/dashboard/widgets/PendingLeadersWidget'
import { NotasLideresWidget } from '@/components/dashboard/widgets/NotasLideresWidget'
import { Users, UsersRound, Activity } from 'lucide-react'

interface PropsDashboardDirector {
  data: any
}

export default function DashboardDirector({ data }: PropsDashboardDirector) {
  const aNumero = (v: any): number | null => {
    if (v == null) return null
    const num = Number(v)
    return Number.isFinite(num) ? num : null
  }
  const formatoNumero = (n: number | null | undefined): string => {
    const num = aNumero(n)
    return new Intl.NumberFormat('es-VE').format(num ?? 0)
  }

  const kpis = data?.kpis_alcance || {}
  const totalMiembros = aNumero(kpis?.total_miembros?.valor) ?? 0
  const asistenciaSemanal = aNumero(kpis?.asistencia_semanal?.valor)
  const gruposActivos = aNumero(kpis?.grupos_activos?.valor) ?? 0
  const nuevosMiembrosMes = aNumero(kpis?.nuevos_miembros_mes?.valor) ?? 0

  const actividadReciente = data?.actividad_reciente_alcance || []
  const cumpleanos = data?.proximos_cumpleanos_alcance || []
  const gruposRiesgo = data?.grupos_en_riesgo_alcance || []
  const lideresPendientes = data?.lideres_sin_reporte || []

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      <MetricWidget
        id="miembros"
        title="Miembros de mi etapa"
        value={formatoNumero(totalMiembros)}
        change=""
        isPositive={true}
        icon={Users}
        data={[{ name: 'N/A', value: 0 }]}
        varianteColor="naranja"
      />

      <MetricWidget
        id="asistencia-semanal"
        title="Asistencia Semanal (mi etapa)"
        value={asistenciaSemanal != null ? `${asistenciaSemanal}%` : '0%'}
        change=""
        isPositive={true}
        icon={Activity}
        data={[{ name: 'N/A', value: 0 }]}
        varianteColor="azul"
      />

      <MetricWidget
        id="grupos-activos"
        title="Grupos Activos (mi etapa)"
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

      <div className="col-span-2">
        <PendingLeadersWidget
          id="pendientes-reporte"
          title="Líderes Pendientes de Reporte de Asistencia"
          items={lideresPendientes}
        />
      </div>

      <div className="col-span-2">
        <NotasLideresWidget
          id="notas-lideres"
          title="Notas de Líderes (mi etapa)"
        />
      </div>

      <div className="col-span-2">
        <ActivityWidget
          id="actividad"
          title="Actividad Reciente (mi etapa)"
          icon={Activity}
          items={actividadReciente}
        />
      </div>

      <div className="col-span-2">
        <BirthdayWidget
          id="cumpleanos"
          title="Próximos Cumpleaños (mi etapa)"
          items={cumpleanos}
        />
      </div>

      <div className="col-span-2">
        <RiskGroupsWidget
          id="riesgo"
          title="Grupos que Necesitan Atención (mi etapa)"
          items={gruposRiesgo}
        />
      </div>
    </div>
  )
}
