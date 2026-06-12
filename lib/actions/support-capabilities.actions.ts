"use server"

import { revalidatePath } from 'next/cache'

import { isSupportCapability, type SupportCapability } from '@/lib/support/capabilities'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type SupportCapabilityActionResult = { success: true } | { success: false; error: string }

const SUPPORT_CAPABILITY_ERROR = 'No se pudo actualizar la capacidad de soporte'
const SUPPORT_CONFIGURATION_ROLES = ['admin', 'pastor', 'director-general']

export async function grantSupportCapability(targetUsuarioId: string, capability: string): Promise<SupportCapabilityActionResult> {
  return updateSupportCapability('grant_support_capability', targetUsuarioId, capability)
}

export async function revokeSupportCapability(targetUsuarioId: string, capability: string): Promise<SupportCapabilityActionResult> {
  return updateSupportCapability('revoke_support_capability', targetUsuarioId, capability)
}

async function updateSupportCapability(rpcName: 'grant_support_capability' | 'revoke_support_capability', targetUsuarioId: string, capability: string): Promise<SupportCapabilityActionResult> {
  if (!isSupportCapability(capability)) return { success: false, error: 'Capacidad de soporte invalida' }

  const supabase = await createSupabaseServerClient()
  const actor = await getActorUsuarioId(supabase)
  if (!actor.success) return actor

  const authorization = await requireSupportCapabilityAdminContext(supabase, actor.usuarioId, actor.authId)
  if (!authorization.success) return authorization

  const { error } = await supabase.rpc(rpcName as never, {
    p_target_usuario_id: targetUsuarioId,
    p_capability: capability as SupportCapability,
  } as never)

  if (error) return { success: false, error: SUPPORT_CAPABILITY_ERROR }
  revalidatePath('/configuracion/soporte')
  revalidatePath('/ayuda/admin')
  return { success: true }
}

async function getActorUsuarioId(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false as const, error: 'No autenticado' }

  const { data, error } = await supabase.from('usuarios').select('id').eq('auth_id', user.id).maybeSingle()
  if (error || !data?.id) return { success: false as const, error: 'Perfil de usuario no encontrado' }
  return { success: true as const, usuarioId: data.id, authId: user.id }
}

async function requireSupportCapabilityAdminContext(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, usuarioId: string, authId: string) {
  const { data, error } = await supabase
    .from('support_user_capabilities')
    .select('capability')
    .eq('usuario_id', usuarioId)
    .eq('capability', 'support.manage')
    .is('revoked_at', null)
    .maybeSingle()

  if (error || !data) return { success: false as const, error: 'No autorizado' }

  const { data: roles, error: rolesError } = await supabase.rpc('obtener_roles_usuario' as never, { p_auth_id: authId } as never)
  const roleRows: unknown = roles
  if (rolesError || !Array.isArray(roleRows) || !roleRows.some((role) => hasSupportConfigurationRole(role))) {
    return { success: false as const, error: 'No autorizado' }
  }

  return { success: true as const }
}

function hasSupportConfigurationRole(role: unknown) {
  const roleName = typeof role === 'string'
    ? role
    : typeof role === 'object' && role !== null && 'nombre_interno' in role && typeof role.nombre_interno === 'string'
      ? role.nombre_interno
      : null

  return roleName !== null && SUPPORT_CONFIGURATION_ROLES.includes(roleName)
}
