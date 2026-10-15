import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'

import { AlertTriangle, Lock } from 'lucide-react'

import { PaginaSistema, BotonSistema, TituloSistema } from '@/components/ui/sistema-diseno'
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
      <PaginaSistema>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <TituloSistema nivel={2}>Acceso requerido</TituloSistema>
              <p className="text-muted-foreground mb-4">Debes iniciar sesión para acceder a esta página.</p>
              <BotonSistema asChild variante="primario">
                <Link href="/login">
                  Iniciar Sesión
                </Link>
              </BotonSistema>
            </div>
          </div>
      </PaginaSistema>
    )
  }

  // Obtener información básica del usuario
  const { data: usuarioDataRaw } = await supabase.rpc('obtener_detalle_usuario', { p_user_id: id })
  const usuarioData = usuarioDataRaw as any

  if (!usuarioData) {
    return (
      <PaginaSistema>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <AlertTriangle className="size-12 text-danger mx-auto mb-4" aria-hidden="true" />
              <TituloSistema nivel={2}>Usuario no encontrado</TituloSistema>
              <p className="text-muted-foreground mb-4">No se pudo encontrar el usuario solicitado.</p>
              <BotonSistema asChild variante="primario">
                <Link href="/users">
                  Volver a usuarios
                </Link>
              </BotonSistema>
            </div>
          </div>
      </PaginaSistema>
    )
  }

  // Obtener reporte de asistencia con filtros de fecha
  const fechaInicio = searchParamsResolved.fecha_inicio || null
  const fechaFin = searchParamsResolved.fecha_fin || null

  const { data: reporteData, error: reporteError } = await supabase.rpc(
    'obtener_reporte_asistencia_usuario',
    {
      p_usuario_id: id,
      p_auth_id: user.id,
      p_fecha_inicio: fechaInicio ?? undefined,
      p_fecha_fin: fechaFin ?? undefined
    }
  )

  // Verificar si hay error de permisos
  if (reporteError || (reporteData && (reporteData as any).error)) {
    return (
      <PaginaSistema>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <Lock className="size-12 text-danger mx-auto mb-4" aria-hidden="true" />
              <TituloSistema nivel={2}>Sin permisos</TituloSistema>
              <p className="text-muted-foreground mb-4">
                {(reporteData as any)?.error || 'No tienes permiso para ver el reporte de asistencia de este usuario.'}
              </p>
              {(reporteData as any)?.debug && (
                <div className="mt-4 p-4 bg-muted rounded-xl text-left max-w-md mx-auto break-all">
                  <p className="text-xs font-mono">
                    <strong>Debug:</strong><br />
                    Auth User ID: {(reporteData as any).debug.v_auth_user_id}<br />
                    Target User ID: {(reporteData as any).debug.p_usuario_id}<br />
                    Is Admin: {(reporteData as any).debug.v_es_admin ? 'true' : 'false'}
                  </p>
                </div>
              )}
              <BotonSistema asChild variante="primario" className="mt-4">
                <Link href={`/users/${id}`}>
                  Volver al perfil
                </Link>
              </BotonSistema>
            </div>
          </div>
      </PaginaSistema>
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

  // The report owns no page heading, so the page description is the only subtitle.
  return (
    <PaginaSistema
      titulo={`Reporte de Asistencia - ${nombreCompleto}`}
      descripcion="Análisis detallado del historial de asistencia"
      regreso={{ href: `/users/${id}`, texto: 'Volver al usuario' }}
    >
      <ReporteAsistenciaUsuarioClient
        usuarioId={id}
        reporte={reporte as any}
        fechaInicio={fechaInicio || undefined}
        fechaFin={fechaFin || undefined}
      />
    </PaginaSistema>
  )
}
