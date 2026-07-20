/**
 * S16 — Operating Core Resources repository contract.
 */
import type {
  OperatingCoreResource,
  CreateResourceInput,
  ResourceTransferRequest,
  ResourceArchiveRequest,
  OperatingCoreResourceKind,
} from './resource-types'

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

export interface ListResourcesFilter {
  readonly kind?: OperatingCoreResourceKind
  readonly area_experience_id?: string
  readonly category?: string
  readonly tag?: string
  /** default false */
  readonly includeArchived?: boolean
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export interface ResourcesRepository {
  create(input: CreateResourceInput): Promise<OperatingCoreResource>
  findById(id: string): Promise<OperatingCoreResource | null>
  list(filter?: ListResourcesFilter): Promise<readonly OperatingCoreResource[]>
  /**
   * CRITICAL: ownership transfer creates successor + archives prior. NEVER mutates original.
   * 1. INSERT successor row (new id; new ownership fields; successor_of = current.id)
   * 2. UPDATE prior: archived_at = timestamp (NO other field changes)
   */
  transferOwnership(request: ResourceTransferRequest): Promise<{ successor: OperatingCoreResource; archived: OperatingCoreResource }>
  archive(request: ResourceArchiveRequest): Promise<OperatingCoreResource>
}
