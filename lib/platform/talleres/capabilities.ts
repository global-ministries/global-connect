/**
 * PR1 — DT-002 — Talleres capabilities helpers.
 * Sibling to lib/platform/pastoral/capabilities.ts pattern.
 *
 * Talleres capabilities are derived from role + scope via auto-grant triggers.
 * No manual grants exist at the user level.
 *
 * @see design.md §4 — Capability inheritance model
 */

import { isTallerAccessDenied, type TalleresError } from './errors'

/**
 * The 13 Talleres capabilities as specified in design.md §4.
 * All registered in lib/platform/experiences.ts with scopeType:'taller'.
 */
export const TALLERES_CAPABILITY_KEYS = [
  'talleres_crecimiento.director.read',
  'talleres_crecimiento.director.write',
  'talleres_crecimiento.admin.manage',
  'talleres_crecimiento.coordinator.read',
  'talleres_crecimiento.coordinator.write',
  'talleres_crecimiento.lead.read',
  'talleres_crecimiento.lead.write',
  'talleres_crecimiento.volunteer.read',
  'talleres_crecimiento.participation.read',
  'talleres_crecimiento.metrics.read',
  'talleres_crecimiento.team.serve',
  'talleres_crecimiento.integration.read',
  'talleres_crecimiento.certificates.verify',
] as const

export type TalleresCapabilityKey = (typeof TALLERES_CAPABILITY_KEYS)[number]

/**
 * Scope type for talleres capabilities.
 * Most capabilities are scoped per taller; certificates.verify is unscoped (public).
 */
export type TalleresScopeType = 'taller'

/**
 * Checks if a capability key is a valid Talleres capability.
 */
export function isValidTalleresCapability(capability: string): capability is TalleresCapabilityKey {
  return TALLERES_CAPABILITY_KEYS.includes(capability as TalleresCapabilityKey)
}

/**
 * Extracts the role from a Talleres capability key.
 * e.g. 'talleres_crecimiento.director.read' -> 'director'
 */
export function getTalleresCapabilityRole(capability: TalleresCapabilityKey): string {
  const parts = capability.split('.')
  return parts[1] ?? ''
}

/**
 * Extracts the action from a Talleres capability key.
 * e.g. 'talleres_crecimiento.director.read' -> 'read'
 */
export function getTalleresCapabilityAction(capability: TalleresCapabilityKey): string {
  const parts = capability.split('.')
  return parts[2] ?? ''
}

/**
 * Returns all capabilities for a given role.
 */
export function getTalleresCapabilitiesForRole(
  role: 'director' | 'coordinator' | 'lead' | 'volunteer',
): TalleresCapabilityKey[] {
  const rolePrefix = `talleres_crecimiento.${role}` as const
  return TALLERES_CAPABILITY_KEYS.filter((cap) => cap.startsWith(rolePrefix as string))
}

/**
 * Asserts that the session has the required Talleres capability.
 * Throws TalleresError if access is denied.
 */
export function assertTalleresCapability(params: {
  sessionCapabilities: string[]
  requiredCapability: TalleresCapabilityKey
}): void {
  const { sessionCapabilities, requiredCapability } = params

  if (!sessionCapabilities.includes(requiredCapability)) {
    throw {
      code: 'TALLER_ACCESS_DENIED' as const,
      message: `Missing required Talleres capability: ${requiredCapability}`,
      context: { requiredCapability },
    } satisfies TalleresError
  }
}

/**
 * Returns true if the session has the required Talleres capability.
 */
export function hasTalleresCapability(params: {
  sessionCapabilities: string[]
  requiredCapability: TalleresCapabilityKey
}): boolean {
  const { sessionCapabilities, requiredCapability } = params
  return sessionCapabilities.includes(requiredCapability)
}

export { isTallerAccessDenied }
