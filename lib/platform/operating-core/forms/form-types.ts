/**
 * S14 — Operating Core Forms domain types.
 * CLOSED field-type union: exactly 9 values.
 * 3-state lifecycle: draft | published | archived.
 */

// ---------------------------------------------------------------------------
// Constants — closed unions
// ---------------------------------------------------------------------------

/** Exactly 9 field types. Adding/removing is a TypeScript-breaking change. */
export const OPERATING_CORE_FORM_FIELD_TYPES = [
  'text',
  'email',
  'phone',
  'number',
  'date',
  'select',
  'multiselect',
  'checkbox',
  'textarea',
] as const

export type OperatingCoreFormFieldType = (typeof OPERATING_CORE_FORM_FIELD_TYPES)[number]

/** Exactly 3 lifecycle states. */
export const OPERATING_CORE_FORM_LIFECYCLES = ['draft', 'published', 'archived'] as const

export type OperatingCoreFormLifecycle = (typeof OPERATING_CORE_FORM_LIFECYCLES)[number]

// ---------------------------------------------------------------------------
// Field types
// ---------------------------------------------------------------------------

export interface OperatingCoreFormFieldValidation {
  readonly minLength?: number
  readonly maxLength?: number
  /** Regex pattern — validated for text/email/phone fields */
  readonly pattern?: string
}

export interface OperatingCoreFormField {
  readonly key: string
  readonly label: string
  readonly type: OperatingCoreFormFieldType
  readonly required: boolean
  /** Required for select/multiselect field types */
  readonly options?: readonly string[]
  readonly validation?: OperatingCoreFormFieldValidation
  readonly order: number
}

// ---------------------------------------------------------------------------
// Form definition
// ---------------------------------------------------------------------------

export interface OperatingCoreFormDefinition {
  readonly id: string
  /** OC-scoped ownership — NOT Fase 1 'experiencia' */
  readonly owner_experience_id: string
  readonly title: string
  readonly description?: string
  readonly fields: readonly OperatingCoreFormField[]
  readonly lifecycle: OperatingCoreFormLifecycle
  readonly created_by_persona_id: string
  readonly created_at: string
  readonly updated_at: string
  /** Optimistic concurrency version for submissions */
  readonly version: number
}

// ---------------------------------------------------------------------------
// Form submission
// ---------------------------------------------------------------------------

/**
 * Form answer values — NO null (jsonb non-null invariant).
 * Type-level enforcement: do NOT widen to include null | undefined.
 */
export type FormAnswerValue = string | number | boolean | readonly string[]

export interface OperatingCoreFormSubmission {
  readonly id: string
  readonly form_id: string
  /** Snapshot of form.version at time of submission */
  readonly form_version_at_submission: number
  readonly answers: Readonly<Record<string, FormAnswerValue>>
  readonly submitted_by_persona_id: string
  readonly submitted_at: string
}

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

export type OperatingCoreFormValidationError =
  | 'form_not_published' // form.lifecycle === 'draft'
  | 'form_archived' // form.lifecycle === 'archived'
  | 'field_required_missing'
  | 'field_invalid_format'
  | 'field_out_of_options' // select/multiselect with value not in options
  | 'field_pattern_mismatch'
  | 'answers_null_value' // any answer is null/undefined (defensive check)

export interface FormSubmissionValidationSuccess {
  readonly ok: true
  readonly submission: OperatingCoreFormSubmission
}

export interface FormSubmissionValidationFailure {
  readonly ok: false
  readonly errors: readonly OperatingCoreFormValidationError[]
  readonly messages: readonly string[]
}

export type FormSubmissionValidationResult =
  | FormSubmissionValidationSuccess
  | FormSubmissionValidationFailure
