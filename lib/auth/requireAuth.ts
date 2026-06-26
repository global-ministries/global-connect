"use server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { findPlatformSessionPersonaByAuthId, normalizeLegacyRoles, resolveReadOnlyPlatformSession } from '@/lib/auth/platformSessionReadOnly'
import type { PlatformSession } from '@/lib/platform/session/types'

interface AuthenticatedUser {
  authId: string
  email: string | undefined
  platformSession: PlatformSession | null
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

  const platformSession = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
  })

  return {
    authId: user.id,
    email: user.email,
    platformSession,
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
  const rolesUsuario = normalizeLegacyRoles(roles)

  const tieneRol = rolesUsuario.some(r => rolesArray.includes(r))
  if (!tieneRol) {
    throw new Error(`Permiso denegado: se requiere rol ${rolesArray.join(" o ")}`)
  }

  const platformSession = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    globalRoles: rolesUsuario,
  })

  return { authId: user.id, email: user.email, platformSession }
}
