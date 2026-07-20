/**
 * S16 — Operating Core Resources state machine and validation.
 * Pure functions: no side effects, no I/O.
 */
import type {
  OperatingCoreResource,
  OperatingCoreResourceKind,
  CreateResourceInput,
  ResourceTransferRequest,
  ResourceValidationError,
} from './resource-types'
import { OPERATING_CORE_RESOURCE_KINDS } from './resource-types'

// ---------------------------------------------------------------------------
// validateKind
// ---------------------------------------------------------------------------

/**
 * Validates a kind is in the closed 3-element union.
 * Returns true if valid, false if not.
 */
export function validateKind(kind: unknown): kind is OperatingCoreResourceKind {
  return OPERATING_CORE_RESOURCE_KINDS.includes(kind as OperatingCoreResourceKind)
}

// ---------------------------------------------------------------------------
// canOperate
// ---------------------------------------------------------------------------

/**
 * Can a resource be operated on? Active + not-yet-a-successor.
 * Returns false for archived_at !== null or successor_of !== null.
 */
export function canOperate(resource: OperatingCoreResource): boolean {
  return resource.archived_at === null && resource.successor_of === null
}

// ---------------------------------------------------------------------------
// isVisibleTo
// ---------------------------------------------------------------------------

/**
 * Visibility check: does the actor have intersection with the resource's visibility?
 * - Roles: any role in actor.roles matches any in resource.visible_to_roles (OR)
 * - Capabilities: any capability in actor.capabilities matches any in resource.visible_to_capabilities (OR)
 * - At least one intersection required
 */
export function isVisibleTo(
  resource: OperatingCoreResource,
  actor: { roles: readonly string[]; capabilities: readonly string[] },
): boolean {
  // Archived or successor resources are not visible for operations
  if (!canOperate(resource)) {
    return false
  }

  // Empty visibility means public
  if (resource.visible_to_roles.length === 0 && resource.visible_to_capabilities.length === 0) {
    return true
  }

  // Role intersection
  const hasRoleMatch =
    resource.visible_to_roles.length > 0 &&
    actor.roles.some((role) => resource.visible_to_roles.includes(role))

  // Capability intersection
  const hasCapMatch =
    resource.visible_to_capabilities.length > 0 &&
    actor.capabilities.some((cap) => resource.visible_to_capabilities.includes(cap))

  return hasRoleMatch || hasCapMatch
}

// ---------------------------------------------------------------------------
// buildSuccessorFromTransfer
// ---------------------------------------------------------------------------

/**
 * Compute the successor resource from a transfer request.
 * Pure: does not touch the repository. Returns a new resource object.
 * - Returns failure if canOperate(current) === false (already archived)
 * - Returns failure if new_area_experience_id === current.area_experience_id (no-op)
 */
export function buildSuccessorFromTransfer(
  current: OperatingCoreResource,
  request: ResourceTransferRequest,
): { success: true; successor: OperatingCoreResource; archived_at: string } | { success: false; error: ResourceValidationError } {
  // Check if resource can be operated on
  if (!canOperate(current)) {
    return { success: false, error: 'resource_archived' }
  }

  // Reject no-op transfer
  if (current.area_experience_id === request.new_area_experience_id) {
    return { success: false, error: 'transfer_same_scope' }
  }

  const successor: OperatingCoreResource = {
    ...current,
    id: crypto.randomUUID(),
    area_experience_id: request.new_area_experience_id,
    visible_to_roles: request.new_visible_to_roles,
    visible_to_capabilities: request.new_visible_to_capabilities,
    created_by_persona_id: request.actor_persona_id,
    created_at: request.current_iso_timestamp,
    archived_at: null,
    successor_of: current.id,
  }

  return { success: true, successor, archived_at: request.current_iso_timestamp }
}

// ---------------------------------------------------------------------------
// validateCreateInput
// ---------------------------------------------------------------------------

/**
 * Validate a CreateResourceInput.
 * - kind must be in OPERATING_CORE_RESOURCE_KINDS
 * - tags (if provided) must be an array of strings
 */
export function validateCreateInput(
  input: CreateResourceInput,
): { ok: true } | { ok: false; error: ResourceValidationError } {
  if (!validateKind(input.kind)) {
    return { ok: false, error: 'invalid_kind' }
  }

  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags)) {
      return { ok: false, error: 'invalid_tags_format' }
    }
    if (!(input.tags as unknown[]).every((t) => typeof t === 'string')) {
      return { ok: false, error: 'invalid_tags_format' }
    }
  }

  return { ok: true }
}
