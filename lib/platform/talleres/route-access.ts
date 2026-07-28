/**
 * PR1 — DT-002 — Talleres route access helpers.
 * Sibling to lib/platform/pastoral/route-access.ts pattern.
 */

import {
  isRouteAccessDenied,
  isRouteNotFound,
  isFlagDisabled,
  type RouteAccessError,
} from './errors'

/**
 * Checks if the user has access to talleres routes based on capabilities.
 *
 * Returns void if access is granted, throws RouteAccessError if denied.
 */
export function assertTalleresRouteAccess(params: {
  sessionCapabilities: string[]
  requiredCapabilities?: string[]
  isEnabled?: boolean
  routeExists?: boolean
}): void {
  const { sessionCapabilities, requiredCapabilities, isEnabled = true, routeExists = true } = params

  if (!isEnabled) {
    throw {
      code: 'FLAG_DISABLED' as const,
      message: 'Talleres feature flag is disabled',
    } satisfies RouteAccessError
  }

  if (!routeExists) {
    throw {
      code: 'ROUTE_NOT_FOUND' as const,
      message: 'Talleres route does not exist',
    } satisfies RouteAccessError
  }

  if (requiredCapabilities && requiredCapabilities.length > 0) {
    const hasCapability = requiredCapabilities.some((cap) =>
      sessionCapabilities.includes(cap),
    )
    if (!hasCapability) {
      throw {
        code: 'ROUTE_ACCESS_DENIED' as const,
        message: 'Missing required capability for Talleres route access',
        context: { requiredCapabilities },
      } satisfies RouteAccessError
    }
  }
}

/**
 * Returns whether the user can access talleres routes based on capabilities.
 */
export function canAccessTalleres(params: {
  sessionCapabilities: string[]
  requiredCapabilities?: string[]
  isEnabled?: boolean
}): boolean {
  const { sessionCapabilities, requiredCapabilities, isEnabled = true } = params

  if (!isEnabled) return false

  if (!requiredCapabilities || requiredCapabilities.length === 0) return true

  return requiredCapabilities.some((cap) => sessionCapabilities.includes(cap))
}

export { isRouteAccessDenied, isRouteNotFound, isFlagDisabled }
export type { RouteAccessError }
