/**
 * Grupos de Vida — who may manage the directors.
 *
 * Only admin and pastor create general directors, assign their segments,
 * change their scope and mark the stage directors they see. A director general
 * is refused: letting them change their own scope would widen their own
 * access. Server-side only (reads the session cookie).
 */
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'

export const ROLES_ADMINISTRADORES_DE_DIRECTORES: readonly string[] = ['admin', 'pastor']

/** Throws `No autenticado` without a session and `No autorizado` for any role other than admin or pastor. */
export async function exigirAdminOPastor(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData) throw new Error('No autenticado')
  if (!userData.roles.some((rol) => ROLES_ADMINISTRADORES_DE_DIRECTORES.includes(rol))) throw new Error('No autorizado')
}
