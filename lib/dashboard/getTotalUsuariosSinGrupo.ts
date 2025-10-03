import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Cuenta usuarios (miembros) visibles sin pertenecer a ningún grupo de vida.
 * Usa el mismo RPC listar_usuarios_con_permisos con p_en_grupo = false y limite 1
 * para extraer total_count eficiente. Retorna null ante error.
 */
export async function getTotalUsuariosSinGrupo(): Promise<number | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return null

    const { data, error } = await supabase.rpc('listar_usuarios_con_permisos', {
      p_auth_id: auth.user.id,
      p_busqueda: '',
      p_roles_filtro: [],
      p_con_email: null,
      p_con_telefono: null,
      p_en_grupo: false,
      p_limite: 1,
      p_offset: 0,
    })

    if (error) {
      console.error('Error listar_usuarios_con_permisos (usuarios sin grupo):', error)
      return null
    }

    if (!Array.isArray(data) || data.length === 0) return 0

    const row = data[0] as any
    const total = row?.total_count
    if (typeof total === 'number') return total
    if (typeof total === 'string' && /^\d+$/.test(total)) return parseInt(total, 10)
    return null
  } catch (e) {
    console.error('Fallo getTotalUsuariosSinGrupo()', e)
    return null
  }
}
