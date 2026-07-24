/**
 * W14 — DT-085 — Route-access extension tests.
 *
 * Tests the new capability predicates added in W14:
 *   - hasPastoralMentorCascadeResolveCapability
 *   - hasPastoralCrisisDetectCapability
 *   - hasPastoralReadAllCapability (already existed, verified here)
 *
 * Uses real PlatformSession types with minimal mock grants.
 */
import {
  hasPastoralMentorCascadeResolveCapability,
  hasPastoralCrisisDetectCapability,
  hasPastoralReadAllCapability,
} from '@/lib/platform/pastoral/route-access'
import type { PlatformSession } from '@/lib/platform/session/types'

function makeSession(capabilities: string[]): PlatformSession {
  return {
    personaId: 'test-persona-id',
    capabilities: capabilities.map((key) => ({
      key,
      experience: 'pastoral' as const,
      scopeType: 'experience' as const,
      scopeId: undefined,
      source: 'test' as const,
    })),
    roles: [],
    activeFlow: 'pastoral.api',
  }
}

describe('hasPastoralMentorCascadeResolveCapability', () => {
  it('returns true when session has pastoral.mentor.cascade.resolve', () => {
    const session = makeSession(['pastoral.mentor.cascade.resolve'])
    expect(hasPastoralMentorCascadeResolveCapability(session)).toBe(true)
  })

  it('returns true when session has pastoral.read.all', () => {
    const session = makeSession(['pastoral.read.all'])
    expect(hasPastoralMentorCascadeResolveCapability(session)).toBe(true)
  })

  it('returns false when session has no pastoral mentor capability', () => {
    const session = makeSession(['pastoral.one_on_one.create'])
    expect(hasPastoralMentorCascadeResolveCapability(session)).toBe(false)
  })

  it('returns false when session has no capabilities at all', () => {
    const session = makeSession([])
    expect(hasPastoralMentorCascadeResolveCapability(session)).toBe(false)
  })
})

describe('hasPastoralCrisisDetectCapability', () => {
  it('returns true when session has pastoral.crisis.detect', () => {
    const session = makeSession(['pastoral.crisis.detect'])
    expect(hasPastoralCrisisDetectCapability(session)).toBe(true)
  })

  it('returns true when session has pastoral.read.all', () => {
    const session = makeSession(['pastoral.read.all'])
    expect(hasPastoralCrisisDetectCapability(session)).toBe(true)
  })

  it('returns false when session has only pastoral.one_on_one.create', () => {
    const session = makeSession(['pastoral.one_on_one.create'])
    expect(hasPastoralCrisisDetectCapability(session)).toBe(false)
  })

  it('returns false when session has no capabilities', () => {
    const session = makeSession([])
    expect(hasPastoralCrisisDetectCapability(session)).toBe(false)
  })
})

describe('hasPastoralReadAllCapability', () => {
  it('returns true when session has pastoral.read.all', () => {
    const session = makeSession(['pastoral.read.all'])
    expect(hasPastoralReadAllCapability(session)).toBe(true)
  })

  it('returns false when session has only specific read capability', () => {
    const session = makeSession(['pastoral.one_on_one.read'])
    expect(hasPastoralReadAllCapability(session)).toBe(false)
  })

  it('returns false when session has no capabilities', () => {
    const session = makeSession([])
    expect(hasPastoralReadAllCapability(session)).toBe(false)
  })
})
