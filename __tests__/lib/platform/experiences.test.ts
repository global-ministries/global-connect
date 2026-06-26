import { resolvePlatformCapability } from '@/lib/platform/experiences'
import type { PlatformCapabilityActor, PlatformCapabilityResolutionInput } from '@/lib/platform/experiences'

const gdvStageGrant = {
  key: 'grupos_vida.stage.read',
  scope: { experience: 'grupos_vida', type: 'etapa', id: 'adultos' },
  source: 'gdv-adapter',
}
const dpsMusicGrant = {
  key: 'dps.team.serve',
  scope: { experience: 'dps', type: 'equipo', id: 'musica' },
  source: 'dream-team',
}
const authorizedActor: PlatformCapabilityActor = {
  personaId: 'persona-actor-1',
  allowedFlows: ['dashboard'],
  grants: [dpsMusicGrant, gdvStageGrant],
}
const gdvReadInput: PlatformCapabilityResolutionInput = {
  actor: authorizedActor,
  flow: 'dashboard',
  required: {
    key: 'grupos_vida.stage.read',
    scope: { experience: 'grupos_vida', type: 'etapa', id: 'adultos' },
  },
}

describe('Platform experiences and scoped capabilities', () => {
  it('allows an allowlisted scoped capability and resolves grants deterministically', () => {
    const result = resolvePlatformCapability(gdvReadInput)

    expect(result).toEqual({
      ok: true,
      decision: 'allowed',
      grant: {
        key: 'grupos_vida.stage.read',
        scope: { experience: 'grupos_vida', type: 'etapa', id: 'adultos' },
        source: 'gdv-adapter',
      },
      audit: {
        actorPersonaId: 'persona-actor-1',
        decision: 'allowed',
        flow: 'dashboard',
        requiredCapability: 'grupos_vida.stage.read',
        requiredScope: 'grupos_vida:etapa:adultos',
        evaluatedGrantSignatures: ['grupos_vida.stage.read|grupos_vida:etapa:adultos'],
      },
    })
  })

  it('denies access outside actor, flow, or required capability boundaries', () => {
    const attempts = [
      resolvePlatformCapability({ ...gdvReadInput, actor: null }),
      resolvePlatformCapability({ ...gdvReadInput, flow: 'admin' }),
      resolvePlatformCapability({ ...gdvReadInput, required: { ...gdvReadInput.required, key: 'dps.admin.manage' } }),
      resolvePlatformCapability({ ...gdvReadInput, required: { ...gdvReadInput.required, key: 'dps.team.serve', scope: dpsMusicGrant.scope }, actor: { ...authorizedActor, grants: [gdvStageGrant] } }),
    ]

    expect(attempts.map((result) => result.ok ? null : result.reason)).toEqual([
      'actor_required',
      'flow_not_allowed',
      'unknown_capability',
      'missing_required_capability',
    ])
    for (const result of attempts) {
      expect(result).toMatchObject({ ok: false, decision: 'denied', audit: { decision: 'denied' } })
    }
  })

  it('fails closed for missing, malformed, or unknown required scopes', () => {
    const attempts = [
      resolvePlatformCapability({ ...gdvReadInput, required: { key: 'grupos_vida.stage.read' } }),
      resolvePlatformCapability({ ...gdvReadInput, required: { key: 'grupos_vida.stage.read', scope: { experience: 'grupos_vida', type: 'etapa', id: '../adultos' } } }),
      resolvePlatformCapability({ ...gdvReadInput, required: { key: 'grupos_vida.stage.read', scope: { experience: 'unknown', type: 'etapa', id: 'adultos' } } }),
    ]

    expect(attempts.map((result) => result.ok ? null : result.reason)).toEqual([
      'missing_required_scope',
      'malformed_required_scope',
      'unknown_required_scope',
    ])
  })

  it('fails closed for missing, malformed, unknown, duplicate, or conflicting grant scopes', () => {
    const cases: Array<[PlatformCapabilityActor['grants'], string]> = [
      [[{ ...gdvStageGrant, scope: null }], 'grant_scope_missing'],
      [[{ ...gdvStageGrant, scope: { experience: 'grupos_vida', type: 'etapa', id: '../adultos' } }], 'grant_scope_malformed'],
      [[{ ...gdvStageGrant, scope: { experience: 'grupos_vida', type: 'equipo', id: 'adultos' } }], 'grant_scope_unknown'],
      [[gdvStageGrant, { ...gdvStageGrant, source: 'duplicate-source' }], 'duplicate_scope'],
      [[{ ...gdvStageGrant, scope: { experience: 'dps', type: 'equipo', id: 'adultos' } }], 'conflicting_scope'],
    ]

    for (const [grants, reason] of cases) {
      const result = resolvePlatformCapability({ ...gdvReadInput, actor: { ...authorizedActor, grants } })
      expect(result).toMatchObject({ ok: false, decision: 'denied', reason, audit: { reason } })
    }
  })
})
