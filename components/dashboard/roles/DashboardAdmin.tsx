"use client"

import { useEffect, useState, useCallback } from 'react'
import { MetricWidget } from '@/components/dashboard/widgets/MetricWidget'
import { DonutWidget } from '@/components/dashboard/widgets/DonutWidget'
import { ActivityWidget } from '@/components/dashboard/widgets/ActivityWidget'
import { BirthdayWidget } from '@/components/dashboard/widgets/BirthdayWidget'
import { RiskGroupsWidget } from '@/components/dashboard/widgets/RiskGroupsWidget'
import { NotasLideresWidget } from '@/components/dashboard/widgets/NotasLideresWidget'
import { Users, UsersRound, Activity, TrendingUp, Calendar } from 'lucide-react'
import { useCampus } from '@/hooks/useCampus'
import { createClient } from '@/lib/supabase/client'

interface PropsDashboardAdmin {
  data: any
  rol?: string
}

export default function DashboardAdmin({ data: initialData, rol }: PropsDashboardAdmin) {
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
  const refrescarDatos = useCallback(async () => {
    if (loadingCampus || esDG) return
    setRefrescando(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Call obtener_datos_dashboard which already supports campus filtering
      // through RLS (the RPC sees the user's data filtered)
      const rpcParams: any = { p_auth_id: user.id }

      // Also get the resumen with campus filter for KPIs
      const { data: resumen } = await supabase.rpc(
        'resumen_dashboard_admin',
        campusId ? { p_campus_id: campusId } : {}
      )

      if (resumen) {
        const r = resumen as any
        setData((prev: any) => ({
          ...prev,
          kpis_globales: {
            total_miembros: { valor: r.total_usuarios },
            grupos_activos: { valor: r.total_grupos },
            asistencia_semanal: prev?.kpis_globales?.asistencia_semanal,
            nuevos_miembros_mes: prev?.kpis_globales?.nuevos_miembros_mes,
          },
        }))
      }
    } catch (err) {
      console.error('Error refrescando dashboard:', err)
    } finally {
      setRefrescando(false)
    }
  }, [campusId, loadingCampus, esDG])

  useEffect(() => {
    // Only re-fetch when campus changes (not on initial load)
    if (!loadingCampus) {
      refrescarDatos()
    }
  }, [refrescarDatos, loadingCampus])

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
