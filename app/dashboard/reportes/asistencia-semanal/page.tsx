import { createSupabaseServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import ReporteSemanal from '@/components/reportes/ReporteSemanal.client'

type PageProps = {
  searchParams: Promise<{ semana?: string; todos?: string }>
}

export default async function ReporteSemanalPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServerClient()

  // Verificar autenticación
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // Resolver searchParams (Next.js 15)
  const searchParamsResolved = await searchParams
  const fechaSemana = searchParamsResolved.semana || null
  const incluirTodos =
    (searchParamsResolved.todos || '').toLowerCase() === '1' ||
    (searchParamsResolved.todos || '').toLowerCase() === 'true'

  // Obtener reporte semanal
  const { data: reporteData, error: reporteError } = await supabase.rpc(
    'obtener_reporte_semanal_asistencia',
    {
      p_auth_id: user.id,
      p_fecha_semana: fechaSemana,
      p_incluir_todos: incluirTodos
    }
  )

  // Manejar errores
  if (reporteError) {
    return (
      <DashboardLayout>
        <ContenedorDashboard
          titulo="Reporte Semanal de Asistencia"
          descripcion="Análisis consolidado de asistencia"
          accionPrincipal={null}
        >
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Error al cargar el reporte</h2>
              <p className="text-gray-600 mb-4">
                {reporteError.message || 'No se pudo obtener el reporte de asistencia semanal.'}
              </p>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  if (!reporteData) {
    return (
      <DashboardLayout>
        <ContenedorDashboard
          titulo="Reporte Semanal de Asistencia"
          descripcion="Análisis consolidado de asistencia"
          accionPrincipal={null}
        >
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="text-gray-400 text-6xl mb-4">📊</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">No hay datos disponibles</h2>
              <p className="text-gray-600">
                No se encontraron datos de asistencia para esta semana.
              </p>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Reporte Semanal de Asistencia"
        descripcion={`Semana del ${new Date(reporteData.semana.inicio).toLocaleDateString('es-ES', { 
          day: 'numeric', 
          month: 'long',
          timeZone: 'UTC'
        })} al ${new Date(reporteData.semana.fin).toLocaleDateString('es-ES', { 
          day: 'numeric', 
          month: 'long', 
          year: 'numeric',
          timeZone: 'UTC'
        })}`}
        accionPrincipal={null}
      >
        <ReporteSemanal reporte={reporteData} incluirTodosInicial={incluirTodos} />
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
