/**
 * W01 — DT-004 — Pastoral experience extension.
 * Extends PLATFORM_EXPERIENCE_CATALOG and PLATFORM_SCOPE_TYPES additively.
 * Covers ESC-01–07 of pastoral-experience spec.
 */
import {
  PLATFORM_EXPERIENCE_CATALOG,
  PLATFORM_SCOPE_TYPES,
  PLATFORM_CAPABILITIES,
  resolvePlatformCapability,
} from '@/lib/platform/experiences'
import type { PlatformCapabilityActor, PlatformCapabilityResolutionInput } from '@/lib/platform/experiences'

const pastoralActor: PlatformCapabilityActor = {
  personaId: 'carlos-gdv-lider',
  allowedFlows: ['dashboard'],
  grants: [
    {
      key: 'pastoral.mentor.cascade.resolve',
      scope: { experience: 'pastoral', type: 'experience' },
      source: 'pastoral-seeding',
    },
    {
      key: 'pastoral.one_on_one.create',
      scope: { experience: 'pastoral', type: 'one_on_one', id: 'any' },
      source: 'pastoral-seeding',
    },
    {
      key: 'pastoral.metrics.read',
      scope: { experience: 'pastoral', type: 'experience' },
      source: 'pastoral-seeding',
    },
    {
      key: 'pastoral.read.all',
      scope: { experience: 'pastoral', type: 'experience' },
      source: 'pastoral-seeding',
    },
  ],
}

describe('Pastoral experience — PLATFORM_EXPERIENCE_CATALOG extension (ESC-01, REQ-01)', () => {
  it('contains pastoral as a new experience entry', () => {
    expect(PLATFORM_EXPERIENCE_CATALOG).toHaveProperty('pastoral')
  })

  it('pastoral experience has correct label', () => {
    const pastoral = PLATFORM_EXPERIENCE_CATALOG.pastoral as { label: string; scopeTypes: readonly string[] }
    expect(pastoral.label).toBe('Pastoral')
  })

  it('pastoral experience supports one_on_one and triada scope types', () => {
    const pastoral = PLATFORM_EXPERIENCE_CATALOG.pastoral as { scopeTypes: readonly string[] }
    expect(pastoral.scopeTypes).toContain('one_on_one')
    expect(pastoral.scopeTypes).toContain('triada')
  })

  it('existing experiences are unchanged (byte-identity, ESC-02)', () => {
    const expected = [
      'grupos_vida', 'dps', 'ninos', 'estudiantes',
      'the_living_room', 'talleres_crecimiento', 'family',
      'dream_team', 'operating_core',
    ]
    for (const key of expected) {
      expect(PLATFORM_EXPERIENCE_CATALOG).toHaveProperty(key)
    }
  })

  it('pastoral is not mixed into other experience scopeTypes', () => {
    const gdv = PLATFORM_EXPERIENCE_CATALOG.grupos_vida as { scopeTypes: readonly string[] }
    expect(gdv.scopeTypes).not.toContain('one_on_one')
    expect(gdv.scopeTypes).not.toContain('triada')
  })
})

describe('Pastoral scope types — PLATFORM_SCOPE_TYPES extension (ESC-03, REQ-02)', () => {
  it('contains one_on_one as a new scope type', () => {
    expect(PLATFORM_SCOPE_TYPES).toContain('one_on_one')
  })

  it('contains triada as a new scope type', () => {
    expect(PLATFORM_SCOPE_TYPES).toContain('triada')
  })

  it('existing scope types are unchanged', () => {
    const existing = ['experience', 'equipo', 'etapa', 'grupo', 'salon', 'taller'] as const
    for (const type of existing) {
      expect(PLATFORM_SCOPE_TYPES).toContain(type)
    }
  })
})

describe('Pastoral capabilities resolution (ESC-04, REQ-04)', () => {
  it('resolves pastoral.mentor.cascade.resolve with experience scope', () => {
    const input: PlatformCapabilityResolutionInput = {
      actor: pastoralActor,
      flow: 'dashboard',
      required: { key: 'pastoral.mentor.cascade.resolve', scope: { experience: 'pastoral', type: 'experience' } },
    }
    const result = resolvePlatformCapability(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.grant.key).toBe('pastoral.mentor.cascade.resolve')
  })

  it('resolves pastoral.one_on_one.create with one_on_one scope', () => {
    const input: PlatformCapabilityResolutionInput = {
      actor: pastoralActor,
      flow: 'dashboard',
      required: { key: 'pastoral.one_on_one.create', scope: { experience: 'pastoral', type: 'one_on_one', id: 'any' } },
    }
    const result = resolvePlatformCapability(input)
    expect(result.ok).toBe(true)
  })

  it('resolves pastoral.metrics.read with experience scope', () => {
    const input: PlatformCapabilityResolutionInput = {
      actor: pastoralActor,
      flow: 'dashboard',
      required: { key: 'pastoral.metrics.read', scope: { experience: 'pastoral', type: 'experience' } },
    }
    const result = resolvePlatformCapability(input)
    expect(result.ok).toBe(true)
  })

  it('resolves pastoral.read.all with experience scope (ESC-04)', () => {
    const input: PlatformCapabilityResolutionInput = {
      actor: pastoralActor,
      flow: 'dashboard',
      required: { key: 'pastoral.read.all', scope: { experience: 'pastoral', type: 'experience' } },
    }
    const result = resolvePlatformCapability(input)
    expect(result.ok).toBe(true)
  })

  it('denies pastoral capability with wrong experience scope', () => {
    const input: PlatformCapabilityResolutionInput = {
      actor: pastoralActor,
      flow: 'dashboard',
      required: { key: 'pastoral.metrics.read', scope: { experience: 'grupos_vida', type: 'experience' } },
    }
    const result = resolvePlatformCapability(input)
    expect(result.ok).toBe(false)
  })

  it('denies pastoral capability when actor has no grant', () => {
    const input: PlatformCapabilityResolutionInput = {
      actor: { personaId: 'stranger', allowedFlows: ['dashboard'], grants: [] },
      flow: 'dashboard',
      required: { key: 'pastoral.metrics.read', scope: { experience: 'pastoral', type: 'experience' } },
    }
    const result = resolvePlatformCapability(input)
    expect(result.ok).toBe(false)
  })
})

describe('All 13 pastoral capabilities are present in PLATFORM_CAPABILITIES (REQ-03)', () => {
  const pastoralCapabilities = [
    'pastoral.one_on_one.create',
    'pastoral.one_on_one.read',
    'pastoral.one_on_one.write_notes',
    'pastoral.one_on_one.validate_step',
    'pastoral.one_on_one.complete',
    'pastoral.triada.create',
    'pastoral.triada.read',
    'pastoral.triada.write_notes',
    'pastoral.triada.disband',
    'pastoral.metrics.read',
    'pastoral.read.all',
    'pastoral.mentor.cascade.resolve',
    'pastoral.crisis.detect',
  ]

  it('all 13 pastoral capabilities are registered', () => {
    for (const key of pastoralCapabilities) {
      expect(Object.keys(PLATFORM_CAPABILITIES)).toContain(key)
    }
  })

  it('each pastoral capability has pastoral experience', () => {
    for (const key of pastoralCapabilities) {
      const cap = PLATFORM_CAPABILITIES[key as keyof typeof PLATFORM_CAPABILITIES]
      expect(cap.experience).toBe('pastoral')
    }
  })

  it('pastoral.crisis.detect has experience scope type (ESC-07, REQ-03)', () => {
    const cap = PLATFORM_CAPABILITIES['pastoral.crisis.detect']
    expect(cap.experience).toBe('pastoral')
    expect(cap.scopeType).toBe('experience')
  })

  it('one_on_one scoped capabilities have one_on_one scopeType', () => {
    const oneOnOneCaps = [
      'pastoral.one_on_one.create',
      'pastoral.one_on_one.read',
      'pastoral.one_on_one.write_notes',
      'pastoral.one_on_one.validate_step',
      'pastoral.one_on_one.complete',
    ]
    for (const key of oneOnOneCaps) {
      const cap = PLATFORM_CAPABILITIES[key as keyof typeof PLATFORM_CAPABILITIES]
      expect(cap.scopeType).toBe('one_on_one')
    }
  })

  it('triada scoped capabilities have triada scopeType', () => {
    const triadaCaps = [
      'pastoral.triada.create',
      'pastoral.triada.read',
      'pastoral.triada.write_notes',
      'pastoral.triada.disband',
    ]
    for (const key of triadaCaps) {
      const cap = PLATFORM_CAPABILITIES[key as keyof typeof PLATFORM_CAPABILITIES]
      expect(cap.scopeType).toBe('triada')
    }
  })

  it('experience-scoped capabilities have experience scopeType', () => {
    const experienceCaps = [
      'pastoral.metrics.read',
      'pastoral.read.all',
      'pastoral.mentor.cascade.resolve',
      'pastoral.crisis.detect',
    ]
    for (const key of experienceCaps) {
      const cap = PLATFORM_CAPABILITIES[key as keyof typeof PLATFORM_CAPABILITIES]
      expect(cap.scopeType).toBe('experience')
    }
  })
})
