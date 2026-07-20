/**
 * S14 — Operating Core Forms repository interface.
 * Pure TypeScript contract — no SQL, no Supabase adapter (S15 adds those).
 */
import type {
  OperatingCoreFormDefinition,
  OperatingCoreFormField,
  OperatingCoreFormLifecycle,
  OperatingCoreFormSubmission,
} from './form-types'

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateFormInput {
  readonly owner_experience_id: string
  readonly title: string
  readonly description?: string
  readonly fields: readonly OperatingCoreFormField[]
  readonly created_by_persona_id: string
}

export interface UpdateFormInput {
  readonly id: string
  readonly expectedVersion: number
  readonly title?: string
  readonly description?: string
  readonly fields?: readonly OperatingCoreFormField[]
  readonly lifecycle?: OperatingCoreFormLifecycle
}

export interface SubmitFormInput {
  readonly form_id: string
  /** Validated answers — caller is responsible for validation before submit */
  readonly answers: Readonly<Record<string, unknown>>
  readonly submitted_by_persona_id: string
  readonly currentIsoTimestamp: string
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface FormsRepository {
  // Form CRUD
  create(input: CreateFormInput): Promise<OperatingCoreFormDefinition>
  findById(id: string): Promise<OperatingCoreFormDefinition | null>
  listByOwnerExperience(
    owner_experience_id: string,
    filter?: { readonly lifecycle?: OperatingCoreFormLifecycle },
  ): Promise<readonly OperatingCoreFormDefinition[]>
  update(input: UpdateFormInput): Promise<OperatingCoreFormDefinition>

  // Submissions
  submit(input: SubmitFormInput): Promise<OperatingCoreFormSubmission>
  listSubmissionsByForm(
    form_id: string,
    filter?: { readonly since?: string },
  ): Promise<readonly OperatingCoreFormSubmission[]>
}
