/**
 * dream_team.direct scoped gate — route-access tests.
 *
 * dream_team.direct is scopeType 'equipo'. hasCapability() resolves capabilities
 * through resolvePlatformCapability(), which requires a scope id for any non-'experience'
 * scopeType (see normalizeScope() in lib/platform/experiences.ts) — but the route never
 * knows which equipo id to require. So dream_team.direct must be recognized by mere
 * presence in session.capabilities, not by resolution, both for read and write.
 */

import {
  hasDreamTeamReadCapability,
  hasDreamTeamWriteCapability,
  hasDreamTeamMetricsCapability,
} from '@/lib/platform/dream-team/route-access'
import type { PlatformSession, PlatformSessionCapability } from '@/lib/platform/session/types'

function makeSession(capabilities: PlatformSessionCapability[]): PlatformSession {
  return {
    personaId: 'persona-1',
    subjectAuthId: 'auth-1',
    globalRoles: [],
    contexts: [],
    capabilities,
  }
}

const directCap: PlatformSessionCapability = {
  key: 'dream_team.direct',
  experience: 'dream_team',
  scopeType: 'equipo',
  scopeId: 'equipo-dps-camara',
  source: 'dream-team',
}
const globalDirectorCap: PlatformSessionCapability = {
  key: 'dream_team.director.coordinate',
  experience: 'dream_team',
  scopeType: 'experience',
  source: 'dream-team',
}
const requirementsCap: PlatformSessionCapability = {
  key: 'dream_team.requirements.manage',
  experience: 'dream_team',
  scopeType: 'experience',
  source: 'dream-team',
}
const metricsCap: PlatformSessionCapability = {
  key: 'dream_team.metrics.read',
  experience: 'dream_team',
  scopeType: 'experience',
  source: 'dream-team',
}
const unrelatedCap: PlatformSessionCapability = {
  key: 'dps.team.serve',
  experience: 'dps',
  scopeType: 'equipo',
  scopeId: 'equipo-dps-camara',
  source: 'dream-team',
}

describe('hasDreamTeamWriteCapability', () => {
  it('allows a scoped area director holding only dream_team.direct', () => {
    expect(hasDreamTeamWriteCapability(makeSession([directCap]))).toBe(true)
  })

  it('still allows the global director capability (dream_team.director.coordinate)', () => {
    expect(hasDreamTeamWriteCapability(makeSession([globalDirectorCap]))).toBe(true)
  })

  it('still allows dream_team.requirements.manage', () => {
    expect(hasDreamTeamWriteCapability(makeSession([requirementsCap]))).toBe(true)
  })

  it('denies a session without any of the write capabilities', () => {
    expect(hasDreamTeamWriteCapability(makeSession([unrelatedCap]))).toBe(false)
    expect(hasDreamTeamWriteCapability(makeSession([]))).toBe(false)
  })
})

describe('hasDreamTeamReadCapability', () => {
  it('allows a scoped area director holding only dream_team.direct', () => {
    expect(hasDreamTeamReadCapability(makeSession([directCap]))).toBe(true)
  })

  it('still allows the existing read capabilities', () => {
    expect(hasDreamTeamReadCapability(makeSession([metricsCap]))).toBe(true)
    expect(hasDreamTeamReadCapability(makeSession([requirementsCap]))).toBe(true)
    expect(hasDreamTeamReadCapability(makeSession([globalDirectorCap]))).toBe(true)
  })

  it('denies a session without any of the read capabilities', () => {
    expect(hasDreamTeamReadCapability(makeSession([unrelatedCap]))).toBe(false)
    expect(hasDreamTeamReadCapability(makeSession([]))).toBe(false)
  })
})

describe('hasDreamTeamMetricsCapability is unaffected by dream_team.direct', () => {
  it('does not treat dream_team.direct as a metrics capability', () => {
    expect(hasDreamTeamMetricsCapability(makeSession([directCap]))).toBe(false)
  })

  it('still allows dream_team.metrics.read', () => {
    expect(hasDreamTeamMetricsCapability(makeSession([metricsCap]))).toBe(true)
  })
})
