"use client"

import { MetricWidget } from '@/components/dashboard/widgets/MetricWidget'
import { BirthdayWidget } from '@/components/dashboard/widgets/BirthdayWidget'
import { ActionRequiredWidget } from '@/components/dashboard/widgets/ActionRequiredWidget'
import { RecentAbsencesWidget } from '@/components/dashboard/widgets/RecentAbsencesWidget'
import { NewMembersWidget } from '@/components/dashboard/widgets/NewMembersWidget'
import { UsersRound, Activity } from 'lucide-react'

interface PropsDashboardLider {
  data: any
}

export default function DashboardLider({ data }: PropsDashboardLider) {
  const aNumero = (v: any): number | null => {
    if (v == null) return null
    const num = Number(v)
    return Number.isFinite(num) ? num : null
  }
  const formatoNumero = (n: number | null | undefined): string => {
    const num = aNumero(n)
    return new Intl.NumberFormat('es-VE').format(num ?? 0)
  }

  const accion = data?.accion_requerida || null
  const kpis = data?.kpis_grupo || {}
  const asistenciaUltima = aNumero(kpis?.asistencia_ultima_reunion) ?? null
  const totalMiembros = aNumero(kpis?.total_miembros) ?? 0

  const cumpleanos = data?.proximos_cumpleanos_grupo || []
  const ausentes = data?.miembros_ausentes_recientemente || []
  const nuevos = data?.nuevos_miembros_grupo || []

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <div className="md:col-span-2 xl:col-span-4">
        <ActionRequiredWidget accion={accion} />
      </div>

      <MetricWidget
        id="asistencia-ultima"
        title="Asistencia Última Reunión"
        value={asistenciaUltima != null ? `${asistenciaUltima}%` : '0%'}
        change=""
        isPositive={true}
        icon={Activity}
        data={[{ name: 'N/A', value: 0 }]}
        varianteColor="azul"
      />

      <MetricWidget
        id="total-miembros"
        title="Total de Miembros"
        value={formatoNumero(totalMiembros)}
        change=""
        isPositive={true}
        icon={UsersRound}
        data={[{ name: 'N/A', value: 0 }]}
        varianteColor="verde"
      />

      <div className="md:col-span-2">
        <BirthdayWidget id="cumpleanos" title="Próximos Cumpleaños" items={cumpleanos} />
      </div>

      <div className="md:col-span-2">
        <RecentAbsencesWidget id="ausencias" title="Seguimiento de Ausencias" items={ausentes} />
      </div>

      <div className="md:col-span-2 xl:col-span-2">
        <NewMembersWidget id="nuevos" title="Nuevos Miembros en tu Grupo" items={nuevos} />
      </div>
    </div>
  )
}
