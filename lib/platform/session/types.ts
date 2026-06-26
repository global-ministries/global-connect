export type PlatformSessionContext = { experience: string; scopeType: string; scopeId?: string; label: string }

export type PlatformSessionCapability = { key: string; experience: string; scopeType: string; scopeId?: string; source: string }

export type PlatformSession = {
  personaId: string
  /** Backend Supabase Auth subject; this is the session auth source of truth. */
  subjectAuthId: string
  /** PR1a does not derive authz grants yet; PR2+ will populate these from backend sources only. */
  globalRoles: string[]
  contexts: PlatformSessionContext[]
  capabilities: PlatformSessionCapability[]
}

export type PlatformSessionPersona = {
  id: string
  authId: string | null
}

export type PlatformSessionWarning = { code: 'client_persona_id_ignored'; clientPersonaId: string }

export type PlatformSessionBuildResult =
  | { ok: true; session: PlatformSession; warnings: PlatformSessionWarning[] }
  | { ok: false; reason: 'unauthenticated' | 'persona_not_linked_to_backend_auth' | 'persona_lookup_failed'; warnings: PlatformSessionWarning[] }

export type PlatformPersonaLookup = {
  findByAuthId(authId: string): Promise<PlatformSessionPersona | null>
}

export type PlatformSessionBuildInput = {
  subjectAuthId: string | null | undefined
  clientPersonaId?: string | null
  personaLookup: PlatformPersonaLookup
}
