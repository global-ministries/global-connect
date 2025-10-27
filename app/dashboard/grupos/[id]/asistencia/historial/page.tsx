import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Plus } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, BotonSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import HistorialAsistenciaClient from '@/components/asistencia/HistorialAsistencia.client'

export default async function HistorialAsistenciaPage({ 
  params,
  searchParams 
}: { 
  params: { id: string }
  searchParams: { fecha_inicio?: string; fecha_fin?: string }
}) {
  const { id } = params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return (
      <DashboardLayout>
        <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <TituloSistema nivel={2}>Acceso requerido</TituloSistema>
              <p className="text-gray-600 mb-4">Debes iniciar sesión para acceder a esta página.</p>
              <Link href="/login">
                <BotonSistema variante="primario">
                  Iniciar Sesión
                </BotonSistema>
              </Link>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  // Obtener detalles del grupo y validar permisos
  const [grupoRes, puedeEditarRes] = await Promise.all([
    supabase.rpc('obtener_detalle_grupo', { p_auth_id: user.id, p_grupo_id: id }),
    supabase.rpc('puede_editar_grupo', { p_auth_id: user.id, p_grupo_id: id })
  ])
  
  const grupo = grupoRes.data
  const puedeEditar = puedeEditarRes.data

  if (!puedeEditar || !grupo) {
    return (
      <DashboardLayout>
        <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <TituloSistema nivel={2}>Sin permisos</TituloSistema>
              <p className="text-gray-600 mb-4">No tienes permiso para ver el historial de este grupo.</p>
              <Link href={`/dashboard/grupos/${id}`}>
                <BotonSistema variante="primario">
                  Volver al grupo
                </BotonSistema>
              </Link>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  // Obtener reporte de asistencia con filtros de fecha
  const fechaInicio = searchParams.fecha_inicio || null
  const fechaFin = searchParams.fecha_fin || null

  const { data: reporteData, error: reporteError } = await supabase.rpc(
    'obtener_reporte_asistencia_grupo',
    {
      p_grupo_id: id,
      p_auth_id: user.id,
      p_fecha_inicio: fechaInicio,
      p_fecha_fin: fechaFin
    }
  )

  if (reporteError) {
    console.error('Error al obtener reporte:', reporteError)
  }

  // Estructura por defecto si hay error
  const reporte = reporteData || {
    kpis: {
      asistencia_promedio: 0,
      total_reuniones: 0,
      miembro_mas_constante: { nombre: 'N/D', asistencias: 0 },
      miembro_mas_ausencias: { nombre: 'N/D', ausencias: 0 }
    },
    series_temporales: [],
    eventos_historial: []
  }

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo={`Historial de Asistencia - ${grupo.nombre}`}
        descripcion="Análisis y eventos registrados"
        accionPrincipal={
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/grupos/${id}/asistencia`}>
              <BotonSistema 
                variante="outline" 
                tamaño="sm"
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Registrar nuevo</span>
              </BotonSistema>
            </Link>
            <Link href={`/dashboard/grupos/${id}`}>
              <BotonSistema 
                variante="ghost" 
                tamaño="sm"
                className="p-2"
              >
                <ArrowLeft className="w-5 h-5" />
              </BotonSistema>
            </Link>
          </div>
        }
      >
        <HistorialAsistenciaClient 
          grupoId={id}
          reporte={reporte}
          fechaInicio={fechaInicio || undefined}
          fechaFin={fechaFin || undefined}
        />
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
