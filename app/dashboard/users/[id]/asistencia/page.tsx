import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, BotonSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import ReporteAsistenciaUsuarioClient from '@/components/asistencia/ReporteAsistenciaUsuario.client'

export default async function AsistenciaUsuarioPage({ 
  params,
  searchParams 
}: { 
  params: Promise<{ id: string }>
  searchParams: Promise<{ fecha_inicio?: string; fecha_fin?: string }>
}) {
  const { id } = await params
  const searchParamsResolved = await searchParams
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

  // Obtener información básica del usuario
  const { data: usuarioData } = await supabase.rpc('obtener_detalle_usuario', { p_user_id: id })

  if (!usuarioData) {
    return (
      <DashboardLayout>
        <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <TituloSistema nivel={2}>Usuario no encontrado</TituloSistema>
              <p className="text-gray-600 mb-4">No se pudo encontrar el usuario solicitado.</p>
              <Link href="/dashboard/users">
                <BotonSistema variante="primario">
                  Volver a usuarios
                </BotonSistema>
              </Link>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  // Obtener reporte de asistencia con filtros de fecha
  const fechaInicio = searchParamsResolved.fecha_inicio || null
  const fechaFin = searchParamsResolved.fecha_fin || null

  // Debug: Log de los parámetros que enviamos
  console.log('=== DEBUG REPORTE ASISTENCIA ===')
  console.log('p_usuario_id:', id)
  console.log('p_auth_id:', user.id)
  console.log('fechaInicio:', fechaInicio)
  console.log('fechaFin:', fechaFin)

  const { data: reporteData, error: reporteError } = await supabase.rpc(
    'obtener_reporte_asistencia_usuario',
    {
      p_usuario_id: id,
      p_auth_id: user.id,
      p_fecha_inicio: fechaInicio,
      p_fecha_fin: fechaFin
    }
  )

  console.log('reporteData:', reporteData)
  console.log('reporteError:', reporteError)

  // Verificar si hay error de permisos
  if (reporteError || (reporteData && reporteData.error)) {
    return (
      <DashboardLayout>
        <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">🔒</div>
              <TituloSistema nivel={2}>Sin permisos</TituloSistema>
              <p className="text-gray-600 mb-4">
                {reporteData?.error || 'No tienes permiso para ver el reporte de asistencia de este usuario.'}
              </p>
              {reporteData?.debug && (
                <div className="mt-4 p-4 bg-gray-100 rounded-lg text-left max-w-md mx-auto">
                  <p className="text-xs font-mono">
                    <strong>Debug:</strong><br/>
                    Auth User ID: {reporteData.debug.v_auth_user_id}<br/>
                    Target User ID: {reporteData.debug.p_usuario_id}<br/>
                    Is Admin: {reporteData.debug.v_es_admin ? 'true' : 'false'}
                  </p>
                </div>
              )}
              <Link href={`/dashboard/users/${id}`} className="mt-4 inline-block">
                <BotonSistema variante="primario">
                  Volver al perfil
                </BotonSistema>
              </Link>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  // Estructura por defecto si hay error
  const reporte = reporteData || {
    kpis: {
      porcentaje_asistencia_general: 0,
      total_grupos_activos: 0,
      grupo_mas_frecuente: { id: null, nombre: 'N/D' },
      ultima_asistencia_fecha: null
    },
    series_temporales: [],
    historial_eventos: []
  }

  const nombreCompleto = `${usuarioData.nombre} ${usuarioData.apellido}`

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo={`Reporte de Asistencia - ${nombreCompleto}`}
        descripcion="Análisis detallado del historial de asistencia"
        accionPrincipal={
          <Link href={`/dashboard/users/${id}`}>
            <BotonSistema 
              variante="ghost" 
              tamaño="sm"
              className="p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </BotonSistema>
          </Link>
        }
      >
        <ReporteAsistenciaUsuarioClient 
          usuarioId={id}
          reporte={reporte}
          fechaInicio={fechaInicio || undefined}
          fechaFin={fechaFin || undefined}
        />
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
