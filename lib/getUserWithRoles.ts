
import type { SupabaseClient } from "@supabase/supabase-js"

export async function getUserWithRoles(supabase: SupabaseClient) {
  const { data: { user }, error: errorUser } = await supabase.auth.getUser();
  if (errorUser || !user) return null;

  // Usa la instancia recibida para la función RPC
  const { data: rolesData, error: errorRoles } = await supabase.rpc("obtener_roles_usuario", { p_auth_id: user.id });
  if (errorRoles || !rolesData) return { user, roles: [] };

  // rolesData puede ser array de strings o de objetos
  let roles = Array.isArray(rolesData)
    ? rolesData.map(r => typeof r === "string" ? r : r.nombre_interno).filter(Boolean)
    : [];

  return { user, roles };
}
