import { buildPlatformSession } from '@/lib/platform/session/build'
import type { PlatformCapabilityLookup, PlatformSession, PlatformSessionCapability, PlatformSessionPersona } from '@/lib/platform/session/types'
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
type CapabilityGrantRow = {
  capability_key: string
  experience: string
  scope_type: string
  scope_id: string | null
  source: string
  granted_at: string
  revoked_at: string | null
}
type CapabilityGrantFilter = {
  eq(column: string, value: string): CapabilityGrantFilter
  is(column: string, value: null): PromiseLike<{ data: CapabilityGrantRow[] | null; error: unknown }>
}
type CapabilityGrantQuery = {
  select(columns: string): CapabilityGrantFilter
}
type PersonaSupabaseClient = {
  from(table: 'usuarios'): AuthBasePersonaQuery
}
type CapabilityGrantSupabaseClient = {
  from(table: 'dream_team_capability_grants'): CapabilityGrantQuery
}

export type AuthBaseSupabaseClient = PersonaSupabaseClient & CapabilityGrantSupabaseClient & {
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
  capabilityLookup?: PlatformCapabilityLookup
  capabilitySupabase?: unknown
  globalRoles?: string[]
}): Promise<PlatformSession | null> {
  try {
    const capabilityLookup = input.capabilityLookup ?? (input.capabilitySupabase ? {
      findByPersonaId: (personaId: string) => findDreamTeamCapabilityGrantsByPersonaId(
        toCapabilityGrantSupabaseClient(input.capabilitySupabase),
        personaId,
      ),
    } : undefined)
    const result = await buildPlatformSession({
      subjectAuthId: input.subjectAuthId,
      personaLookup: {
        findByAuthId: input.findPersonaByAuthId,
      },
      capabilityLookup,
    })

    return result.ok ? { ...result.session, globalRoles: [...(input.globalRoles ?? [])] } : null
  } catch {
    return null
  }
}

export function findPlatformSessionPersonaByAuthId(supabase: SupabaseClient, authId: string): Promise<PlatformSessionPersona | null>
export function findPlatformSessionPersonaByAuthId(supabase: PersonaSupabaseClient, authId: string): Promise<PlatformSessionPersona | null>
export async function findPlatformSessionPersonaByAuthId(
  supabase: SupabaseClient | PersonaSupabaseClient,
  authId: string,
): Promise<PlatformSessionPersona | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, auth_id')
    .eq('auth_id', authId)
    .maybeSingle()

  if (error) throw new Error('platform persona lookup failed')
  return toPlatformSessionPersona(data)
}

export async function findDreamTeamCapabilityGrantsByPersonaId(
  supabase: CapabilityGrantSupabaseClient,
  personaId: string,
): Promise<PlatformSessionCapability[]> {
  const { data, error } = await supabase
    .from('dream_team_capability_grants')
    .select('capability_key, experience, scope_type, scope_id, source, granted_at, revoked_at')
    .eq('persona_id', personaId)
    .is('revoked_at', null)

  if (error) throw new Error('platform capability lookup failed')
  return (data ?? []).map(toPlatformSessionCapability)
}

function toPlatformSessionCapability(row: CapabilityGrantRow): PlatformSessionCapability {
  return {
    key: row.capability_key,
    experience: row.experience,
    scopeType: row.scope_type,
    scopeId: row.scope_id || undefined,
    source: row.source,
    grantedAt: row.granted_at,
  }
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

function toCapabilityGrantSupabaseClient(value: unknown): CapabilityGrantSupabaseClient {
  if (!isCapabilityGrantSupabaseClient(value)) throw new Error('Invalid capability grant Supabase client')
  return value
}

function isCapabilityGrantSupabaseClient(value: unknown): value is CapabilityGrantSupabaseClient {
  if (typeof value !== 'object' || value === null) return false
  // Reflect.get no atraviesa prototype chain. El supabase client real expone
  // `from()` desde SupabaseClient.prototype. Verificamos con bracket access,
  // que sí incluye la cadena de prototipos, en lugar de Reflect.get.
  return typeof (value as { from?: unknown }).from === 'function'
}

function isAuthBaseSupabaseClient(value: unknown): value is AuthBaseSupabaseClient {
  if (typeof value !== 'object' || value === null) return false
  const v = value as {
    auth?: { getUser?: unknown }
    rpc?: unknown
    from?: unknown
  }
  return (
    typeof v.auth === 'object' &&
    v.auth !== null &&
    typeof v.auth.getUser === 'function' &&
    typeof v.rpc === 'function' &&
    typeof v.from === 'function'
  )
}
