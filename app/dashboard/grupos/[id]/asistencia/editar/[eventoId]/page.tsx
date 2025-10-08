import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AttendanceRegister from '@/components/grupos/AttendanceRegister.client'
import { ArrowLeft, Eye, History } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, TarjetaSistema, BotonSistema, TituloSistema } from '@/components/ui/sistema-diseno'

type Evento = { id: string; grupo_id: string; fecha: string; hora: string | null; tema: string | null; notas: string | null }
type AsistenciaRow = {
  usuario_id: string
  presente: boolean
  motivo_inasistencia: string | null
}

export default async function EditarAsistenciaPage({ params }: { params: { id: string; eventoId: string } }) {
  const { id, eventoId } = params
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

  const [{ data: evento }, { data: lista }, { data: grupo }, { data: puedeEditar }] = await Promise.all([
    supabase.rpc('obtener_evento_grupo', { p_auth_id: user.id, p_evento_id: eventoId }),
    supabase.rpc('obtener_asistencia_evento', { p_auth_id: user.id, p_evento_id: eventoId }),
    supabase.rpc('obtener_detalle_grupo', { p_auth_id: user.id, p_grupo_id: id }),
    supabase.rpc('puede_editar_grupo', { p_auth_id: user.id, p_grupo_id: id }),
  ])

  const ev: Evento | undefined = Array.isArray(evento) ? (evento[0] as Evento) : undefined
  if (!ev || !puedeEditar || !grupo) {
    return (
      <DashboardLayout>
        <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <TituloSistema nivel={2}>Sin permisos o evento no encontrado</TituloSistema>
              <p className="text-gray-600 mb-4">No tienes permiso para editar o el evento no existe.</p>
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

  const miembros = (grupo.miembros || []).map((m: { id: string; nombre: string; apellido: string; rol?: string | null }) => ({ id: m.id, nombre: m.nombre, apellido: m.apellido, rol: m.rol || undefined }))
  const initial = {
    fecha: ev.fecha as string,
    hora: ev.hora as string | null,
    tema: ev.tema as string | null,
    notas: ev.notas as string | null,
    estado: Object.fromEntries(((Array.isArray(lista) ? (lista as AsistenciaRow[]) : [])).map((r) => [r.usuario_id, { presente: r.presente, motivo: r.motivo_inasistencia || '' }])) as Record<string, { presente: boolean; motivo?: string }>
  }

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
        titulo={`Editar Asistencia - ${grupo.nombre}`}
        descripcion={`Fecha: ${formatearFecha(ev.fecha)}`}
        accionPrincipal={
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/grupos/${id}/asistencia/${eventoId}`}>
              <BotonSistema 
                variante="outline" 
                tamaño="sm"
                className="gap-2"
              >
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">Ver evento</span>
              </BotonSistema>
            </Link>
            <Link href={`/dashboard/grupos/${id}/asistencia/historial`}>
              <BotonSistema 
                variante="outline" 
                tamaño="sm"
                className="gap-2"
              >
                <History className="w-4 h-4" />
                <span className="hidden sm:inline">Historial</span>
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
        {/* Formulario de edición */}
        <TarjetaSistema className="p-6">
          {/* Reutilizamos el componente en modo edición */}
          <AttendanceRegister grupoId={id} miembros={miembros} initialData={initial} isEdit />
        </TarjetaSistema>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
