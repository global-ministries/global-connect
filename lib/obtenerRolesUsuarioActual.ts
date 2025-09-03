import { createSupabaseServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

// Obtiene los roles del usuario actual desde la sesión y la tabla usuario_roles
async function obtenerRolesUsuarioActual() {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: errorUser } = await supabase.auth.getUser()
  if (errorUser || !user) return []
  // Consulta los roles del usuario
  const { data: usuarioRoles, error: errorRoles } = await supabase
    .from("usuario_roles")
    .select("roles_sistema(nombre_interno)")
    .eq("usuario_id", user.id)
  if (errorRoles || !usuarioRoles) return []
  return usuarioRoles.map((r: any) => r.roles_sistema?.nombre_interno).filter(Boolean)
}

export default obtenerRolesUsuarioActual
