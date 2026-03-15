import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AttendanceList from "@/components/grupos/AttendanceList.client";
import { Edit, Calendar, Clock, BookOpen, StickyNote, Users, AlertTriangle } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, TarjetaSistema, BotonSistema, TituloSistema, TextoSistema, BadgeSistema, SeparadorSistema } from '@/components/ui/sistema-diseno'

/** Evento devuelto por obtener_evento_grupo (v2) */
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

interface AsistenciaRPCRow {
  id?: string
  usuario_id?: string
  nombre?: string
  apellido?: string
  rol?: string | null
  presente?: boolean
  motivo_inasistencia?: string | null
  tipo_presencia?: string | null
  nota?: string | null
  tiempo_tardanza?: number | null
  motivo_tardanza?: string | null
  motivo_tardanza_otro?: string | null
}

export default async function AsistenciaEventoPage({ params }: { params: Promise<{ id: string; eventoId: string }> }) {
  const { id, eventoId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return (
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

  const [{ data: evento }, { data: puedeEditar }, asistenciaRes, { data: grupoData }] = await Promise.all([
    supabase.rpc('obtener_evento_grupo', { p_auth_id: user.id, p_evento_id: eventoId }),
    supabase.rpc('puede_editar_grupo', { p_auth_id: user.id, p_grupo_id: id }),
    supabase.rpc('obtener_asistencia_evento', { p_auth_id: user.id, p_evento_id: eventoId }),
    supabase.from('grupos').select('segmento_id, segmentos(nombre)').eq('id', id).single(),
  ])

  const segmentoNombre = (grupoData as any)?.segmentos?.nombre ?? ''
  const esMatrimonios = segmentoNombre.toLowerCase().includes('matrimonio')

  // Obtener relaciones de cónyuges para grupos de matrimonios
  let conyugeMap: Record<string, string> = {}
  if (esMatrimonios) {
    const miembroIds = (Array.isArray(asistenciaRes.data) ? asistenciaRes.data as AsistenciaRPCRow[] : []).map(r => r.usuario_id ?? r.id ?? '')
    const { data: relaciones } = await supabase
      .from('relaciones_usuarios')
      .select('usuario1_id, usuario2_id')
      .eq('tipo_relacion', 'conyuge')
      .or(`usuario1_id.in.(${miembroIds.join(',')}),usuario2_id.in.(${miembroIds.join(',')})`)

    if (relaciones) {
      for (const rel of relaciones) {
        conyugeMap[rel.usuario1_id] = rel.usuario2_id
        conyugeMap[rel.usuario2_id] = rel.usuario1_id
      }
    }
  }

  const ev: EventoGrupo | undefined = Array.isArray(evento) ? (evento[0] as EventoGrupo) : undefined
  if (!ev) return (
    <DashboardLayout>
      <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <TituloSistema nivel={2}>Evento no encontrado</TituloSistema>
            <p className="text-muted-foreground mb-4">No hay acceso o el evento no existe.</p>
            <Link href={`/grupos-vida/${id}`}>
              <BotonSistema variante="primario">Volver al grupo</BotonSistema>
            </Link>
          </div>
        </div>
      </ContenedorDashboard>
    </DashboardLayout>
  )

  const asistentes = Array.isArray(asistenciaRes.data)
    ? (asistenciaRes.data as AsistenciaRPCRow[]).map((r) => ({
      id: r.usuario_id ?? r.id ?? '',
      nombre: r.nombre ?? "",
      apellido: r.apellido ?? "",
      rol: r.rol ?? null,
      presente: r.tipo_presencia ? r.tipo_presencia !== 'ausente' : (r.presente ?? false),
      motivo: r.motivo_inasistencia ?? null,
      tipo_presencia: r.tipo_presencia ?? (r.presente ? 'presente' : 'ausente'),
      tiempo_tardanza: r.tiempo_tardanza,
      motivo_tardanza: r.motivo_tardanza,
    }))
    : [];

  const total = asistentes.length
  const presentes = asistentes.filter((x) => x.tipo_presencia === 'presente').length
  const tardes = asistentes.filter((x) => x.tipo_presencia === 'tarde').length
  const ausentes = asistentes.filter((x) => x.tipo_presencia === 'ausente').length
  const porcentaje = total ? Math.round(((presentes + tardes) / total) * 100) : 0

  // Formatear fecha
  const formatearFecha = (fecha: string) => {
    const fechaObj = new Date(fecha)
    const dia = String(fechaObj.getUTCDate()).padStart(2, '0')
    const mes = String(fechaObj.getUTCMonth() + 1).padStart(2, '0')
    const anio = fechaObj.getUTCFullYear()
    return `${dia}-${mes}-${anio}`
  }

  const formatearHora = (hora: string) => {
    const [h, m] = hora.split(':')
    const hNum = parseInt(h)
    const ampm = hNum >= 12 ? 'PM' : 'AM'
    const h12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum
    return `${h12}:${m} ${ampm}`
  }

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo={`Asistencia del ${formatearFecha(ev.fecha)}`}
        botonRegreso={{ href: `/grupos-vida/${id}`, texto: 'Volver al grupo' }}
        accionPrincipal={
          puedeEditar ? (
            <Link href={`/grupos-vida/${id}/asistencia/editar/${eventoId}`}>
              <BotonSistema variante="outline" tamaño="sm" className="gap-2">
                <Edit className="w-4 h-4" />
                <span className="hidden sm:inline">Editar</span>
              </BotonSistema>
            </Link>
          ) : null
        }
      >
        {/* No hubo reunión */}
        {ev.no_hubo_reunion && (
          <TarjetaSistema className="p-4 border-yellow-500/30 bg-yellow-500/5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
              <div>
                <TextoSistema className="font-medium">No hubo reunión esta semana</TextoSistema>
                {ev.motivo_no_reunion && (
                  <TextoSistema variante="sutil" tamaño="sm">{ev.motivo_no_reunion}</TextoSistema>
                )}
              </div>
            </div>
          </TarjetaSistema>
        )}

        {/* Información del evento */}
        <TarjetaSistema className="p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <TextoSistema variante="sutil" tamaño="sm">Fecha</TextoSistema>
                <TextoSistema className="font-medium">{formatearFecha(ev.fecha)}</TextoSistema>
              </div>
            </div>
            {ev.hora && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <TextoSistema variante="sutil" tamaño="sm">Hora</TextoSistema>
                  <TextoSistema className="font-medium">{formatearHora(ev.hora)}</TextoSistema>
                </div>
              </div>
            )}
            {ev.tema && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <TextoSistema variante="sutil" tamaño="sm">Tema</TextoSistema>
                  <TextoSistema className="font-medium">{ev.tema}</TextoSistema>
                </div>
              </div>
            )}
            {(ev.conteo_visitantes ?? 0) > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <TextoSistema variante="sutil" tamaño="sm">Visitantes</TextoSistema>
                  <TextoSistema className="font-medium">{ev.conteo_visitantes}</TextoSistema>
                </div>
              </div>
            )}
          </div>

          {/* Notas del evento */}
          {(ev.notas || ev.descripcion) && (
            <>
              <SeparadorSistema />
              {ev.descripcion && (
                <div className="mt-3">
                  <TextoSistema variante="sutil" tamaño="sm" className="mb-1">Descripción</TextoSistema>
                  <TextoSistema className="whitespace-pre-wrap">{ev.descripcion}</TextoSistema>
                </div>
              )}
              {ev.notas && (
                <div className="mt-3">
                  <TextoSistema variante="sutil" tamaño="sm" className="mb-1 flex items-center gap-1.5">
                    <StickyNote className="w-3.5 h-3.5" /> Notas
                  </TextoSistema>
                  <TextoSistema className="whitespace-pre-wrap">{ev.notas}</TextoSistema>
                </div>
              )}
            </>
          )}

          {/* Puntos de oración */}
          {ev.puntos_oracion && (
            <>
              <SeparadorSistema />
              <div className="mt-3">
                <TextoSistema variante="sutil" tamaño="sm" className="mb-1">🙏 Puntos de oración</TextoSistema>
                <TextoSistema className="whitespace-pre-wrap">{ev.puntos_oracion}</TextoSistema>
              </div>
            </>
          )}
        </TarjetaSistema>

        {/* KPIs */}
        {!ev.no_hubo_reunion && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <TarjetaSistema className="p-4 sm:p-6 text-center">
              <TextoSistema variante="sutil" tamaño="sm">Presentes</TextoSistema>
              <TituloSistema nivel={2} className="text-emerald-500">{presentes}</TituloSistema>
            </TarjetaSistema>
            <TarjetaSistema className="p-4 sm:p-6 text-center">
              <TextoSistema variante="sutil" tamaño="sm">Tardes</TextoSistema>
              <TituloSistema nivel={2} className="text-amber-500">{tardes}</TituloSistema>
            </TarjetaSistema>
            <TarjetaSistema className="p-4 sm:p-6 text-center">
              <TextoSistema variante="sutil" tamaño="sm">Ausentes</TextoSistema>
              <TituloSistema nivel={2} className="text-red-500">{ausentes}</TituloSistema>
            </TarjetaSistema>
            <TarjetaSistema className="p-4 sm:p-6 text-center">
              <TextoSistema variante="sutil" tamaño="sm">% Asistencia</TextoSistema>
              <TituloSistema nivel={2} className="text-[hsl(var(--chart-4))]">{porcentaje}%</TituloSistema>
            </TarjetaSistema>
          </div>
        )}

        {/* Listado de Asistencia */}
        {!ev.no_hubo_reunion && (
          <TarjetaSistema className="p-4 sm:p-6">
            <div className="mb-4">
              <TituloSistema nivel={3}>Listado de Asistencia</TituloSistema>
              <TextoSistema variante="sutil">Detalle de asistencia de cada miembro</TextoSistema>
            </div>
            <AttendanceList attendees={asistentes} esMatrimonios={esMatrimonios} conyugeMap={conyugeMap} />
          </TarjetaSistema>
        )}

        {/* Notas privadas del líder (solo para quien puede editar) */}
        {puedeEditar && ev.notas_privadas_lider && (
          <TarjetaSistema className="p-4 sm:p-6 border-blue-500/20 bg-blue-500/5">
            <div className="flex items-center gap-2 mb-2">
              <BadgeSistema variante="info" tamaño="sm">Solo líder</BadgeSistema>
              <TextoSistema className="font-medium" tamaño="sm">Notas privadas del líder</TextoSistema>
            </div>
            <TextoSistema className="whitespace-pre-wrap">{ev.notas_privadas_lider}</TextoSistema>
          </TarjetaSistema>
        )}
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
