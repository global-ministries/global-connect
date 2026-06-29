import { canAccessMinorData } from '@/lib/platform/family/canAccessMinorData'
import type { NormalizedFamilyRelation } from '@/lib/platform/adapters/family'
import type { PlatformSession } from '@/lib/platform/session/types'

const session: PlatformSession = { personaId: 'persona-actor', subjectAuthId: 'auth-actor', globalRoles: [], contexts: [], capabilities: [] }

function relationTo(targetId: string, tipoRelacion: NormalizedFamilyRelation['tipoRelacion']): NormalizedFamilyRelation {
  return { relatedPersonaId: targetId, relatedHasAuthAccount: null, tipoRelacion, isReciprocal: tipoRelacion === 'conyuge' || tipoRelacion === 'hermano' }
}

describe('canAccessMinorData', () => {
  it('allows self-access for matching persona ids', () => {
    expect(canAccessMinorData({ actor: { personaId: 'persona-menor' }, target: { personaId: 'persona-menor', hasAuthAccount: false }, relations: [], session })).toEqual({ allowed: true, reason: 'self' })
  })

  it.each([
    { tipoRelacion: 'padre' as const, label: 'padre', hasAuthAccount: false },
    { tipoRelacion: 'tutor' as const, label: 'tutor', hasAuthAccount: false },
    { tipoRelacion: 'padre' as const, label: 'padre with auth', hasAuthAccount: true },
  ])('allows $label to access minor data as explicit guardian', ({ tipoRelacion, hasAuthAccount }) => {
    expect(canAccessMinorData({ actor: { personaId: 'persona-tutor' }, target: { personaId: 'persona-menor', hasAuthAccount }, relations: [relationTo('persona-menor', tipoRelacion)], session })).toEqual({ allowed: true, reason: 'explicit_guardian' })
  })

  it.each([
    { tipoRelacion: 'conyuge' as const, label: 'cónyuge' },
    { tipoRelacion: 'hermano' as const, label: 'hermano' },
    { tipoRelacion: 'otro_familiar' as const, label: 'otro_familiar' },
  ])('denies $label access to minor data for insufficient relation', ({ tipoRelacion }) => {
    expect(canAccessMinorData({ actor: { personaId: 'persona-familiar' }, target: { personaId: 'persona-menor', hasAuthAccount: false }, relations: [relationTo('persona-menor', tipoRelacion)], session })).toEqual({ allowed: false, reason: 'minor_no_auth' })
  })

  it('denies access when no relation exists', () => {
    expect(canAccessMinorData({ actor: { personaId: 'persona-externa' }, target: { personaId: 'persona-menor', hasAuthAccount: true }, relations: [], session })).toEqual({ allowed: false, reason: 'insufficient_relation' })
  })

  it.each([
    { label: 'missing session', session: null, actor: { personaId: 'persona-actor' }, target: { personaId: 'persona-menor', hasAuthAccount: false }, expected: 'no_platform_session' },
    { label: 'missing actor', session, actor: null, target: { personaId: 'persona-menor', hasAuthAccount: false }, expected: 'no_actor' },
    { label: 'blank actor id', session, actor: { personaId: '   ' }, target: { personaId: 'persona-menor', hasAuthAccount: false }, expected: 'no_actor' },
    { label: 'missing target', session, actor: { personaId: 'persona-actor' }, target: null, expected: 'no_target' },
    { label: 'blank target id', session, actor: { personaId: 'persona-actor' }, target: { personaId: '   ', hasAuthAccount: false }, expected: 'no_target' },
  ])("denies access with '$expected' for $label", ({ session: s, actor, target, expected }) => {
    expect(canAccessMinorData({ actor, target, relations: [], session: s as PlatformSession | null })).toEqual({ allowed: false, reason: expected })
  })

  it('follows precedence: session, actor, target, self, then relation check', () => {
    expect(canAccessMinorData({ actor: { personaId: 'a' }, target: { personaId: 'a', hasAuthAccount: false }, relations: [], session: null })).toEqual({ allowed: false, reason: 'no_platform_session' })
    expect(canAccessMinorData({ actor: null, target: { personaId: 'a', hasAuthAccount: false }, relations: [], session })).toEqual({ allowed: false, reason: 'no_actor' })
    expect(canAccessMinorData({ actor: { personaId: 'a' }, target: null, relations: [], session })).toEqual({ allowed: false, reason: 'no_target' })
    expect(canAccessMinorData({ actor: { personaId: 'a' }, target: { personaId: 'a', hasAuthAccount: false }, relations: [], session })).toEqual({ allowed: true, reason: 'self' })
  })
})
