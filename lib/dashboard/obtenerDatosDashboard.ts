import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { getTotalUsuarios } from '@/lib/dashboard/getTotalUsuarios'
import { getTotalGruposActivos } from '@/lib/dashboard/getTotalGruposActivos'
import { getDistribucionSegmentos } from '@/lib/dashboard/getDistribucionSegmentos'
import type { PlatformSession } from '@/lib/platform/session/types'

export interface DatosWidgets {
  [clave: string]: unknown
}

export interface RespuestaDashboard {
  rol: string
  widgets: DatosWidgets
  platformSession: PlatformSession | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toDashboardWidgets(value: unknown): DatosWidgets {
  return isRecord(value) ? { ...value } : {}
}

function toDashboardRole(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function ensureKpisGlobales(widgets: DatosWidgets): Record<string, unknown> {
  if (isRecord(widgets.kpis_globales)) return widgets.kpis_globales

  const kpisGlobales: Record<string, unknown> = {}
  widgets.kpis_globales = kpisGlobales
  return kpisGlobales
}

export async function obtenerDatosDashboard(): Promise<RespuestaDashboard> {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  const platformSession = userData?.platformSession ?? null
  const { data: auth } = await supabase.auth.getUser()
  const authId = auth?.user?.id || userData?.user?.id || ''

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
      const d = isRecord(rpcData) ? rpcData : {}
      const rolRpc = toDashboardRole(d.rol, rolPrincipal)
      const widgets = toDashboardWidgets(d.widgets)

      // Fallbacks mínimos si faltan datos (skip for DG, their data is already scoped)
      if (rolRpc !== 'director-general') {
        const kpisGlobales = ensureKpisGlobales(widgets)
        if (kpisGlobales.total_miembros == null) {
          const total = await getTotalUsuarios()
          if (total != null) kpisGlobales.total_miembros = { valor: total }
        }
        if (kpisGlobales.grupos_activos == null) {
          const totalGrupos = await getTotalGruposActivos()
          if (totalGrupos != null) kpisGlobales.grupos_activos = { valor: totalGrupos }
        }
        if (!Array.isArray(widgets.distribucion_segmentos) || widgets.distribucion_segmentos.length === 0) {
          const dist = await getDistribucionSegmentos()
          if (Array.isArray(dist)) {
            widgets.distribucion_segmentos = dist.map((d) => ({ id: d.id, nombre: d.nombre, total_miembros: d.grupos }))
          }
        }
      }

      return { rol: rolRpc, widgets, platformSession }
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
      p_fecha_semana: undefined,
      p_incluir_todos: true,
    })
    const reporteSemanal = isRecord(rep) ? rep : null
    const kpisReporte = reporteSemanal && isRecord(reporteSemanal.kpis_globales) ? reporteSemanal.kpis_globales : null
    const porcentajeAsistencia = kpisReporte?.porcentaje_asistencia_global
    if (porcentajeAsistencia != null) {
      asistenciaSemanalFB = Number(porcentajeAsistencia)
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

  const widgetsFB: DatosWidgets = {
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

  return { rol: rolPrincipal, widgets: widgetsFB, platformSession }
}
