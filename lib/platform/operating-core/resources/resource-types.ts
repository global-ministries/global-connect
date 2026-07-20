/**
 * S16 — Operating Core Resources domain types.
 * CLOSED 3-element kind union: link | file | video.
 * Immutable ownership transfer: successors chain via successor_of.
 */

// ---------------------------------------------------------------------------
// Constants — closed unions
// ---------------------------------------------------------------------------

/** Exactly 3 kinds. Adding/removing is a TypeScript-breaking change. */
export const OPERATING_CORE_RESOURCE_KINDS = ['link', 'file', 'video'] as const

export type OperatingCoreResourceKind = (typeof OPERATING_CORE_RESOURCE_KINDS)[number]

// ---------------------------------------------------------------------------
// Resource
// ---------------------------------------------------------------------------

export interface OperatingCoreResource {
  readonly id: string
  readonly kind: OperatingCoreResourceKind
  readonly title: string
  readonly description: string | null
  readonly category: string
  readonly tags: readonly string[]
  /** Owning scope — transferred on ownership change */
  readonly area_experience_id: string
  /** Roles that can view this resource */
  readonly visible_to_roles: readonly string[]
  /** Capabilities that can view this resource */
  readonly visible_to_capabilities: readonly string[]
  readonly created_by_persona_id: string
  readonly created_at: string
  /** null = active; non-null = archived (soft delete) */
  readonly archived_at: string | null
  /** FK to predecessor row; set on successor rows only */
  readonly successor_of: string | null
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateResourceInput {
  readonly kind: OperatingCoreResourceKind
  readonly title: string
  readonly description?: string
  readonly category: string
  readonly tags?: readonly string[]
  readonly area_experience_id: string
  readonly visible_to_roles?: readonly string[]
  readonly visible_to_capabilities?: readonly string[]
  readonly created_by_persona_id: string
  readonly current_iso_timestamp: string
}

export interface ResourceTransferRequest {
  readonly resource_id: string
  readonly new_area_experience_id: string
  readonly new_visible_to_roles: readonly string[]
  readonly new_visible_to_capabilities: readonly string[]
  readonly actor_persona_id: string
  readonly current_iso_timestamp: string
}

export interface ResourceArchiveRequest {
  readonly resource_id: string
  readonly actor_persona_id: string
  readonly current_iso_timestamp: string
  readonly reason: string
}

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

export type ResourceValidationError =
  | 'resource_not_found'
  | 'resource_archived' // can't operate on archived resources
  | 'invalid_kind' // not in OPERATING_CORE_RESOURCE_KINDS
  | 'transfer_same_scope' // no-op transfer rejected
  | 'invalid_tags_format' // tags not array of strings
