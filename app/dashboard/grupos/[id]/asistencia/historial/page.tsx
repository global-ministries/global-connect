import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Plus, Eye, Edit } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, TarjetaSistema, BotonSistema, TituloSistema, TextoSistema } from '@/components/ui/sistema-diseno'

export default async function HistorialAsistenciaPage({ params }: { params: { id: string } }) {
  const { id } = params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return (
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

  const [grupoRes, puedeEditarRes, eventosRes] = await Promise.all([
    supabase.rpc('obtener_detalle_grupo', { p_auth_id: user.id, p_grupo_id: id }),
    supabase.rpc('puede_editar_grupo', { p_auth_id: user.id, p_grupo_id: id }),
    supabase.rpc('listar_eventos_grupo', { p_auth_id: user.id, p_grupo_id: id, p_limit: 50, p_offset: 0 })
  ])
  const grupo = grupoRes.data
  const puedeEditar = puedeEditarRes.data
  const eventos = eventosRes.data
  // (log depuración removido)

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

  type Ev = { id: string; fecha: string; tema: string | null; total: number; presentes: number; porcentaje: number }
  const rows: Ev[] = Array.isArray(eventos) ? (eventos as Ev[]) : []

  // Formatear fecha a dd-mm-aaaa
  const formatearFecha = (fecha: string) => {
    const fechaObj = new Date(fecha)
    const dia = String(fechaObj.getUTCDate()).padStart(2, '0')
    const mes = String(fechaObj.getUTCMonth() + 1).padStart(2, '0')
    const anio = fechaObj.getUTCFullYear()
    return `${dia}-${mes}-${anio}`
  }

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo={`Historial de Asistencia - ${grupo.nombre}`}
        descripcion="Últimos eventos registrados"
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
        {/* Lista de eventos */}
        <TarjetaSistema className="p-0">
          <div className="divide-y">
            {rows.map((ev) => (
              <div key={ev.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-3">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {formatearFecha(ev.fecha)} — {ev.tema || 'Sin tema'}
                  </div>
                  <div className="text-sm text-gray-500">
                    Presentes {ev.presentes}/{ev.total} — {ev.porcentaje}%
                  </div>
                </div>
                <div className="flex gap-2 sm:flex-shrink-0">
                  <Link href={`/dashboard/grupos/${id}/asistencia/${ev.id}`}>
                    <BotonSistema 
                      variante="outline" 
                      tamaño="sm"
                      className="gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      <span className="sm:hidden">Ver</span>
                      <span className="hidden sm:inline">Ver detalle</span>
                    </BotonSistema>
                  </Link>
                  <Link href={`/dashboard/grupos/${id}/asistencia/editar/${ev.id}`}>
                    <BotonSistema 
                      variante="ghost" 
                      tamaño="sm"
                      className="gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      <span className="hidden sm:inline">Editar</span>
                    </BotonSistema>
                  </Link>
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="p-8 text-center">
                <div className="text-gray-400 text-4xl mb-4">📅</div>
                <TituloSistema nivel={3} className="text-gray-600 mb-2">
                  No hay eventos registrados
                </TituloSistema>
                <TextoSistema variante="sutil" className="mb-4">
                  Aún no se han registrado eventos de asistencia para este grupo.
                </TextoSistema>
                <Link href={`/dashboard/grupos/${id}/asistencia`}>
                  <BotonSistema variante="primario" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Registrar primer evento
                  </BotonSistema>
                </Link>
              </div>
            )}
          </div>
        </TarjetaSistema>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
