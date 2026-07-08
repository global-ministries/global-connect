import {
  PLATFORM_CAPABILITIES,
  PLATFORM_EXPERIENCE_CATALOG,
  resolvePlatformCapability,
} from '@/lib/platform/experiences'
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

  it('fails closed without throwing for prototype-inherited scope experience keys', () => {
    const inheritedKeys = ['constructor', 'toString', '__proto__']
    const requiredScopeResults = inheritedKeys.map((experience) => resolvePlatformCapability({
      ...gdvReadInput,
      required: { key: 'grupos_vida.stage.read', scope: { experience, type: 'etapa', id: 'adultos' } },
    }))
    const grantScopeResults = inheritedKeys.map((experience) => resolvePlatformCapability({
      ...gdvReadInput,
      actor: {
        ...authorizedActor,
        grants: [{ ...gdvStageGrant, scope: { experience, type: 'etapa', id: 'adultos' } }],
      },
    }))

    expect(requiredScopeResults.map((result) => result.ok ? null : result.reason)).toEqual([
      'unknown_required_scope',
      'unknown_required_scope',
      'unknown_required_scope',
    ])
    expect(grantScopeResults.map((result) => result.ok ? null : result.reason)).toEqual([
      'grant_scope_unknown',
      'grant_scope_unknown',
      'grant_scope_unknown',
    ])
  })

  it('keeps scope id validation bounded to documented characters and length', () => {
    const maxLengthScopeId = `a${'b'.repeat(63)}`
    const validBoundaryResult = resolvePlatformCapability({
      ...gdvReadInput,
      actor: {
        ...authorizedActor,
        grants: [{ ...gdvStageGrant, scope: { experience: 'grupos_vida', type: 'etapa', id: maxLengthScopeId } }],
      },
      required: { key: 'grupos_vida.stage.read', scope: { experience: 'grupos_vida', type: 'etapa', id: maxLengthScopeId } },
    })
    const malformedResults = ['-adultos', `a${'b'.repeat(64)}`].map((id) => resolvePlatformCapability({
      ...gdvReadInput,
      required: { key: 'grupos_vida.stage.read', scope: { experience: 'grupos_vida', type: 'etapa', id } },
    }))

    expect(validBoundaryResult).toMatchObject({
      ok: true,
      audit: { requiredScope: `grupos_vida:etapa:${maxLengthScopeId}` },
    })
    expect(malformedResults.map((result) => result.ok ? null : result.reason)).toEqual([
      'malformed_required_scope',
      'malformed_required_scope',
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

describe('Dream Team S2 capabilities (hybrid model)', () => {
  const actorBase: PlatformCapabilityActor = {
    personaId: 'ana',
    allowedFlows: ['dashboard'],
    grants: [],
  }

  function makeInput(
    key: string,
    requiredScope: { experience: string; type: string; id?: string },
    grants: PlatformCapabilityActor['grants'] = [],
  ): PlatformCapabilityResolutionInput {
    return {
      actor: { ...actorBase, grants },
      flow: 'dashboard',
      required: { key, scope: requiredScope },
    }
  }

  describe('catalog', () => {
    it('includes dream_team with experience and equipo scope types', () => {
      expect(PLATFORM_EXPERIENCE_CATALOG).toHaveProperty('dream_team')
      const dreamTeam = (PLATFORM_EXPERIENCE_CATALOG as Record<string, { label: string; scopeTypes: readonly string[] }>).dream_team
      expect(dreamTeam.label).toBe('Dream Team')
      expect(dreamTeam.scopeTypes).toEqual(['experience', 'equipo'])
    })

    it('extends estudiantes with equipo scope type while preserving salon', () => {
      const estudiantes = (PLATFORM_EXPERIENCE_CATALOG as Record<string, { scopeTypes: readonly string[] }>).estudiantes
      expect(estudiantes.scopeTypes).toContain('equipo')
      expect(estudiantes.scopeTypes).toContain('salon')
    })

    it('preserves all Fase 1 experience catalogs', () => {
      const expected = [
        'grupos_vida',
        'dps',
        'ninos',
        'estudiantes',
        'the_living_room',
        'talleres_crecimiento',
        'family',
      ]
      for (const key of expected) {
        expect(PLATFORM_EXPERIENCE_CATALOG).toHaveProperty(key)
      }
    })
  })

  describe('generic dream_team capabilities', () => {
    it('resolves dream_team.serve with experience scope', () => {
      const input = makeInput('dream_team.serve', { experience: 'dream_team', type: 'experience' }, [
        { key: 'dream_team.serve', scope: { experience: 'dream_team', type: 'experience' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.grant.scope).toEqual({ experience: 'dream_team', type: 'experience' })
    })

    it('resolves dream_team.lead with equipo scope', () => {
      const input = makeInput('dream_team.lead', { experience: 'dream_team', type: 'equipo', id: 'produccion-tecnica' }, [
        { key: 'dream_team.lead', scope: { experience: 'dream_team', type: 'equipo', id: 'produccion-tecnica' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.grant.scope).toEqual({ experience: 'dream_team', type: 'equipo', id: 'produccion-tecnica' })
    })

    it('resolves dream_team.coordinate with equipo scope', () => {
      const input = makeInput('dream_team.coordinate', { experience: 'dream_team', type: 'equipo', id: 'produccion-tecnica' }, [
        { key: 'dream_team.coordinate', scope: { experience: 'dream_team', type: 'equipo', id: 'produccion-tecnica' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(true)
    })

    it('resolves dream_team.director.coordinate with experience scope', () => {
      const input = makeInput('dream_team.director.coordinate', { experience: 'dream_team', type: 'experience' }, [
        { key: 'dream_team.director.coordinate', scope: { experience: 'dream_team', type: 'experience' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(true)
    })

    it('resolves dream_team.requirements.manage with experience scope', () => {
      const input = makeInput('dream_team.requirements.manage', { experience: 'dream_team', type: 'experience' }, [
        { key: 'dream_team.requirements.manage', scope: { experience: 'dream_team', type: 'experience' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(true)
    })

    it('resolves dream_team.metrics.read with experience scope', () => {
      const input = makeInput('dream_team.metrics.read', { experience: 'dream_team', type: 'experience' }, [
        { key: 'dream_team.metrics.read', scope: { experience: 'dream_team', type: 'experience' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(true)
    })

    it('resolves dream_team.gdv.lead with grupo scope', () => {
      const input = makeInput('dream_team.gdv.lead', { experience: 'grupos_vida', type: 'grupo', id: 'transit-2-anio' }, [
        { key: 'dream_team.gdv.lead', scope: { experience: 'grupos_vida', type: 'grupo', id: 'transit-2-anio' }, source: 'dream-team-gdv' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.grant.scope).toEqual({ experience: 'grupos_vida', type: 'grupo', id: 'transit-2-anio' })
    })
  })

  describe('domain-specific team capabilities', () => {
    it('resolves dps.team.serve with equipo scope', () => {
      const input = makeInput('dps.team.serve', { experience: 'dps', type: 'equipo', id: 'camara' }, [
        { key: 'dps.team.serve', scope: { experience: 'dps', type: 'equipo', id: 'camara' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(true)
    })

    it('resolves dps.team.lead with equipo scope', () => {
      const input = makeInput('dps.team.lead', { experience: 'dps', type: 'equipo', id: 'camara' }, [
        { key: 'dps.team.lead', scope: { experience: 'dps', type: 'equipo', id: 'camara' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(true)
    })

    it('resolves dps.team.director with equipo scope', () => {
      const input = makeInput('dps.team.director', { experience: 'dps', type: 'equipo', id: 'camara' }, [
        { key: 'dps.team.director', scope: { experience: 'dps', type: 'equipo', id: 'camara' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(true)
    })

    it('resolves estudiantes.team.serve with equipo scope', () => {
      const input = makeInput('estudiantes.team.serve', { experience: 'estudiantes', type: 'equipo', id: 'transit' }, [
        { key: 'estudiantes.team.serve', scope: { experience: 'estudiantes', type: 'equipo', id: 'transit' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(true)
    })

    it('resolves estudiantes.team.lead with equipo scope', () => {
      const input = makeInput('estudiantes.team.lead', { experience: 'estudiantes', type: 'equipo', id: 'transit' }, [
        { key: 'estudiantes.team.lead', scope: { experience: 'estudiantes', type: 'equipo', id: 'transit' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(true)
    })

    it('resolves talleres_crecimiento.team.serve with taller scope', () => {
      const input = makeInput('talleres_crecimiento.team.serve', { experience: 'talleres_crecimiento', type: 'taller', id: 'punto-de-partida' }, [
        { key: 'talleres_crecimiento.team.serve', scope: { experience: 'talleres_crecimiento', type: 'taller', id: 'punto-de-partida' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(true)
    })

    it('resolves ninos.team.serve with salon scope', () => {
      const input = makeInput('ninos.team.serve', { experience: 'ninos', type: 'salon', id: 'waumbaland-3-4' }, [
        { key: 'ninos.team.serve', scope: { experience: 'ninos', type: 'salon', id: 'waumbaland-3-4' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(true)
    })

    it('resolves the_living_room.team.serve with experience scope', () => {
      const input = makeInput('the_living_room.team.serve', { experience: 'the_living_room', type: 'experience' }, [
        { key: 'the_living_room.team.serve', scope: { experience: 'the_living_room', type: 'experience' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(true)
    })
  })

  describe('negative cases', () => {
    it('rejects dream_team.serve required with dps experience as conflicting_scope', () => {
      const input = makeInput('dream_team.serve', { experience: 'dps', type: 'equipo' }, [
        { key: 'dream_team.serve', scope: { experience: 'dps', type: 'equipo' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('conflicting_scope')
    })

    it('rejects estudiantes.team.lead required with salon scope as conflicting_scope', () => {
      const input = makeInput('estudiantes.team.lead', { experience: 'estudiantes', type: 'salon' }, [
        { key: 'estudiantes.team.lead', scope: { experience: 'estudiantes', type: 'salon' }, source: 'dream-team' },
      ])
      const result = resolvePlatformCapability(input)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('conflicting_scope')
    })
  })

  describe('Ana integration case', () => {
    const ana: PlatformCapabilityActor = {
      personaId: 'ana',
      allowedFlows: ['dashboard'],
      grants: [
        { key: 'dream_team.serve', scope: { experience: 'dream_team', type: 'experience' }, source: 'dream-team' },
        { key: 'dream_team.lead', scope: { experience: 'dream_team', type: 'equipo', id: 'camara' }, source: 'dream-team' },
        { key: 'dps.team.serve', scope: { experience: 'dps', type: 'equipo', id: 'camara' }, source: 'dream-team' },
        { key: 'estudiantes.team.lead', scope: { experience: 'estudiantes', type: 'equipo', id: 'transit' }, source: 'dream-team' },
      ],
    }

    it('allows all four Ana grants independently with only matching signatures evaluated', () => {
      const cases: Array<[string, { experience: string; type: string; id?: string }, string]> = [
        ['dream_team.serve', { experience: 'dream_team', type: 'experience' }, 'dream_team:experience'],
        ['dream_team.lead', { experience: 'dream_team', type: 'equipo', id: 'camara' }, 'dream_team:equipo:camara'],
        ['dps.team.serve', { experience: 'dps', type: 'equipo', id: 'camara' }, 'dps:equipo:camara'],
        ['estudiantes.team.lead', { experience: 'estudiantes', type: 'equipo', id: 'transit' }, 'estudiantes:equipo:transit'],
      ]

      for (const [key, scope, signature] of cases) {
        const result = resolvePlatformCapability({ actor: ana, flow: 'dashboard', required: { key, scope } })
        expect(result.ok).toBe(true)
        if (!result.ok) continue
        expect(result.audit.evaluatedGrantSignatures).toEqual([`${key}|${signature}`])
      }
    })
  })
})
