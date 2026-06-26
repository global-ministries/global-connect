import { buildPlatformSession } from '@/lib/platform/session/build'
import type { PlatformSession, PlatformSessionPersona } from '@/lib/platform/session/types'
import type { SupabaseClient } from '@supabase/supabase-js'

export type AuthBaseUser = { id: string; email?: string }

type AuthBasePersonaRow = { id: string; auth_id: string | null }
type AuthBasePersonaSelection = {
  eq(column: string, value: string): AuthBasePersonaSingleQuery
}
type AuthBasePersonaSingleQuery = {
  maybeSingle(): PromiseLike<{ data: AuthBasePersonaRow | null; error: unknown }>
}
type AuthBasePersonaQuery = {
  select(columns: string): AuthBasePersonaSelection
}

export type AuthBaseSupabaseClient = {
  auth: {
    getUser(): Promise<{ data: { user: AuthBaseUser | null }; error: unknown }>
  }
  rpc(functionName: string, args: { p_auth_id: string }): PromiseLike<{ data: unknown; error: unknown }>
  from(table: 'usuarios'): AuthBasePersonaQuery
}

export function toAuthBaseSupabaseClient(value: unknown): AuthBaseSupabaseClient {
  if (!isAuthBaseSupabaseClient(value)) throw new Error('Invalid auth base Supabase client')
  return value
}

export function normalizeLegacyRoles(rolesData: unknown): string[] {
  if (!Array.isArray(rolesData)) return []
  return rolesData
    .map((role) => (typeof role === 'string' ? role : getRoleName(role)))
    .filter((role): role is string => Boolean(role))
}

export async function resolveReadOnlyPlatformSession(input: {
  subjectAuthId: string | null | undefined
  findPersonaByAuthId: (authId: string) => Promise<PlatformSessionPersona | null>
  globalRoles?: string[]
}): Promise<PlatformSession | null> {
  try {
    const result = await buildPlatformSession({
      subjectAuthId: input.subjectAuthId,
      personaLookup: {
        findByAuthId: input.findPersonaByAuthId,
      },
    })

    return result.ok ? { ...result.session, globalRoles: [...(input.globalRoles ?? [])] } : null
  } catch {
    return null
  }
}

export function findPlatformSessionPersonaByAuthId(supabase: SupabaseClient, authId: string): Promise<PlatformSessionPersona | null>
export function findPlatformSessionPersonaByAuthId(supabase: AuthBaseSupabaseClient, authId: string): Promise<PlatformSessionPersona | null>
export async function findPlatformSessionPersonaByAuthId(supabase: SupabaseClient | AuthBaseSupabaseClient, authId: string): Promise<PlatformSessionPersona | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, auth_id')
    .eq('auth_id', authId)
    .maybeSingle()

  if (error) throw new Error('platform persona lookup failed')
  return toPlatformSessionPersona(data)
}

function toPlatformSessionPersona(row: AuthBasePersonaRow | null): PlatformSessionPersona | null {
  if (!row?.id.trim()) return null
  return { id: row.id, authId: row.auth_id }
}

function getRoleName(role: unknown): string | undefined {
  if (typeof role !== 'object' || role === null || !('nombre_interno' in role)) return undefined
  const roleName = role.nombre_interno
  return typeof roleName === 'string' ? roleName : undefined
}

function isAuthBaseSupabaseClient(value: unknown): value is AuthBaseSupabaseClient {
  if (typeof value !== 'object' || value === null) return false
  const auth = Reflect.get(value, 'auth')
  return (
    typeof auth === 'object'
    && auth !== null
    && typeof Reflect.get(auth, 'getUser') === 'function'
    && typeof Reflect.get(value, 'rpc') === 'function'
    && typeof Reflect.get(value, 'from') === 'function'
  )
}
