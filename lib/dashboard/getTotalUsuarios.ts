import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Obtiene el total de usuarios visibles para el usuario autenticado
 * usando listar_usuarios_con_permisos con límite 1 para leer total_count.
 * Retorna null si algo falla (RLS, error RPC u otro).
 */
export async function getTotalUsuarios(): Promise<number | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return null

    // Invocar RPC con limite 1: (p_auth_id, p_busqueda, p_roles_filtro, p_con_email, p_con_telefono, p_en_grupo, p_limite, p_offset)
    const { data, error } = await supabase.rpc('listar_usuarios_con_permisos', {
      p_auth_id: auth.user.id,
      p_busqueda: '',
      p_roles_filtro: [],
      p_con_email: null,
      p_con_telefono: null,
      p_en_grupo: null,
      p_limite: 1,
      p_offset: 0,
    })

    if (error) {
      console.error('Error listar_usuarios_con_permisos (total usuarios):', error)
      return null
    }

    if (!Array.isArray(data) || data.length === 0) return 0

    const row = data[0] as any
    const total = row?.total_count
    if (typeof total === 'number') return total
    if (typeof total === 'string' && total.match(/^\d+$/)) return parseInt(total, 10)
    return null
  } catch (e) {
    console.error('Fallo getTotalUsuarios()', e)
    return null
  }
}
