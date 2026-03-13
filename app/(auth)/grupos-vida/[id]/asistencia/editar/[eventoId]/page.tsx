import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import RegistroAsistenciaAvanzado from '@/components/grupos/RegistroAsistenciaAvanzado.client'
import { Eye, History } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import {
  ContenedorDashboard, TarjetaSistema, BotonSistema, TituloSistema,
} from '@/components/ui/sistema-diseno'
import { obtenerConfiguracionGrupos } from '@/lib/actions/configuracion-grupos-vida.actions'
import type { TipoPresencia, MotivoTardanza, TiempoTardanza } from '@/lib/types/asistencia-avanzada.types'

/** Forma mínima del evento devuelto por obtener_evento_grupo */
interface EventoGrupo {
  id: string
  grupo_id: string
  fecha: string
  hora: string | null
  tema: string | null
  notas: string | null
  descripcion?: string | null
  puntos_oracion?: string | null
  notas_privadas_lider?: string | null
  conteo_visitantes?: number
  no_hubo_reunion?: boolean
  motivo_no_reunion?: string | null
}

interface AsistenciaRow {
  usuario_id: string
  presente: boolean
  motivo_inasistencia: string | null
  tipo_presencia?: string | null
  nota?: string | null
  tiempo_tardanza?: number | null
  motivo_tardanza?: string | null
  motivo_tardanza_otro?: string | null
}

interface GrupoDetalle {
  nombre: string
  miembros: Array<{ id: string; nombre: string; apellido: string; rol?: string | null }>
}

export default async function EditarAsistenciaPage({
  params,
}: {
  params: Promise<{ id: string; eventoId: string }>
}) {
  const { id, eventoId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <DashboardLayout>
        <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <TituloSistema nivel={2}>Acceso requerido</TituloSistema>
              <p className="text-muted-foreground mb-4">Debes iniciar sesión para acceder a esta página.</p>
              <Link href="/login">
                <BotonSistema variante="primario">Iniciar Sesión</BotonSistema>
              </Link>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  const [{ data: evento }, { data: lista }, { data: grupoRaw }, { data: puedeEditar }, configResult] = await Promise.all([
    supabase.rpc('obtener_evento_grupo', { p_auth_id: user.id, p_evento_id: eventoId }),
    supabase.rpc('obtener_asistencia_evento', { p_auth_id: user.id, p_evento_id: eventoId }),
    supabase.rpc('obtener_detalle_grupo', { p_auth_id: user.id, p_grupo_id: id }),
    supabase.rpc('puede_editar_grupo', { p_auth_id: user.id, p_grupo_id: id }),
    obtenerConfiguracionGrupos(),
  ])

  const grupo = grupoRaw as GrupoDetalle | null
  const ev: EventoGrupo | undefined = Array.isArray(evento) ? (evento[0] as EventoGrupo) : undefined

  if (!ev || !puedeEditar || !grupo) {
    return (
      <DashboardLayout>
        <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <TituloSistema nivel={2}>Sin permisos o evento no encontrado</TituloSistema>
              <p className="text-muted-foreground mb-4">No tienes permiso para editar o el evento no existe.</p>
              <Link href={`/grupos-vida/${id}`}>
                <BotonSistema variante="primario">Volver al grupo</BotonSistema>
              </Link>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  // Mapear asistencias a formato EstadoMiembro para RegistroAsistenciaAvanzado
  const asistencias = Array.isArray(lista) ? (lista as AsistenciaRow[]) : []
  const estadoMiembros: Record<string, {
    tipo_presencia: TipoPresencia
    motivo?: string
    nota?: string
    tiempo_tardanza?: TiempoTardanza
    motivo_tardanza?: MotivoTardanza
    motivo_tardanza_otro?: string
  }> = {}

  for (const r of asistencias) {
    const tp = (r.tipo_presencia || (r.presente ? 'presente' : 'ausente')) as TipoPresencia
    estadoMiembros[r.usuario_id] = {
      tipo_presencia: tp,
      motivo: r.motivo_inasistencia || undefined,
      nota: r.nota || undefined,
      tiempo_tardanza: (r.tiempo_tardanza as TiempoTardanza) || undefined,
      motivo_tardanza: (r.motivo_tardanza as MotivoTardanza) || undefined,
      motivo_tardanza_otro: r.motivo_tardanza_otro || undefined,
    }
  }

  const initialData = {
    fecha: ev.fecha,
    hora: ev.hora,
    tema: ev.tema,
    notas: ev.notas,
    descripcion: ev.descripcion,
    puntos_oracion: ev.puntos_oracion,
    notas_privadas_lider: ev.notas_privadas_lider,
    conteo_visitantes: ev.conteo_visitantes ?? 0,
    no_hubo_reunion: ev.no_hubo_reunion ?? false,
    motivo_no_reunion: ev.motivo_no_reunion,
    estado: estadoMiembros,
  }

  const configuracion = configResult.success && configResult.data
    ? {
      visitantes_habilitados: configResult.data.visitantes_habilitados,
      puntos_oracion_compartidos: configResult.data.puntos_oracion_compartidos,
      modo_cierre_asistencia: configResult.data.modo_cierre_asistencia,
    }
    : undefined

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
        botonRegreso={{ href: `/grupos-vida/${id}`, texto: 'Volver al grupo' }}
        accionPrincipal={
          <div className="flex items-center gap-2">
            <Link href={`/grupos-vida/${id}/asistencia/${eventoId}`}>
              <BotonSistema variante="outline" tamaño="sm" className="gap-2">
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">Ver evento</span>
              </BotonSistema>
            </Link>
            <Link href={`/grupos-vida/${id}/asistencia/historial`}>
              <BotonSistema variante="outline" tamaño="sm" className="gap-2">
                <History className="w-4 h-4" />
                <span className="hidden sm:inline">Historial</span>
              </BotonSistema>
            </Link>
          </div>
        }
      >
        <TarjetaSistema className="p-4 sm:p-6">
          <RegistroAsistenciaAvanzado
            grupoId={id}
            miembros={(grupo.miembros || []).map((m) => ({
              id: m.id,
              nombre: m.nombre,
              apellido: m.apellido,
              rol: m.rol || undefined,
            }))}
            initialData={initialData}
            isEdit
            configuracion={configuracion}
          />
        </TarjetaSistema>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
