/**
 * PR1 — DT-002 — Talleres route access tests.
 */

import {
  assertTalleresRouteAccess,
  canAccessTalleres,
  isRouteAccessDenied,
  isRouteNotFound,
  isFlagDisabled,
} from '@/lib/platform/talleres/route-access'

describe('assertTalleresRouteAccess', () => {
  it('does not throw when isEnabled=true and routeExists=true with no capabilities required', () => {
    expect(() =>
      assertTalleresRouteAccess({
        sessionCapabilities: [],
        isEnabled: true,
        routeExists: true,
      }),
    ).not.toThrow()
  })

  it('does not throw when session has required capability', () => {
    expect(() =>
      assertTalleresRouteAccess({
        sessionCapabilities: ['talleres_crecimiento.director.read'],
        requiredCapabilities: ['talleres_crecimiento.director.read'],
        isEnabled: true,
        routeExists: true,
      }),
    ).not.toThrow()
  })

  it('throws FLAG_DISABLED when feature flag is off', () => {
    expect(() =>
      assertTalleresRouteAccess({
        sessionCapabilities: ['talleres_crecimiento.director.read'],
        isEnabled: false,
        routeExists: true,
      }),
    ).toThrow()
  })

  it('throws ROUTE_NOT_FOUND when route does not exist', () => {
    expect(() =>
      assertTalleresRouteAccess({
        sessionCapabilities: [],
        isEnabled: true,
        routeExists: false,
      }),
    ).toThrow()
  })

  it('throws ROUTE_ACCESS_DENIED when capability is missing', () => {
    expect(() =>
      assertTalleresRouteAccess({
        sessionCapabilities: [],
        requiredCapabilities: ['talleres_crecimiento.director.read'],
        isEnabled: true,
        routeExists: true,
      }),
    ).toThrow()
  })
})

describe('canAccessTalleres', () => {
  it('returns false when isEnabled is false', () => {
    const result = canAccessTalleres({
      sessionCapabilities: ['talleres_crecimiento.director.read'],
      isEnabled: false,
    })
    expect(result).toBe(false)
  })

  it('returns true when no required capabilities and isEnabled=true', () => {
    const result = canAccessTalleres({
      sessionCapabilities: [],
      isEnabled: true,
    })
    expect(result).toBe(true)
  })

  it('returns true when session has required capability', () => {
    const result = canAccessTalleres({
      sessionCapabilities: ['talleres_crecimiento.director.read'],
      requiredCapabilities: ['talleres_crecimiento.director.read'],
      isEnabled: true,
    })
    expect(result).toBe(true)
  })

  it('returns false when session lacks required capability', () => {
    const result = canAccessTalleres({
      sessionCapabilities: ['talleres_crecimiento.volunteer.read'],
      requiredCapabilities: ['talleres_crecimiento.director.read'],
      isEnabled: true,
    })
    expect(result).toBe(false)
  })
})

describe('type guards', () => {
  it('isRouteAccessDenied returns true for ROUTE_ACCESS_DENIED', () => {
    const error = { code: 'ROUTE_ACCESS_DENIED' as const, message: '' }
    expect(isRouteAccessDenied(error)).toBe(true)
  })

  it('isRouteNotFound returns true for ROUTE_NOT_FOUND', () => {
    const error = { code: 'ROUTE_NOT_FOUND' as const, message: '' }
    expect(isRouteNotFound(error)).toBe(true)
  })

  it('isFlagDisabled returns true for FLAG_DISABLED', () => {
    const error = { code: 'FLAG_DISABLED' as const, message: '' }
    expect(isFlagDisabled(error)).toBe(true)
  })
})
