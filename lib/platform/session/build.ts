import type { PlatformSessionBuildInput, PlatformSessionBuildResult, PlatformSessionWarning } from '@/lib/platform/session/types'

export async function buildPlatformSession(input: PlatformSessionBuildInput): Promise<PlatformSessionBuildResult> {
  const warnings = input.clientPersonaId ? [clientPersonaWarning(input.clientPersonaId)] : []

  if (!input.subjectAuthId?.trim()) {
    return { ok: false, reason: 'unauthenticated', warnings }
  }

  const subjectAuthId = input.subjectAuthId.trim()
  let persona
  try {
    persona = await input.personaLookup.findByAuthId(subjectAuthId)
  } catch {
    return { ok: false, reason: 'persona_lookup_failed', warnings }
  }

  if (!persona || persona.authId !== subjectAuthId) {
    return { ok: false, reason: 'persona_not_linked_to_backend_auth', warnings }
  }

  return {
    ok: true,
    session: {
      personaId: persona.id,
      subjectAuthId,
      globalRoles: [],
      contexts: [],
      capabilities: [],
    },
    warnings,
  }
}

function clientPersonaWarning(clientPersonaId: string): PlatformSessionWarning {
  return { code: 'client_persona_id_ignored', clientPersonaId }
}
