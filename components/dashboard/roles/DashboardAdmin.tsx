"use client"

import { useEffect, useState, useCallback, useRef } from 'react'
import { MetricWidget } from '@/components/dashboard/widgets/MetricWidget'
import { DonutWidget } from '@/components/dashboard/widgets/DonutWidget'
import { ActivityWidget } from '@/components/dashboard/widgets/ActivityWidget'
import { BirthdayWidget } from '@/components/dashboard/widgets/BirthdayWidget'
import { RiskGroupsWidget } from '@/components/dashboard/widgets/RiskGroupsWidget'
import { NotasLideresWidget } from '@/components/dashboard/widgets/NotasLideresWidget'
import { Users, UsersRound, Activity, TrendingUp, Calendar } from 'lucide-react'
import { useCampus } from '@/hooks/useCampus'
import { createClient } from '@/lib/supabase/client'
import { HostHomeQueuesWidget } from '@/components/dashboard/widgets/HostHomeQueuesWidget'
import { canReviewHostHomes } from '@/lib/casas-anfitrionas/review-roles'

interface PropsDashboardAdmin {
  data: any
  rol?: string
  /** Campus the server scoped the KPIs to (null when they are global). */
  campusInicialId?: string | null
}

export default function DashboardAdmin({ data: initialData, rol, campusInicialId = null }: PropsDashboardAdmin) {
  const { campusId, loading: loadingCampus } = useCampus()
  const [data, setData] = useState(initialData)
  const [refrescando, setRefrescando] = useState(false)

  const aNumero = (v: any): number | null => {
    if (v == null) return null
    const num = Number(v)
    return Number.isFinite(num) ? num : null
  }
  const formatoNumero = (n: number | null | undefined): string => {
    const num = aNumero(n)
    return new Intl.NumberFormat('es-VE').format(num ?? 0)
  }

  // Re-fetch when campus changes (skip for DG — their data is already scoped by the server RPC)
  const esDG = rol === 'director-general'
  // Campus the shown KPIs belong to; it starts as the campus the server scoped them to.
  const campusDeLosDatos = useRef<string | null>(campusInicialId)
  const refrescarDatos = useCallback(async () => {
    setRefrescando(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // total_grupos counts every group, so active groups are counted with the same rule
      // as obtener_datos_dashboard (activo and not eliminado), scoped like the summary.
      let consultaGruposActivos = supabase
        .from('grupos')
        .select('id', { count: 'exact', head: true })
        .eq('activo', true)
        .eq('eliminado', false)
      if (campusId) consultaGruposActivos = consultaGruposActivos.eq('campus_id', campusId)

      const [{ data: resumen }, { count: gruposActivos, error: errorGrupos }] = await Promise.all([
        supabase.rpc('resumen_dashboard_admin', campusId ? { p_campus_id: campusId } : {}),
        consultaGruposActivos,
      ])
      if (errorGrupos) console.error('Error contando grupos activos:', errorGrupos)
      // A slower response for a campus the user already left must not overwrite newer numbers.
      if (campusDeLosDatos.current !== campusId) return

      // total_usuarios is every registered person (in the campus), like the server total.
      const r = resumen as any
      setData((prev: any) => ({
        ...prev,
        kpis_globales: {
          ...prev?.kpis_globales,
          ...(r?.total_usuarios != null ? { total_miembros: { valor: r.total_usuarios } } : {}),
          ...(!errorGrupos && gruposActivos != null ? { grupos_activos: { valor: gruposActivos } } : {}),
        },
      }))
    } catch (err) {
      console.error('Error refrescando dashboard:', err)
    } finally {
      setRefrescando(false)
    }
  }, [campusId])

  useEffect(() => {
    // Only re-fetch when the campus differs from the one the KPIs belong to: this skips the
    // initial load when the server already used the selected campus (or none), and still
    // covers a campus selected on mount that the server did not know about.
    if (loadingCampus || esDG || campusId === campusDeLosDatos.current) return
    campusDeLosDatos.current = campusId
    refrescarDatos()
  }, [refrescarDatos, campusId, loadingCampus, esDG])

  const kpis = data?.kpis_globales || {}
  const totalMiembros = aNumero(kpis?.total_miembros?.valor) ?? 0
  const variacionMiembros = aNumero(kpis?.total_miembros?.variacion) ?? undefined
  const asistenciaSemanal = aNumero(kpis?.asistencia_semanal?.valor)
  const gruposActivos = aNumero(kpis?.grupos_activos?.valor) ?? 0
  const nuevosMiembrosMes = aNumero(kpis?.nuevos_miembros_mes?.valor) ?? 0

  const actividadReciente = data?.actividad_reciente || []
  const cumpleanos = data?.proximos_cumpleanos || []
  const gruposRiesgo = data?.grupos_en_riesgo || []
  const hostHomeQueues = data?.casas_anfitrionas_queues
  const canReviewHostHomeQueue = canReviewHostHomes(rol)
    const distSeg = data?.distribucion_segmentos || []

  const palette = ['#E96C20', '#F59E0B', '#10B981', '#6366F1', '#8B5CF6', '#0EA5E9', '#F43F5E']
  const segmentosData = (Array.isArray(distSeg) ? distSeg : []).map((s: any, idx: number) => ({
    name: s.nombre,
    value: Number(s.total_miembros || 0),
    color: palette[idx % palette.length]
  }))
  const totalDistribucion = segmentosData.reduce((acc: number, it: any) => acc + (Number(it.value) || 0), 0)

  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 transition-opacity duration-200 ${refrescando ? 'opacity-60' : ''}`}>
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

      <div className="col-span-2">
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

      <div className="col-span-2">
        <NotasLideresWidget
          id="notas-lideres"
          title="Notas de Líderes"
        />
      </div>

      <div className="col-span-2">
        <ActivityWidget
          id="actividad"
          title="Actividad Reciente"
          icon={Calendar}
          items={actividadReciente}
        />
      </div>

      <div className="col-span-2">
        <BirthdayWidget
          id="cumpleanos"
          title="Próximos Cumpleaños"
          items={cumpleanos}
        />
      </div>

      {hostHomeQueues && (
        <div className="col-span-2">
          <HostHomeQueuesWidget queues={hostHomeQueues} canReviewHostHomes={canReviewHostHomeQueue} layout="single-column" />
        </div>
      )}

      <div className="col-span-2">
        <RiskGroupsWidget
          id="riesgo"
          title="Grupos que Necesitan Atención"
          items={gruposRiesgo}
        />
      </div>
    </div>
  )
}
