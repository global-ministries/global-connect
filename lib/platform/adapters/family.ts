import { type PlatformSession } from '@/lib/platform/session/types'
import { normalizePlatformPersonaId, type PlatformFamilyRelationType, invertPlatformFamilyRelation, isPlatformReciprocalFamilyRelation, normalizePlatformFamilyRelationType } from '@/lib/platform/family'

export type FamilyRelation = {
  id: string
  personaId: string
  relatedPersonaId: string
  tipoRelacion: string
  relatedHasAuthAccount: boolean | null
}

export type FamilyReadRepository = {
  findRelationsByPersonaId(personaId: string): Promise<readonly FamilyRelation[]>
}

export type FamilyAdapterInput = {
  session: PlatformSession | null | undefined
  reader: FamilyReadRepository
}

export type NormalizedFamilyRelation = {
  relatedPersonaId: string
  relatedHasAuthAccount: boolean | null
  tipoRelacion: PlatformFamilyRelationType
  isReciprocal: boolean
}

export type FamilyAdapterDeniedReason =
  | 'session_required'
  | 'adapter_read_failed'
  | 'invalid_family_data'

export type FamilyAdapterAudit = {
  decision: 'allowed' | 'denied'
  /** Set only when `decision` is `'denied'`. */
  reason?: FamilyAdapterDeniedReason
  personaId?: string
  relationCount: number
}

export type FamilyAdapterResult =
  | { ok: true; relations: readonly NormalizedFamilyRelation[]; audit: FamilyAdapterAudit }
  | { ok: false; reason: FamilyAdapterDeniedReason; relations: []; audit: FamilyAdapterAudit }

export async function resolveFamilyRelations(input: FamilyAdapterInput): Promise<FamilyAdapterResult> {
  const personaId = normalizePlatformPersonaId(input.session?.personaId)
  if (!personaId) {
    return denied('session_required')
  }

  let rawRelations: readonly FamilyRelation[]
  try {
    rawRelations = await input.reader.findRelationsByPersonaId(personaId)
  } catch {
    return denied('adapter_read_failed', personaId)
  }

  const normalized = normalizeRelations(rawRelations, personaId)
  if (!normalized.ok) {
    return denied(normalized.reason, personaId)
  }

  return {
    ok: true,
    relations: normalized.relations,
    audit: { decision: 'allowed', personaId, relationCount: normalized.relations.length },
  }
}

type NormalizationResult =
  | { ok: true; relations: NormalizedFamilyRelation[] }
  | { ok: false; reason: 'invalid_family_data' }

function normalizeRelations(relations: readonly FamilyRelation[], actorPersonaId: string): NormalizationResult {
  const normalizedRelations: NormalizedFamilyRelation[] = []
  for (const relation of relations) {
    const relPersonaId = normalizePlatformPersonaId(relation.personaId)
    const relRelatedPersonaId = normalizePlatformPersonaId(relation.relatedPersonaId)
    if (!relation.id?.trim() || !relPersonaId || !relRelatedPersonaId || typeof relation.tipoRelacion !== 'string') {
      return { ok: false, reason: 'invalid_family_data' }
    }

    const rawType = normalizePlatformFamilyRelationType(relation.tipoRelacion)
    if (!rawType) {
      continue
    }

    const isActorOnPersonaSide = relPersonaId === actorPersonaId
    let normalizedType = rawType
    if (!isActorOnPersonaSide) {
      const inverted = invertPlatformFamilyRelation(rawType)
      if (inverted !== null) {
        normalizedType = inverted
      }
    }

    const targetPersonaId = isActorOnPersonaSide ? relRelatedPersonaId : relPersonaId
    // When the actor is on the relatedPersonaId side, the persona-side auth state is not on the relation row.
    const targetHasAuthAccount = isActorOnPersonaSide ? relation.relatedHasAuthAccount : null

    normalizedRelations.push({
      relatedPersonaId: targetPersonaId,
      relatedHasAuthAccount: targetHasAuthAccount,
      tipoRelacion: normalizedType,
      isReciprocal: isPlatformReciprocalFamilyRelation(normalizedType),
    })
  }
  return { ok: true, relations: normalizedRelations }
}

function denied(reason: FamilyAdapterDeniedReason, personaId?: string): FamilyAdapterResult {
  return {
    ok: false,
    reason,
    relations: [],
    audit: { decision: 'denied', reason, ...(personaId ? { personaId } : {}), relationCount: 0 },
  }
}
