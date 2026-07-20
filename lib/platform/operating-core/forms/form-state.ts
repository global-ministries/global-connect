/**
 * S14 — Operating Core Forms state machine and validation.
 * Pure functions: no side effects, no I/O.
 */
import type {
  OperatingCoreFormDefinition,
  OperatingCoreFormField,
  OperatingCoreFormLifecycle,
  OperatingCoreFormValidationError,
  FormSubmissionValidationResult,
  FormAnswerValue,
} from './form-types'

// ---------------------------------------------------------------------------
// canAcceptSubmission
// ---------------------------------------------------------------------------

/**
 * Can a form in this lifecycle accept new submissions?
 * `published` ONLY. `draft` and `archived` reject.
 */
export function canAcceptSubmission(lifecycle: OperatingCoreFormLifecycle): boolean {
  return lifecycle === 'published'
}

// ---------------------------------------------------------------------------
// validateAnswerType
// ---------------------------------------------------------------------------

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Type-level validator: is the value the right JS type for the field type?
 * Does NOT validate format (pattern) or options membership.
 */
export function validateAnswerType(field: OperatingCoreFormField, value: unknown): boolean {
  switch (field.type) {
    case 'text':
    case 'email':
    case 'phone':
    case 'textarea':
      return typeof value === 'string'

    case 'number':
      return typeof value === 'number' && Number.isFinite(value)

    case 'checkbox':
      return typeof value === 'boolean'

    case 'select':
      return typeof value === 'string'

    case 'multiselect':
      if (!Array.isArray(value)) return false
      // All elements must be strings (readonly string[])
      return (value as unknown[]).every((v) => typeof v === 'string')

    case 'date':
      if (typeof value !== 'string') return false
      return DATE_PATTERN.test(value)

    default: {
      // Exhaustiveness check
      const _exhaustive: never = field.type
      return _exhaustive
    }
  }
}

// ---------------------------------------------------------------------------
// validateOptionMembership
// ---------------------------------------------------------------------------

/**
 * Membership check for select/multiselect fields.
 * Returns false for fields without options or with non-matching values.
 */
export function validateOptionMembership(field: OperatingCoreFormField, value: FormAnswerValue): boolean {
  // Only select/multiselect have options
  if (field.type !== 'select' && field.type !== 'multiselect') {
    return false
  }

  // Fields without options can't have valid membership
  if (!field.options || field.options.length === 0) {
    return false
  }

  if (field.type === 'select') {
    const strValue = value as string
    return field.options.includes(strValue)
  }

  // multiselect — every element must be in options
  const arrValue = value as readonly string[]
  return arrValue.every((v) => field.options!.includes(v))
}

// ---------------------------------------------------------------------------
// validateSubmission
// ---------------------------------------------------------------------------

/**
 * Full submission validator.
 * Returns discriminated union: { ok: true, submission } | { ok: false, errors, messages }
 */
export function validateSubmission(
  form: OperatingCoreFormDefinition,
  answers: Readonly<Record<string, unknown>>,
  currentIsoTimestamp: string,
): FormSubmissionValidationResult {
  const errors: OperatingCoreFormValidationError[] = []
  const messages: string[] = []

  // 1. Lifecycle gating
  if (form.lifecycle === 'draft') {
    errors.push('form_not_published')
    messages.push(`Form '${form.id}' is in draft state and is not accepting submissions.`)
    return { ok: false, errors, messages }
  }

  if (form.lifecycle === 'archived') {
    errors.push('form_archived')
    messages.push(`Form '${form.id}' is archived and is no longer accepting submissions.`)
    return { ok: false, errors, messages }
  }

  // Build a map of field key → field definition
  const fieldMap = new Map<string, OperatingCoreFormField>()
  for (const field of form.fields) {
    fieldMap.set(field.key, field)
  }

  // 2. Check each field
  for (const field of form.fields) {
    const answer = answers[field.key]

    // 2a. Null guard FIRST (defensive check per spec)
    // "any answer is null/undefined (should never happen with ts-strict)"
    if (answer === null) {
      errors.push('answers_null_value')
      messages.push(`Field '${field.key}' has a null value which is not allowed.`)
      continue
    }

    // 2b. Undefined means the field was not provided at all
    if (answer === undefined) {
      if (field.required) {
        errors.push('field_required_missing')
        messages.push(`Required field '${field.key}' is missing or empty.`)
      }
      continue
    }

    // 2c. Empty string check for required fields
    if (field.required && answer === '') {
      errors.push('field_required_missing')
      messages.push(`Required field '${field.key}' is missing or empty.`)
      continue
    }

    // 2d. Type validation
    if (!validateAnswerType(field, answer)) {
      errors.push('field_invalid_format')
      messages.push(`Field '${field.key}' has an invalid type. Expected ${field.type}.`)
      continue
    }

    // 2e. Option membership for select/multiselect
    if (field.type === 'select' || field.type === 'multiselect') {
      if (!validateOptionMembership(field, answer as FormAnswerValue)) {
        errors.push('field_out_of_options')
        messages.push(`Field '${field.key}' has a value not in the allowed options.`)
        continue
      }
    }

    // 2f. Pattern validation for text/email/phone
    if (
      (field.type === 'text' || field.type === 'email' || field.type === 'phone') &&
      field.validation?.pattern
    ) {
      // eslint-disable-next-line security/detect-non-literal-regexp -- user-provided via form definition
      const pattern = new RegExp(field.validation.pattern)
      if (!pattern.test(answer as string)) {
        errors.push('field_pattern_mismatch')
        messages.push(`Field '${field.key}' does not match the required pattern.`)
        continue
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, messages }
  }

  // Build the submission record
  const submission: import('./form-types').OperatingCoreFormSubmission = {
    id: crypto.randomUUID(),
    form_id: form.id,
    form_version_at_submission: form.version,
    answers: answers as Readonly<Record<string, FormAnswerValue>>,
    submitted_by_persona_id: '', // caller fills this after validation
    submitted_at: currentIsoTimestamp,
  }

  return { ok: true, submission }
}
