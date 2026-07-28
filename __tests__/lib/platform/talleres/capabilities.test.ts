/**
 * PR1 — DT-002 — Talleres capabilities tests.
 */

import {
  TALLERES_CAPABILITY_KEYS,
  isValidTalleresCapability,
  getTalleresCapabilityRole,
  getTalleresCapabilityAction,
  getTalleresCapabilitiesForRole,
  assertTalleresCapability,
  hasTalleresCapability,
} from '@/lib/platform/talleres/capabilities'

describe('TALLERES_CAPABILITY_KEYS', () => {
  it('contains exactly 13 capabilities', () => {
    expect(TALLERES_CAPABILITY_KEYS).toHaveLength(13)
  })

  it('all capabilities start with talleres_crecimiento prefix', () => {
    for (const cap of TALLERES_CAPABILITY_KEYS) {
      expect(cap).toMatch(/^talleres_crecimiento\./)
    }
  })

  it('has no duplicates', () => {
    const unique = new Set(TALLERES_CAPABILITY_KEYS)
    expect(unique.size).toBe(TALLERES_CAPABILITY_KEYS.length)
  })
})

describe('isValidTalleresCapability', () => {
  it('returns true for valid Talleres capability', () => {
    expect(isValidTalleresCapability('talleres_crecimiento.director.read')).toBe(true)
  })

  it('returns false for invalid capability', () => {
    expect(isValidTalleresCapability('pastoral.director.read')).toBe(false)
    expect(isValidTalleresCapability('talleres_crecimiento.invalid')).toBe(false)
    expect(isValidTalleresCapability('')).toBe(false)
  })
})

describe('getTalleresCapabilityRole', () => {
  it('extracts role from director capability', () => {
    expect(getTalleresCapabilityRole('talleres_crecimiento.director.read')).toBe('director')
  })

  it('extracts role from coordinator capability', () => {
    expect(getTalleresCapabilityRole('talleres_crecimiento.coordinator.write')).toBe('coordinator')
  })

  it('extracts role from lead capability', () => {
    expect(getTalleresCapabilityRole('talleres_crecimiento.lead.read')).toBe('lead')
  })

  it('extracts role from volunteer capability', () => {
    expect(getTalleresCapabilityRole('talleres_crecimiento.volunteer.read')).toBe('volunteer')
  })
})

describe('getTalleresCapabilityAction', () => {
  it('extracts read action', () => {
    expect(getTalleresCapabilityAction('talleres_crecimiento.director.read')).toBe('read')
  })

  it('extracts write action', () => {
    expect(getTalleresCapabilityAction('talleres_crecimiento.director.write')).toBe('write')
  })

  it('extracts manage action', () => {
    expect(getTalleresCapabilityAction('talleres_crecimiento.admin.manage')).toBe('manage')
  })
})

describe('getTalleresCapabilitiesForRole', () => {
  it('returns director capabilities', () => {
    const caps = getTalleresCapabilitiesForRole('director')
    expect(caps).toContain('talleres_crecimiento.director.read')
    expect(caps).toContain('talleres_crecimiento.director.write')
    expect(caps.length).toBe(2)
  })

  it('returns coordinator capabilities', () => {
    const caps = getTalleresCapabilitiesForRole('coordinator')
    expect(caps).toContain('talleres_crecimiento.coordinator.read')
    expect(caps).toContain('talleres_crecimiento.coordinator.write')
  })

  it('returns lead capabilities', () => {
    const caps = getTalleresCapabilitiesForRole('lead')
    expect(caps).toContain('talleres_crecimiento.lead.read')
    expect(caps).toContain('talleres_crecimiento.lead.write')
  })

  it('returns volunteer capabilities', () => {
    const caps = getTalleresCapabilitiesForRole('volunteer')
    expect(caps).toContain('talleres_crecimiento.volunteer.read')
  })

  it('each role set is non-empty', () => {
    const roles = ['director', 'coordinator', 'lead', 'volunteer'] as const
    for (const role of roles) {
      const caps = getTalleresCapabilitiesForRole(role)
      expect(caps.length).toBeGreaterThan(0)
    }
  })
})

describe('assertTalleresCapability', () => {
  it('does not throw when session has capability', () => {
    expect(() =>
      assertTalleresCapability({
        sessionCapabilities: ['talleres_crecimiento.director.read'],
        requiredCapability: 'talleres_crecimiento.director.read',
      }),
    ).not.toThrow()
  })

  it('throws TALLER_ACCESS_DENIED when capability is missing', () => {
    expect(() =>
      assertTalleresCapability({
        sessionCapabilities: [],
        requiredCapability: 'talleres_crecimiento.director.read',
      }),
    ).toThrow()
  })
})

describe('hasTalleresCapability', () => {
  it('returns true when session has capability', () => {
    const result = hasTalleresCapability({
      sessionCapabilities: ['talleres_crecimiento.director.read'],
      requiredCapability: 'talleres_crecimiento.director.read',
    })
    expect(result).toBe(true)
  })

  it('returns false when session lacks capability', () => {
    const result = hasTalleresCapability({
      sessionCapabilities: [],
      requiredCapability: 'talleres_crecimiento.director.read',
    })
    expect(result).toBe(false)
  })
})
