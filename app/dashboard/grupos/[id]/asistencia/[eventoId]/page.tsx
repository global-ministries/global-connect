import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AttendanceList from "@/components/grupos/AttendanceList.client";
import { ArrowLeft, Edit } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, TarjetaSistema, BotonSistema, TituloSistema, TextoSistema } from '@/components/ui/sistema-diseno'

type Evento = { id: string; grupo_id: string; fecha: string; hora: string | null; tema: string | null; notas: string | null }
type AsistenciaRow = {
  usuario_id: string
  presente: boolean
  motivo_inasistencia: string | null
  registrado_por_usuario_id: string | null
  fecha_registro: string
  nombre: string
  apellido: string
  rol: string | null
}

export default async function AsistenciaEventoPage({ params }: { params: { id: string; eventoId: string } }) {
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

  const [{ data: evento }, { data: puedeEditar }] = await Promise.all([
    supabase.rpc('obtener_evento_grupo', { p_auth_id: user.id, p_evento_id: eventoId }),
    supabase.rpc('puede_editar_grupo', { p_auth_id: user.id, p_grupo_id: id }),
  ])
  // (log depuración removido)

  const ev = (Array.isArray(evento) ? (evento[0] as Evento | undefined) : undefined)
  if (!ev) return (
    <DashboardLayout>
      <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <TituloSistema nivel={2}>Evento no encontrado</TituloSistema>
            <p className="text-gray-600 mb-4">No hay acceso o el evento no existe.</p>
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

  // Nueva: cargar asistencias del evento
  const asistenciaRes = await supabase.rpc("obtener_asistencia_evento", {
    p_auth_id: user?.id ?? null,
    p_evento_id: eventoId,
  });
  // (log depuración removido)

  const asistentes = Array.isArray(asistenciaRes.data)
    ? asistenciaRes.data.map((r: any) => ({
        id: r.usuario_id ?? r.id,
        nombre: r.nombre ?? "",
        apellido: r.apellido ?? "",
        rol: r.rol ?? null,
        presente: r.presente ?? false,
        motivo: r.motivo_inasistencia ?? r.motivo ?? null,
      }))
    : [];

  const total = asistentes.length
  const presentes = asistentes.filter((x) => x.presente).length
  const porcentaje = total ? Math.round((presentes / total) * 100) : 0

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
        titulo={`Asistencia del ${formatearFecha(ev.fecha)}`}
        descripcion={`${ev.hora ? `Hora: ${ev.hora} • ` : ''}Tema: ${ev.tema || '—'} • Notas: ${ev.notas || '—'}`}
        accionPrincipal={
          <div className="flex items-center gap-2">
            {puedeEditar && (
              <Link href={`/dashboard/grupos/${id}/asistencia/editar/${eventoId}`}>
                <BotonSistema 
                  variante="outline" 
                  tamaño="sm"
                  className="gap-2"
                >
                  <Edit className="w-4 h-4" />
                  <span className="hidden sm:inline">Editar</span>
                </BotonSistema>
              </Link>
            )}
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
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TarjetaSistema className="p-6">
            <TextoSistema variante="sutil" tamaño="sm">Presentes</TextoSistema>
            <TituloSistema nivel={2} className="text-green-600">{presentes}</TituloSistema>
          </TarjetaSistema>
          <TarjetaSistema className="p-6">
            <TextoSistema variante="sutil" tamaño="sm">Total</TextoSistema>
            <TituloSistema nivel={2}>{total}</TituloSistema>
          </TarjetaSistema>
          <TarjetaSistema className="p-6">
            <TextoSistema variante="sutil" tamaño="sm">% Asistencia</TextoSistema>
            <TituloSistema nivel={2} className="text-orange-600">{porcentaje}%</TituloSistema>
          </TarjetaSistema>
        </div>

        {/* Listas de asistencia */}
        <TarjetaSistema className="p-6">
          <div className="mb-4">
            <TituloSistema nivel={3}>Listado de Asistencia</TituloSistema>
            <TextoSistema variante="sutil">Presentes y ausentes del evento</TextoSistema>
          </div>
          <AttendanceList attendees={asistentes} />
        </TarjetaSistema>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
