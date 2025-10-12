import { createSupabaseServerClient } from "@/lib/supabase/server"

// Obtiene los roles del usuario actual desde la sesión y la tabla usuario_roles
async function obtenerRolesUsuarioActual() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: errorUser } = await supabase.auth.getUser()
  if (errorUser || !user) return []
  // Consulta los roles del usuario
  // Mapear auth_id -> usuarios.id
  const { data: perfil, error: errorPerfil } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_id', user.id)
    .limit(1)
  if (errorPerfil || !perfil?.length) return []
  const usuarioId = perfil[0].id
  const { data: usuarioRoles, error: errorRoles } = await supabase
    .from('usuario_roles')
    .select('roles_sistema(nombre_interno)')
    .eq('usuario_id', usuarioId)
  if (errorRoles || !usuarioRoles) return []
  return usuarioRoles.map((r: any) => r.roles_sistema?.nombre_interno).filter(Boolean)
}

export default obtenerRolesUsuarioActual
