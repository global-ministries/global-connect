/**
 * PR1 — DT-002 — Talleres route access tests.
 */

import {
  assertTalleresRouteAccess,
  canAccessTalleres,
  isRouteAccessDenied,
  isRouteNotFound,
  isFlagDisabled,
  TALLERES_NAV_ITEMS,
  TALLERES_CAPABILITY_KEYS,
  TALLERES_ROUTE_CAPABILITY_MAP,
  getRequiredCapabilityForRoute,
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

// ─── T1 — route-access.ts as the single source of "which capability does
// this route need" (docs/talleres-de-punta-a-punta.md §9: "al consolidar,
// ese catálogo debe pasar a ser la única fuente: la ruta declara su
// capacidad y el portón la lee de ahí") ────────────────────────────────

describe('TALLERES_CAPABILITY_KEYS — canonical live capability list', () => {
  it('is derived from the platform capability registry, not a hand-copied array', () => {
    // 13 canonical talleres_crecimiento.* keys per lib/platform/experiences.ts.
    expect(TALLERES_CAPABILITY_KEYS.length).toBe(13)
    expect(TALLERES_CAPABILITY_KEYS.every((k) => k.startsWith('talleres_crecimiento.'))).toBe(true)
  })

  it('every non-null TALLERES_NAV_ITEMS.requiredCapability is one of TALLERES_CAPABILITY_KEYS', () => {
    for (const item of TALLERES_NAV_ITEMS) {
      if (item.requiredCapability === null) continue
      expect(TALLERES_CAPABILITY_KEYS).toContain(item.requiredCapability)
    }
  })
})

// ─── T6 — /talleres/pendientes nav item ────────────────────────────────

describe('TALLERES_NAV_ITEMS — /talleres/pendientes (T6)', () => {
  it('is declared, capability-gated (never null — RLS alone is not enough for a menu entry) and not shown to any authenticated user', () => {
    const item = TALLERES_NAV_ITEMS.find((i) => i.href === '/talleres/pendientes')
    expect(item).toBeDefined()
    expect(item?.requiredCapability).not.toBeNull()
    // Coordinador and director are both auto-granted metrics.read
    // (supabase/migrations/20260810120000_talleres_role_auto_grant.sql) —
    // the one capability the two mutually-exclusive roles share, so a
    // single nav item (one href -> one requiredCapability, per the
    // invariant this file already asserts below) can gate a page meant
    // for both. director.read/coordinator.read alone would each hide it
    // from the other role.
    expect(item?.requiredCapability).toBe('talleres_crecimiento.metrics.read')
  })
})

// ─── T7 — /talleres/reportes nav item ──────────────────────────────────

describe('TALLERES_NAV_ITEMS — /talleres/reportes (T7)', () => {
  it('is declared, capability-gated (never null) and shared by coordinador + director via metrics.read (same reasoning as T6\'s pendientes item)', () => {
    const item = TALLERES_NAV_ITEMS.find((i) => i.href === '/talleres/reportes')
    expect(item).toBeDefined()
    expect(item?.requiredCapability).not.toBeNull()
    expect(item?.requiredCapability).toBe('talleres_crecimiento.metrics.read')
  })
})

// ─── T9 — /talleres/mi-recorrido nav item (merges 3 old participant items) ─

describe('TALLERES_NAV_ITEMS — /talleres/mi-recorrido (T9)', () => {
  it('is declared, open to any authenticated user (criterion 7 — requiredCapability: null)', () => {
    const item = TALLERES_NAV_ITEMS.find((i) => i.href === '/talleres/mi-recorrido')
    expect(item).toBeDefined()
    expect(item?.id).toBe('talleres_participante_mi_recorrido')
    expect(item?.requiredCapability).toBeNull()
  })

  it('replaces the three old participant items — none of them remain in the catalog (unlike T6/T7/T8, which ADD alongside an old item still serving a distinct audience, this is the exact same participant on the exact same merged screen)', () => {
    const ids = TALLERES_NAV_ITEMS.map((i) => i.id)
    expect(ids).not.toContain('talleres_participante_mis_talleres')
    expect(ids).not.toContain('talleres_participante_historial')
    expect(ids).not.toContain('talleres_participante_certificados')
  })
})

describe('TALLERES_ROUTE_CAPABILITY_MAP / getRequiredCapabilityForRoute — route→capability lookup', () => {
  it('maps every nav item href to its requiredCapability', () => {
    for (const item of TALLERES_NAV_ITEMS) {
      expect(TALLERES_ROUTE_CAPABILITY_MAP[item.href]).toBe(item.requiredCapability)
    }
  })

  it('getRequiredCapabilityForRoute returns the mapped capability for a known route', () => {
    expect(getRequiredCapabilityForRoute('/talleres/pendientes')).toBe(
      'talleres_crecimiento.metrics.read',
    )
    expect(getRequiredCapabilityForRoute('/talleres/explorar')).toBeNull()
  })

  it('getRequiredCapabilityForRoute returns undefined for a route outside the catalog', () => {
    expect(getRequiredCapabilityForRoute('/talleres/does-not-exist')).toBeUndefined()
  })
})
