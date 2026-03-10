"use server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

interface AuthenticatedUser {
  authId: string
  email: string | undefined
}

/**
 * Verifica que el usuario esté autenticado.
 * Lanza error si no hay sesión válida.
 * Uso: const { authId } = await requireAuth()
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error("No autenticado")
  }

  return {
    authId: user.id,
    email: user.email,
  }
}

/**
 * Verifica que el usuario tenga al menos uno de los roles requeridos.
 * Lanza error si no está autenticado o no tiene el rol.
 * Uso: const { authId } = await requireRole('admin')
 *      const { authId } = await requireRole(['admin', 'pastor'])
 */
export async function requireRole(
  rolesRequeridos: string | string[]
): Promise<AuthenticatedUser> {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error("No autenticado")
  }

  const { data: roles } = await supabase.rpc("obtener_roles_usuario", {
    p_auth_id: user.id,
  })

  const rolesArray = Array.isArray(rolesRequeridos) ? rolesRequeridos : [rolesRequeridos]
  const rolesUsuario = Array.isArray(roles)
    ? (roles as any[]).map(r => typeof r === "string" ? r : r?.nombre_interno).filter(Boolean)
    : []

  const tieneRol = rolesUsuario.some(r => rolesArray.includes(r))
  if (!tieneRol) {
    throw new Error(`Permiso denegado: se requiere rol ${rolesArray.join(" o ")}`)
  }

  return { authId: user.id, email: user.email }
}
