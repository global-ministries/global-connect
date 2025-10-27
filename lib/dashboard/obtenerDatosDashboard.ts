import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { obtenerBaselineStats } from '@/lib/dashboard/baselineStats'

export interface DatosWidgets {
  [clave: string]: any
}

export interface RespuestaDashboard {
  rol: string
  widgets: DatosWidgets
  statsAdmin?: Awaited<ReturnType<typeof obtenerBaselineStats>>
}

export async function obtenerDatosDashboard(): Promise<RespuestaDashboard> {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)

  let rolPrincipal = 'miembro'
  const roles = userData?.roles || []
  if (roles.includes('admin')) rolPrincipal = 'admin'
  else if (roles.includes('pastor')) rolPrincipal = 'pastor'
  else if (roles.includes('director-general')) rolPrincipal = 'director-general'
  else if (roles.includes('director-etapa')) rolPrincipal = 'director-etapa'
  else if (roles.includes('lider')) rolPrincipal = 'lider'
  else rolPrincipal = 'miembro'

  try {
    const { data: rpcData, error } = await supabase.rpc('obtener_datos_dashboard', { p_auth_id: userData?.user?.id })
    if (!error && rpcData) {
      const rolRpc = rpcData.rol || rolPrincipal
      const widgets = rpcData.widgets || {}
      if (['admin', 'pastor', 'director-general'].includes(rolRpc)) {
        const stats = await obtenerBaselineStats()
        return { rol: rolRpc, widgets, statsAdmin: stats }
      }
      return { rol: rolRpc, widgets }
    }
  } catch (e) {
    // Fallback silencioso
  }

  if (['admin', 'pastor', 'director-general'].includes(rolPrincipal)) {
    const stats = await obtenerBaselineStats()
    return { rol: rolPrincipal, widgets: {}, statsAdmin: stats }
  }

  return { rol: rolPrincipal, widgets: {} }
}
