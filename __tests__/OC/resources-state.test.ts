/**
 * S16 TDD RED — resources-state pure functions.
 * Tests cover:
 * - validateKind for all 3 valid kinds + invalid kinds
 * - canOperate for active, archived, successor resources
 * - isVisibleTo for role match, capability match, both, neither
 * - buildSuccessorFromTransfer for valid transfer, no-op, archived prior
 * - validateCreateInput for valid + invalid kind + invalid tags
 */
import type {
  OperatingCoreResource,
  OperatingCoreResourceKind,
  CreateResourceInput,
  ResourceTransferRequest,
} from '@/lib/platform/operating-core/resources/resource-types'

// ---------------------------------------------------------------------------
// Static verification — constants match spec exactly
// ---------------------------------------------------------------------------

describe('OPERATING_CORE_RESOURCE_KINDS constant', () => {
  let OPERATING_CORE_RESOURCE_KINDS: readonly string[]

  beforeAll(async () => {
    const mod = await import('@/lib/platform/operating-core/resources/resource-types')
    OPERATING_CORE_RESOURCE_KINDS = mod.OPERATING_CORE_RESOURCE_KINDS
  })

  it('has exactly 3 values', () => {
    expect(OPERATING_CORE_RESOURCE_KINDS).toHaveLength(3)
  })

  it('contains link, file, video', () => {
    expect(OPERATING_CORE_RESOURCE_KINDS).toContain('link')
    expect(OPERATING_CORE_RESOURCE_KINDS).toContain('file')
    expect(OPERATING_CORE_RESOURCE_KINDS).toContain('video')
  })
})

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function makeResource(overrides: Partial<OperatingCoreResource> = {}): OperatingCoreResource {
  const now = '2026-07-20T12:00:00.000Z'
  return {
    id: 'resource-1',
    kind: 'link',
    title: 'Test Resource',
    description: null,
    category: 'documentation',
    tags: ['test'],
    area_experience_id: 'exp-1',
    visible_to_roles: [],
    visible_to_capabilities: [],
    created_by_persona_id: 'persona-1',
    created_at: now,
    archived_at: null,
    successor_of: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// validateKind
// ---------------------------------------------------------------------------

describe('validateKind', () => {
  let validateKind: (kind: unknown) => kind is OperatingCoreResourceKind

  beforeAll(async () => {
    const mod = await import('@/lib/platform/operating-core/resources/resource-state')
    validateKind = mod.validateKind
  })

  it('accepts link', () => {
    expect(validateKind('link')).toBe(true)
  })

  it('accepts file', () => {
    expect(validateKind('file')).toBe(true)
  })

  it('accepts video', () => {
    expect(validateKind('video')).toBe(true)
  })

  it('rejects audio (not in union)', () => {
    expect(validateKind('audio')).toBe(false)
  })

  it('rejects image (not in union)', () => {
    expect(validateKind('image')).toBe(false)
  })

  it('rejects undefined', () => {
    expect(validateKind(undefined)).toBe(false)
  })

  it('rejects null', () => {
    expect(validateKind(null)).toBe(false)
  })

  it('rejects empty string', () => {
    expect(validateKind('')).toBe(false)
  })

  it('rejects arbitrary string', () => {
    expect(validateKind('something')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// canOperate
// ---------------------------------------------------------------------------

describe('canOperate', () => {
  let canOperate: (resource: OperatingCoreResource) => boolean

  beforeAll(async () => {
    const mod = await import('@/lib/platform/operating-core/resources/resource-state')
    canOperate = mod.canOperate
  })

  it('returns true for active resource (archived_at null, successor_of null)', () => {
    const resource = makeResource({ archived_at: null, successor_of: null })
    expect(canOperate(resource)).toBe(true)
  })

  it('returns false for archived resource (archived_at set)', () => {
    const resource = makeResource({ archived_at: '2026-07-20T12:00:00.000Z', successor_of: null })
    expect(canOperate(resource)).toBe(false)
  })

  it('returns false for successor resource (successor_of set)', () => {
    const resource = makeResource({ archived_at: null, successor_of: 'resource-0' })
    expect(canOperate(resource)).toBe(false)
  })

  it('returns false for archived successor (both fields set)', () => {
    const resource = makeResource({ archived_at: '2026-07-20T12:00:00.000Z', successor_of: 'resource-0' })
    expect(canOperate(resource)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isVisibleTo
// ---------------------------------------------------------------------------

describe('isVisibleTo', () => {
  let isVisibleTo: (
    resource: OperatingCoreResource,
    actor: { roles: readonly string[]; capabilities: readonly string[] },
  ) => boolean

  beforeAll(async () => {
    const mod = await import('@/lib/platform/operating-core/resources/resource-state')
    isVisibleTo = mod.isVisibleTo
  })

  it('returns true when actor has matching role', () => {
    const resource = makeResource({
      visible_to_roles: ['director', 'coordinator'],
      visible_to_capabilities: [],
    })
    const actor = { roles: ['director'] as readonly string[], capabilities: [] as readonly string[] }
    expect(isVisibleTo(resource, actor)).toBe(true)
  })

  it('returns true when actor has matching capability', () => {
    const resource = makeResource({
      visible_to_roles: [],
      visible_to_capabilities: ['operating_core.resources.manage', 'operating_core.events.read'],
    })
    const actor = { roles: [] as readonly string[], capabilities: ['operating_core.resources.manage'] as readonly string[] }
    expect(isVisibleTo(resource, actor)).toBe(true)
  })

  it('returns true when both role and capability match', () => {
    const resource = makeResource({
      visible_to_roles: ['director'],
      visible_to_capabilities: ['operating_core.resources.manage'],
    })
    const actor = {
      roles: ['coordinator', 'director'] as readonly string[],
      capabilities: ['operating_core.resources.manage'] as readonly string[],
    }
    expect(isVisibleTo(resource, actor)).toBe(true)
  })

  it('returns false when neither role nor capability matches', () => {
    const resource = makeResource({
      visible_to_roles: ['director'],
      visible_to_capabilities: ['operating_core.resources.manage'],
    })
    const actor = {
      roles: ['member'] as readonly string[],
      capabilities: ['some.other.cap'] as readonly string[],
    }
    expect(isVisibleTo(resource, actor)).toBe(false)
  })

  it('returns false for archived resource (archived_at set)', () => {
    const resource = makeResource({
      archived_at: '2026-07-20T12:00:00.000Z',
      visible_to_roles: ['director'],
      visible_to_capabilities: [],
    })
    const actor = { roles: ['director'] as readonly string[], capabilities: [] as readonly string[] }
    // Even if roles match, archived resources should not be visible
    // Note: isVisibleTo should probably check canOperate first
    expect(isVisibleTo(resource, actor)).toBe(false)
  })

  it('returns false for successor resource (successor_of set)', () => {
    const resource = makeResource({
      successor_of: 'resource-0',
      visible_to_roles: ['director'],
      visible_to_capabilities: [],
    })
    const actor = { roles: ['director'] as readonly string[], capabilities: [] as readonly string[] }
    expect(isVisibleTo(resource, actor)).toBe(false)
  })

  it('returns true when resource has empty visibility (public)', () => {
    const resource = makeResource({
      visible_to_roles: [],
      visible_to_capabilities: [],
    })
    const actor = { roles: [] as readonly string[], capabilities: [] as readonly string[] }
    expect(isVisibleTo(resource, actor)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// buildSuccessorFromTransfer
// ---------------------------------------------------------------------------

describe('buildSuccessorFromTransfer', () => {
  let buildSuccessorFromTransfer: (
    current: OperatingCoreResource,
    request: ResourceTransferRequest,
  ) => { success: true; successor: OperatingCoreResource; archived_at: string } | { success: false; error: string }

  beforeAll(async () => {
    const mod = await import('@/lib/platform/operating-core/resources/resource-state')
    buildSuccessorFromTransfer = mod.buildSuccessorFromTransfer
  })

  it('returns success with new resource when transferring to different scope', () => {
    const current = makeResource({
      id: 'resource-1',
      area_experience_id: 'exp-1',
      visible_to_roles: ['director'],
      visible_to_capabilities: [],
    })
    const request: ResourceTransferRequest = {
      resource_id: 'resource-1',
      new_area_experience_id: 'exp-2',
      new_visible_to_roles: ['coordinator'],
      new_visible_to_capabilities: [],
      actor_persona_id: 'persona-actor',
      current_iso_timestamp: '2026-07-20T14:00:00.000Z',
    }

    const result = buildSuccessorFromTransfer(current, request)
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.successor.id).not.toBe('resource-1')
    expect(result.successor.area_experience_id).toBe('exp-2')
    expect(result.successor.visible_to_roles).toEqual(['coordinator'])
    expect(result.successor.successor_of).toBe('resource-1')
    expect(result.archived_at).toBe('2026-07-20T14:00:00.000Z')
    // Original fields preserved
    expect(result.successor.title).toBe(current.title)
    expect(result.successor.kind).toBe(current.kind)
    expect(result.successor.category).toBe(current.category)
  })

  it('returns failure with transfer_same_scope when new scope equals current scope', () => {
    const current = makeResource({ area_experience_id: 'exp-1' })
    const request: ResourceTransferRequest = {
      resource_id: 'resource-1',
      new_area_experience_id: 'exp-1', // same as current
      new_visible_to_roles: ['coordinator'],
      new_visible_to_capabilities: [],
      actor_persona_id: 'persona-actor',
      current_iso_timestamp: '2026-07-20T14:00:00.000Z',
    }

    const result = buildSuccessorFromTransfer(current, request)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('transfer_same_scope')
  })

  it('returns failure for archived resource', () => {
    const current = makeResource({
      archived_at: '2026-07-20T12:00:00.000Z',
    })
    const request: ResourceTransferRequest = {
      resource_id: 'resource-1',
      new_area_experience_id: 'exp-2',
      new_visible_to_roles: ['coordinator'],
      new_visible_to_capabilities: [],
      actor_persona_id: 'persona-actor',
      current_iso_timestamp: '2026-07-20T14:00:00.000Z',
    }

    const result = buildSuccessorFromTransfer(current, request)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('resource_archived')
  })

  it('returns failure for successor resource', () => {
    const current = makeResource({
      successor_of: 'resource-0',
    })
    const request: ResourceTransferRequest = {
      resource_id: 'resource-1',
      new_area_experience_id: 'exp-2',
      new_visible_to_roles: ['coordinator'],
      new_visible_to_capabilities: [],
      actor_persona_id: 'persona-actor',
      current_iso_timestamp: '2026-07-20T14:00:00.000Z',
    }

    const result = buildSuccessorFromTransfer(current, request)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('resource_archived')
  })
})

// ---------------------------------------------------------------------------
// validateCreateInput
// ---------------------------------------------------------------------------

describe('validateCreateInput', () => {
  let validateCreateInput: (input: CreateResourceInput) => { ok: true } | { ok: false; error: string }

  beforeAll(async () => {
    const mod = await import('@/lib/platform/operating-core/resources/resource-state')
    validateCreateInput = mod.validateCreateInput
  })

  it('accepts valid input with all fields', () => {
    const input: CreateResourceInput = {
      kind: 'link',
      title: 'My Resource',
      description: 'A description',
      category: 'docs',
      tags: ['tag1', 'tag2'],
      area_experience_id: 'exp-1',
      visible_to_roles: ['director'],
      visible_to_capabilities: ['operating_core.resources.manage'],
      created_by_persona_id: 'persona-1',
      current_iso_timestamp: '2026-07-20T12:00:00.000Z',
    }
    const result = validateCreateInput(input)
    expect(result.ok).toBe(true)
  })

  it('accepts valid input with minimal fields', () => {
    const input: CreateResourceInput = {
      kind: 'file',
      title: 'Minimal Resource',
      category: 'docs',
      area_experience_id: 'exp-1',
      created_by_persona_id: 'persona-1',
      current_iso_timestamp: '2026-07-20T12:00:00.000Z',
    }
    const result = validateCreateInput(input)
    expect(result.ok).toBe(true)
  })

  it('rejects invalid kind', () => {
    const input = {
      kind: 'audio' as OperatingCoreResourceKind,
      title: 'Bad Resource',
      category: 'docs',
      area_experience_id: 'exp-1',
      created_by_persona_id: 'persona-1',
      current_iso_timestamp: '2026-07-20T12:00:00.000Z',
    }
    const result = validateCreateInput(input)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('invalid_kind')
  })

  it('rejects invalid tags format (not an array)', () => {
    const input = {
      kind: 'link' as OperatingCoreResourceKind,
      title: 'Bad Tags',
      category: 'docs',
      tags: 'not-an-array' as unknown as readonly string[],
      area_experience_id: 'exp-1',
      created_by_persona_id: 'persona-1',
      current_iso_timestamp: '2026-07-20T12:00:00.000Z',
    }
    const result = validateCreateInput(input)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('invalid_tags_format')
  })

  it('rejects invalid tags format (array with non-strings)', () => {
    const input = {
      kind: 'link' as OperatingCoreResourceKind,
      title: 'Bad Tags',
      category: 'docs',
      tags: [1, 2, 3] as unknown as readonly string[],
      area_experience_id: 'exp-1',
      created_by_persona_id: 'persona-1',
      current_iso_timestamp: '2026-07-20T12:00:00.000Z',
    }
    const result = validateCreateInput(input)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('invalid_tags_format')
  })
})
