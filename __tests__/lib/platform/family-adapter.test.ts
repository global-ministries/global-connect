import { resolveFamilyRelations } from '@/lib/platform/adapters/family'
import type { FamilyReadRepository, FamilyRelation } from '@/lib/platform/adapters/family'
import type { PlatformSession } from '@/lib/platform/session/types'

const baseSession: PlatformSession = { personaId: 'persona-actor', subjectAuthId: 'auth-actor', globalRoles: [], contexts: [], capabilities: [] }

function createReader(relations: readonly FamilyRelation[]): FamilyReadRepository {
  return { findRelationsByPersonaId: jest.fn().mockResolvedValue(relations) }
}

function relation(overrides: Partial<FamilyRelation> & Pick<FamilyRelation, 'id' | 'personaId' | 'relatedPersonaId' | 'tipoRelacion'>): FamilyRelation {
  return { relatedHasAuthAccount: null, ...overrides }
}

describe('Family platform read adapter', () => {
  it('resolves normalized relations from the actor perspective and preserves order', async () => {
    const reader = createReader([
      relation({ id: 'rel-1', personaId: 'persona-actor', relatedPersonaId: 'persona-hijo', tipoRelacion: 'padre', relatedHasAuthAccount: false }),
      relation({ id: 'rel-2', personaId: 'persona-actor', relatedPersonaId: 'persona-conyuge', tipoRelacion: 'conyuge', relatedHasAuthAccount: true }),
    ])
    const result = await resolveFamilyRelations({ session: baseSession, reader })
    expect(reader.findRelationsByPersonaId).toHaveBeenCalledWith('persona-actor')
    expect(result).toEqual({
      ok: true,
      relations: [
        { relatedPersonaId: 'persona-hijo', relatedHasAuthAccount: false, tipoRelacion: 'padre', isReciprocal: false },
        { relatedPersonaId: 'persona-conyuge', relatedHasAuthAccount: true, tipoRelacion: 'conyuge', isReciprocal: true },
      ],
      audit: { decision: 'allowed', personaId: 'persona-actor', relationCount: 2 },
    })
  })

  it.each([
    { label: 'undefined session', session: undefined },
    { label: 'null session', session: null },
    { label: 'blank persona id', session: { ...baseSession, personaId: '   ' } },
  ] satisfies Array<{ label: string; session: PlatformSession | null | undefined }>)('fails closed for $label', async ({ session }) => {
    const reader = createReader([])
    const result = await resolveFamilyRelations({ session, reader })
    expect(reader.findRelationsByPersonaId).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, reason: 'session_required', relations: [], audit: { decision: 'denied', reason: 'session_required', relationCount: 0 } })
  })

  it('fails closed when the repository throws', async () => {
    const reader: FamilyReadRepository = { findRelationsByPersonaId: jest.fn().mockRejectedValue(new Error('database timeout')) }
    const result = await resolveFamilyRelations({ session: baseSession, reader })
    expect(result).toEqual({ ok: false, reason: 'adapter_read_failed', relations: [], audit: { decision: 'denied', reason: 'adapter_read_failed', personaId: 'persona-actor', relationCount: 0 } })
  })

  it('fails closed for invalid relation data', async () => {
    await expect(resolveFamilyRelations({ session: baseSession, reader: createReader([relation({ id: '', personaId: 'persona-actor', relatedPersonaId: 'persona-valida', tipoRelacion: 'padre' })]) })).resolves.toMatchObject({ ok: false, reason: 'invalid_family_data' })
    await expect(resolveFamilyRelations({ session: baseSession, reader: createReader([relation({ id: 'rel-bad', personaId: 'persona-actor', relatedPersonaId: '   ', tipoRelacion: 'padre' })]) })).resolves.toMatchObject({ ok: false, reason: 'invalid_family_data' })
    await expect(resolveFamilyRelations({ session: baseSession, reader: createReader([relation({ id: 'rel-bad', personaId: 'persona-actor', relatedPersonaId: 'persona-valida', tipoRelacion: 123 as unknown as string })]) })).resolves.toMatchObject({ ok: false, reason: 'invalid_family_data' })
  })

  it('normalizes tipoRelacion from the usuario2 perspective and preserves asymmetric types', async () => {
    const result = await resolveFamilyRelations({
      session: baseSession,
      reader: createReader([
        relation({ id: 'rel-padre', personaId: 'persona-padre', relatedPersonaId: 'persona-actor', tipoRelacion: 'padre' }),
        relation({ id: 'rel-tutor', personaId: 'persona-tutor', relatedPersonaId: 'persona-actor', tipoRelacion: 'tutor' }),
      ]),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected allowed')
    expect(result.relations).toEqual([
      { relatedPersonaId: 'persona-padre', relatedHasAuthAccount: null, tipoRelacion: 'hijo', isReciprocal: false },
      { relatedPersonaId: 'persona-tutor', relatedHasAuthAccount: null, tipoRelacion: 'tutor', isReciprocal: false },
    ])
  })

  it('silently skips relations with unknown tipoRelacion', async () => {
    const result = await resolveFamilyRelations({
      session: baseSession,
      reader: createReader([
        relation({ id: 'rel-known', personaId: 'persona-actor', relatedPersonaId: 'persona-conocida', tipoRelacion: 'hermano' }),
        relation({ id: 'rel-unknown', personaId: 'persona-actor', relatedPersonaId: 'persona-desconocida', tipoRelacion: 'autorizado' }),
      ]),
    })
    expect(result).toEqual({
      ok: true,
      relations: [{ relatedPersonaId: 'persona-conocida', relatedHasAuthAccount: null, tipoRelacion: 'hermano', isReciprocal: true }],
      audit: { decision: 'allowed', personaId: 'persona-actor', relationCount: 1 },
    })
  })

  it('returns an empty allowed result when the actor has no relations', async () => {
    const result = await resolveFamilyRelations({ session: baseSession, reader: createReader([]) })
    expect(result).toEqual({ ok: true, relations: [], audit: { decision: 'allowed', personaId: 'persona-actor', relationCount: 0 } })
  })

  it('does not produce operational capabilities from family relations', async () => {
    const result = await resolveFamilyRelations({ session: baseSession, reader: createReader([relation({ id: 'rel-1', personaId: 'persona-actor', relatedPersonaId: 'persona-hijo', tipoRelacion: 'padre' })]) })
    expect(JSON.stringify(result)).not.toContain('ninos.room.read')
    expect(JSON.stringify(result)).not.toContain('grupos_vida.stage.read')
  })
})
