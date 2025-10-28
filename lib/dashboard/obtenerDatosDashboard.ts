import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { getTotalUsuarios } from '@/lib/dashboard/getTotalUsuarios'
import { getTotalGruposActivos } from '@/lib/dashboard/getTotalGruposActivos'
import { getDistribucionSegmentos } from '@/lib/dashboard/getDistribucionSegmentos'

export interface DatosWidgets {
  [clave: string]: any
}

export interface RespuestaDashboard {
  rol: string
  widgets: DatosWidgets
}

export async function obtenerDatosDashboard(): Promise<RespuestaDashboard> {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  const { data: auth } = await supabase.auth.getUser()
  const authId = auth?.user?.id || userData?.user?.id

  let rolPrincipal = 'miembro'
  const roles = userData?.roles || []
  if (roles.includes('admin')) rolPrincipal = 'admin'
  else if (roles.includes('pastor')) rolPrincipal = 'pastor'
  else if (roles.includes('director-general')) rolPrincipal = 'director-general'
  else if (roles.includes('director-etapa')) rolPrincipal = 'director-etapa'
  else if (roles.includes('lider')) rolPrincipal = 'lider'
  else rolPrincipal = 'miembro'

  try {
    const { data: rpcData, error } = await supabase.rpc('obtener_datos_dashboard', { p_auth_id: authId })
    if (!error && rpcData) {
      const rolRpc = rpcData.rol || rolPrincipal
      const widgets = rpcData.widgets || {}

      // Fallbacks mínimos si faltan datos
      if (!widgets.kpis_globales) widgets.kpis_globales = {}
      if (widgets.kpis_globales.total_miembros == null) {
        const total = await getTotalUsuarios()
        if (total != null) widgets.kpis_globales.total_miembros = { valor: total }
      }
      if (widgets.kpis_globales.grupos_activos == null) {
        const totalGrupos = await getTotalGruposActivos()
        if (totalGrupos != null) widgets.kpis_globales.grupos_activos = { valor: totalGrupos }
      }
      if (!Array.isArray(widgets.distribucion_segmentos) || widgets.distribucion_segmentos.length === 0) {
        const dist = await getDistribucionSegmentos()
        if (Array.isArray(dist)) {
          widgets.distribucion_segmentos = dist.map((d) => ({ id: d.id, nombre: d.nombre, total_miembros: d.grupos }))
        }
      }

      return { rol: rolRpc, widgets }
    }
    if (error) {
      console.error('obtener_datos_dashboard RPC error:', error)
    }
  } catch (e) {
    console.error('Fallo obtener_datos_dashboard()', e)
  }

  // Fallback: construir widgets mínimos para evitar N/D
  const [totalUsuariosFB, totalGruposActivosFB, distFB] = await Promise.all([
    getTotalUsuarios(),
    getTotalGruposActivos(),
    getDistribucionSegmentos(),
  ])

  // Asistencia semanal desde reporte (mejor esfuerzo)
  let asistenciaSemanalFB: number | null = null
  try {
    const { data: rep } = await supabase.rpc('obtener_reporte_semanal_asistencia', {
      p_auth_id: authId,
      p_fecha_semana: null,
      p_incluir_todos: true,
    })
    if (rep && rep.kpis_globales && rep.kpis_globales.porcentaje_asistencia_global != null) {
      asistenciaSemanalFB = Number(rep.kpis_globales.porcentaje_asistencia_global)
    }
  } catch {}

  // Nuevos miembros últimos 30 días
  let nuevosMiembros30FB: number | null = null
  try {
    const desde = new Date()
    desde.setDate(desde.getDate() - 30)
    const { count } = await supabase
      .from('usuarios')
      .select('id', { count: 'exact', head: true })
      .gte('fecha_registro', desde.toISOString().slice(0, 10))
    if (typeof count === 'number') nuevosMiembros30FB = count
  } catch {}

  const widgetsFB: any = {
    kpis_globales: {
      ...(totalUsuariosFB != null ? { total_miembros: { valor: totalUsuariosFB } } : {}),
      ...(asistenciaSemanalFB != null ? { asistencia_semanal: { valor: asistenciaSemanalFB } } : {}),
      ...(totalGruposActivosFB != null ? { grupos_activos: { valor: totalGruposActivosFB } } : {}),
      ...(nuevosMiembros30FB != null ? { nuevos_miembros_mes: { valor: nuevosMiembros30FB } } : {}),
    },
    distribucion_segmentos: Array.isArray(distFB)
      ? distFB.map((d) => ({ id: d.id, nombre: d.nombre, total_miembros: d.grupos }))
      : [],
    actividad_reciente: [],
    tendencia_asistencia: [],
    proximos_cumpleanos: [],
    grupos_en_riesgo: [],
  }

  return { rol: rolPrincipal, widgets: widgetsFB }
}
