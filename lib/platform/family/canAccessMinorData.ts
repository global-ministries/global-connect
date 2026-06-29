import { normalizePlatformPersonaId } from '@/lib/platform/family'
import { type NormalizedFamilyRelation } from '@/lib/platform/adapters/family'
import { type PlatformSession } from '@/lib/platform/session/types'

export type MinorAccessActorPersona = {
  personaId: string
}

export type MinorAccessTargetPersona = {
  personaId: string
  hasAuthAccount: boolean | null
}

export type MinorAccessReason =
  | 'self'
  | 'explicit_guardian'

export type MinorAccessDeniedReason =
  | 'no_actor'
  | 'no_target'
  | 'no_platform_session'
  | 'minor_no_auth'
  | 'insufficient_relation'

export type CanAccessMinorDataResult =
  | { allowed: true; reason: MinorAccessReason }
  | { allowed: false; reason: MinorAccessDeniedReason }

export function canAccessMinorData(params: {
  actor: MinorAccessActorPersona | null | undefined
  target: MinorAccessTargetPersona | null | undefined
  relations: readonly NormalizedFamilyRelation[]
  session: PlatformSession | null | undefined
}): CanAccessMinorDataResult {
  const { actor, target, relations, session } = params
  if (session == null) {
    return { allowed: false, reason: 'no_platform_session' }
  }

  const actorId = normalizePlatformPersonaId(actor?.personaId)
  if (!actorId) {
    return { allowed: false, reason: 'no_actor' }
  }

  const targetId = normalizePlatformPersonaId(target?.personaId)
  if (!targetId) {
    return { allowed: false, reason: 'no_target' }
  }

  if (actorId === targetId) {
    return { allowed: true, reason: 'self' }
  }

  const guardianRelation = relations.find(
    (relation) => relation.relatedPersonaId === targetId && (relation.tipoRelacion === 'padre' || relation.tipoRelacion === 'tutor'),
  )

  if (target?.hasAuthAccount === false) {
    return guardianRelation
      ? { allowed: true, reason: 'explicit_guardian' }
      : { allowed: false, reason: 'minor_no_auth' }
  }

  return guardianRelation
    ? { allowed: true, reason: 'explicit_guardian' }
    : { allowed: false, reason: 'insufficient_relation' }
}
