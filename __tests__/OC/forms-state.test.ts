/**
 * S14 TDD RED — forms-state pure functions
 * Tests cover:
 * - validateAnswerType for all 9 field types (positive + negative)
 * - canAcceptSubmission for all 3 lifecycle states
 * - validateSubmission for draft/published/archived, required fields, type mismatch, option membership, pattern
 */
import {
  OPERATING_CORE_FORM_FIELD_TYPES,
  OPERATING_CORE_FORM_LIFECYCLES,
  type OperatingCoreFormLifecycle,
  type OperatingCoreFormField,
  type OperatingCoreFormDefinition,
  type FormAnswerValue,
} from '@/lib/platform/operating-core/forms/form-types'

// ---------------------------------------------------------------------------
// Static verification — constants match spec exactly
// ---------------------------------------------------------------------------

describe('OPERATING_CORE_FORM_FIELD_TYPES constant', () => {
  it('has exactly 9 values', () => {
    expect(OPERATING_CORE_FORM_FIELD_TYPES).toHaveLength(9)
  })

  it('contains text, email, phone, number, date, select, multiselect, checkbox, textarea', () => {
    const expected = ['text', 'email', 'phone', 'number', 'date', 'select', 'multiselect', 'checkbox', 'textarea']
    for (const type of expected) {
      expect(OPERATING_CORE_FORM_FIELD_TYPES).toContain(type)
    }
  })
})

describe('OPERATING_CORE_FORM_LIFECYCLES constant', () => {
  it('has exactly 3 values', () => {
    expect(OPERATING_CORE_FORM_LIFECYCLES).toHaveLength(3)
  })

  it('contains draft, published, archived', () => {
    expect(OPERATING_CORE_FORM_LIFECYCLES).toContain('draft')
    expect(OPERATING_CORE_FORM_LIFECYCLES).toContain('published')
    expect(OPERATING_CORE_FORM_LIFECYCLES).toContain('archived')
  })
})

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function makeField(overrides: Partial<OperatingCoreFormField> = {}): OperatingCoreFormField {
  return {
    key: 'field-1',
    label: 'Test Field',
    type: 'text',
    required: false,
    order: 0,
    ...overrides,
  }
}

function makeForm(overrides: Partial<OperatingCoreFormDefinition> = {}): OperatingCoreFormDefinition {
  const now = '2026-07-20T12:00:00.000Z'
  return {
    id: 'form-1',
    owner_experience_id: 'exp-1',
    title: 'Test Form',
    description: 'A test form',
    fields: [],
    lifecycle: 'published',
    created_by_persona_id: 'persona-1',
    created_at: now,
    updated_at: now,
    version: 1,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// validateAnswerType
// ---------------------------------------------------------------------------

describe('validateAnswerType', () => {
  // We import dynamically since the function doesn't exist yet (RED phase)
  // The test will fail to compile until we create the function
  let validateAnswerType: (field: OperatingCoreFormField, value: unknown) => boolean

  beforeAll(async () => {
    const mod = await import('@/lib/platform/operating-core/forms/form-state')
    validateAnswerType = mod.validateAnswerType
  })

  // ---- text ----
  describe('text field type', () => {
    it('accepts a plain string', () => {
      const field = makeField({ type: 'text' })
      expect(validateAnswerType(field, 'hello')).toBe(true)
    })

    it('rejects a number', () => {
      const field = makeField({ type: 'text' })
      expect(validateAnswerType(field, 42)).toBe(false)
    })

    it('rejects a boolean', () => {
      const field = makeField({ type: 'text' })
      expect(validateAnswerType(field, true)).toBe(false)
    })

    it('rejects null', () => {
      const field = makeField({ type: 'text' })
      expect(validateAnswerType(field, null)).toBe(false)
    })
  })

  // ---- email ----
  describe('email field type', () => {
    it('accepts a string value', () => {
      const field = makeField({ type: 'email' })
      expect(validateAnswerType(field, 'test@example.com')).toBe(true)
    })

    it('rejects a number', () => {
      const field = makeField({ type: 'email' })
      expect(validateAnswerType(field, 123)).toBe(false)
    })
  })

  // ---- phone ----
  describe('phone field type', () => {
    it('accepts a string value', () => {
      const field = makeField({ type: 'phone' })
      expect(validateAnswerType(field, '+5491112345678')).toBe(true)
    })

    it('rejects a boolean', () => {
      const field = makeField({ type: 'phone' })
      expect(validateAnswerType(field, false)).toBe(false)
    })
  })

  // ---- number ----
  describe('number field type', () => {
    it('accepts a finite number', () => {
      const field = makeField({ type: 'number' })
      expect(validateAnswerType(field, 42)).toBe(true)
    })

    it('accepts zero', () => {
      const field = makeField({ type: 'number' })
      expect(validateAnswerType(field, 0)).toBe(true)
    })

    it('accepts negative numbers', () => {
      const field = makeField({ type: 'number' })
      expect(validateAnswerType(field, -10.5)).toBe(true)
    })

    it('rejects NaN', () => {
      const field = makeField({ type: 'number' })
      expect(validateAnswerType(field, NaN)).toBe(false)
    })

    it('rejects a string', () => {
      const field = makeField({ type: 'number' })
      expect(validateAnswerType(field, '42')).toBe(false)
    })
  })

  // ---- date ----
  describe('date field type', () => {
    it('accepts a string in YYYY-MM-DD format', () => {
      const field = makeField({ type: 'date' })
      expect(validateAnswerType(field, '2026-07-20')).toBe(true)
    })

    it('rejects a malformed date string', () => {
      const field = makeField({ type: 'date' })
      expect(validateAnswerType(field, 'not-a-date')).toBe(false)
    })

    it('rejects a number', () => {
      const field = makeField({ type: 'date' })
      expect(validateAnswerType(field, 20260720)).toBe(false)
    })
  })

  // ---- select ----
  describe('select field type', () => {
    it('accepts a string value', () => {
      const field = makeField({ type: 'select', options: ['a', 'b', 'c'] })
      expect(validateAnswerType(field, 'a')).toBe(true)
    })

    it('rejects an array', () => {
      const field = makeField({ type: 'select', options: ['a', 'b', 'c'] })
      expect(validateAnswerType(field, ['a', 'b'])).toBe(false)
    })

    it('rejects a number', () => {
      const field = makeField({ type: 'select', options: ['a', 'b', 'c'] })
      expect(validateAnswerType(field, 1)).toBe(false)
    })
  })

  // ---- multiselect ----
  describe('multiselect field type', () => {
    it('accepts a non-empty readonly string array', () => {
      const field = makeField({ type: 'multiselect', options: ['a', 'b', 'c'] })
      expect(validateAnswerType(field, ['a', 'b'] as unknown as FormAnswerValue)).toBe(true)
    })

    it('accepts an empty readonly string array', () => {
      const field = makeField({ type: 'multiselect', options: ['a', 'b', 'c'] })
      expect(validateAnswerType(field, [] as unknown as FormAnswerValue)).toBe(true)
    })

    it('rejects a plain string', () => {
      const field = makeField({ type: 'multiselect', options: ['a', 'b', 'c'] })
      expect(validateAnswerType(field, 'a')).toBe(false)
    })

    it('rejects a readonly array of numbers', () => {
      const field = makeField({ type: 'multiselect', options: ['a', 'b', 'c'] })
      expect(validateAnswerType(field, [1, 2] as unknown as FormAnswerValue)).toBe(false)
    })
  })

  // ---- checkbox ----
  describe('checkbox field type', () => {
    it('accepts true', () => {
      const field = makeField({ type: 'checkbox' })
      expect(validateAnswerType(field, true)).toBe(true)
    })

    it('accepts false', () => {
      const field = makeField({ type: 'checkbox' })
      expect(validateAnswerType(field, false)).toBe(true)
    })

    it('rejects a string', () => {
      const field = makeField({ type: 'checkbox' })
      expect(validateAnswerType(field, 'true')).toBe(false)
    })

    it('rejects a number', () => {
      const field = makeField({ type: 'checkbox' })
      expect(validateAnswerType(field, 1)).toBe(false)
    })
  })

  // ---- textarea ----
  describe('textarea field type', () => {
    it('accepts a string', () => {
      const field = makeField({ type: 'textarea' })
      expect(validateAnswerType(field, 'long text here')).toBe(true)
    })

    it('rejects a number', () => {
      const field = makeField({ type: 'textarea' })
      expect(validateAnswerType(field, 123)).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// canAcceptSubmission
// ---------------------------------------------------------------------------

describe('canAcceptSubmission', () => {
  let canAcceptSubmission: (lifecycle: OperatingCoreFormLifecycle) => boolean

  beforeAll(async () => {
    const mod = await import('@/lib/platform/operating-core/forms/form-state')
    canAcceptSubmission = mod.canAcceptSubmission
  })

  it('returns false for draft lifecycle', () => {
    expect(canAcceptSubmission('draft')).toBe(false)
  })

  it('returns true for published lifecycle', () => {
    expect(canAcceptSubmission('published')).toBe(true)
  })

  it('returns false for archived lifecycle', () => {
    expect(canAcceptSubmission('archived')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// validateOptionMembership
// ---------------------------------------------------------------------------

describe('validateOptionMembership', () => {
  let validateOptionMembership: (field: OperatingCoreFormField, value: FormAnswerValue) => boolean

  beforeAll(async () => {
    const mod = await import('@/lib/platform/operating-core/forms/form-state')
    validateOptionMembership = mod.validateOptionMembership
  })

  it('returns true when value is in options (select)', () => {
    const field = makeField({ type: 'select', options: ['a', 'b', 'c'] })
    expect(validateOptionMembership(field, 'a')).toBe(true)
  })

  it('returns false when value is not in options (select)', () => {
    const field = makeField({ type: 'select', options: ['a', 'b', 'c'] })
    expect(validateOptionMembership(field, 'd')).toBe(false)
  })

  it('returns true when all values are in options (multiselect)', () => {
    const field = makeField({ type: 'multiselect', options: ['a', 'b', 'c'] })
    expect(validateOptionMembership(field, ['a', 'c'] as unknown as FormAnswerValue)).toBe(true)
  })

  it('returns false when any value is not in options (multiselect)', () => {
    const field = makeField({ type: 'multiselect', options: ['a', 'b', 'c'] })
    expect(validateOptionMembership(field, ['a', 'd'] as unknown as FormAnswerValue)).toBe(false)
  })

  it('returns false for fields without options', () => {
    const field = makeField({ type: 'text' })
    expect(validateOptionMembership(field, 'anything' as unknown as FormAnswerValue)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// validateSubmission
// ---------------------------------------------------------------------------

describe('validateSubmission', () => {
  let validateSubmission: (
    form: OperatingCoreFormDefinition,
    answers: Readonly<Record<string, unknown>>,
    currentIsoTimestamp: string,
  ) => import('@/lib/platform/operating-core/forms/form-types').FormSubmissionValidationResult

  beforeAll(async () => {
    const mod = await import('@/lib/platform/operating-core/forms/form-state')
    validateSubmission = mod.validateSubmission
  })

  // ---- Lifecycle gating ----
  describe('lifecycle gating', () => {
    it('rejects submission to draft form with form_not_published error', () => {
      const form = makeForm({ lifecycle: 'draft' })
      const result = validateSubmission(form, {}, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errors).toContain('form_not_published')
    })

    it('rejects submission to archived form with form_archived error', () => {
      const form = makeForm({ lifecycle: 'archived' })
      const result = validateSubmission(form, {}, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errors).toContain('form_archived')
    })

    it('accepts submission to published form with no errors', () => {
      const form = makeForm({ lifecycle: 'published', fields: [] })
      const result = validateSubmission(form, {}, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(true)
    })
  })

  // ---- Required field missing ----
  describe('required field validation', () => {
    it('returns field_required_missing when a required field has no answer', () => {
      const form = makeForm({
        lifecycle: 'published',
        fields: [makeField({ key: 'name', label: 'Name', type: 'text', required: true })],
      })
      const result = validateSubmission(form, {}, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errors).toContain('field_required_missing')
    })

    it('accepts when required field has a truthy answer', () => {
      const form = makeForm({
        lifecycle: 'published',
        fields: [makeField({ key: 'name', label: 'Name', type: 'text', required: true })],
      })
      const result = validateSubmission(form, { name: 'John' }, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(true)
    })

    it('rejects when required field answer is an empty string (falsy)', () => {
      const form = makeForm({
        lifecycle: 'published',
        fields: [makeField({ key: 'name', label: 'Name', type: 'text', required: true })],
      })
      const result = validateSubmission(form, { name: '' }, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errors).toContain('field_required_missing')
    })

    it('does NOT flag optional fields with no answer', () => {
      const form = makeForm({
        lifecycle: 'published',
        fields: [makeField({ key: 'nickname', label: 'Nickname', type: 'text', required: false })],
      })
      const result = validateSubmission(form, {}, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(true)
    })
  })

  // ---- Type mismatch ----
  describe('type validation', () => {
    it('returns field_invalid_format when number field receives a string', () => {
      const form = makeForm({
        lifecycle: 'published',
        fields: [makeField({ key: 'age', label: 'Age', type: 'number', required: true })],
      })
      const result = validateSubmission(form, { age: 'twenty' }, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errors).toContain('field_invalid_format')
    })

    it('returns field_invalid_format when checkbox field receives a string', () => {
      const form = makeForm({
        lifecycle: 'published',
        fields: [makeField({ key: 'agree', label: 'Agree', type: 'checkbox', required: true })],
      })
      const result = validateSubmission(form, { agree: 'yes' }, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errors).toContain('field_invalid_format')
    })

    it('returns field_invalid_format when date field receives a number', () => {
      const form = makeForm({
        lifecycle: 'published',
        fields: [makeField({ key: 'birthday', label: 'Birthday', type: 'date', required: true })],
      })
      const result = validateSubmission(form, { birthday: 19900101 }, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errors).toContain('field_invalid_format')
    })
  })

  // ---- Option membership ----
  describe('option membership (select/multiselect)', () => {
    it('returns field_out_of_options when select value is not in options', () => {
      const form = makeForm({
        lifecycle: 'published',
        fields: [
          makeField({ key: 'color', label: 'Color', type: 'select', options: ['red', 'green', 'blue'], required: true }),
        ],
      })
      const result = validateSubmission(form, { color: 'yellow' }, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errors).toContain('field_out_of_options')
    })

    it('accepts select value that is in options', () => {
      const form = makeForm({
        lifecycle: 'published',
        fields: [
          makeField({ key: 'color', label: 'Color', type: 'select', options: ['red', 'green', 'blue'], required: true }),
        ],
      })
      const result = validateSubmission(form, { color: 'red' }, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(true)
    })

    it('returns field_out_of_options when multiselect has value not in options', () => {
      const form = makeForm({
        lifecycle: 'published',
        fields: [
          makeField({ key: 'colors', label: 'Colors', type: 'multiselect', options: ['red', 'green', 'blue'], required: true }),
        ],
      })
      const result = validateSubmission(form, { colors: ['red', 'yellow'] }, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errors).toContain('field_out_of_options')
    })
  })

  // ---- Pattern mismatch ----
  describe('pattern validation (text/email/phone)', () => {
    it('returns field_pattern_mismatch when pattern does not match', () => {
      const form = makeForm({
        lifecycle: 'published',
        fields: [
          makeField({ key: 'code', label: 'Code', type: 'text', required: true, validation: { pattern: '^[A-Z]{3}$' } }),
        ],
      })
      const result = validateSubmission(form, { code: 'abc' }, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errors).toContain('field_pattern_mismatch')
    })

    it('accepts when pattern matches', () => {
      const form = makeForm({
        lifecycle: 'published',
        fields: [
          makeField({ key: 'code', label: 'Code', type: 'text', required: true, validation: { pattern: '^[A-Z]{3}$' } }),
        ],
      })
      const result = validateSubmission(form, { code: 'ABC' }, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(true)
    })

    it('skips pattern validation when pattern is not provided', () => {
      const form = makeForm({
        lifecycle: 'published',
        fields: [
          makeField({ key: 'name', label: 'Name', type: 'text', required: true }),
        ],
      })
      const result = validateSubmission(form, { name: 'anything goes' }, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(true)
    })
  })

  // ---- Null value guard ----
  describe('null value guard', () => {
    it('returns answers_null_value when any answer is null', () => {
      const form = makeForm({
        lifecycle: 'published',
        fields: [makeField({ key: 'name', label: 'Name', type: 'text', required: true })],
      })
      const result = validateSubmission(form, { name: null }, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errors).toContain('answers_null_value')
    })

    it('returns field_required_missing when a required field is not provided (undefined key)', () => {
      const form = makeForm({
        lifecycle: 'published',
        fields: [makeField({ key: 'name', label: 'Name', type: 'text', required: true })],
      })
      // Using {} means the key doesn't exist → undefined access → field_required_missing
      const result = validateSubmission(form, {}, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.errors).toContain('field_required_missing')
    })
  })

  // ---- Full valid submission ----
  describe('full valid submission', () => {
    it('returns ok:true with a FormSubmission on valid submission', () => {
      const form = makeForm({
        id: 'form-valid',
        lifecycle: 'published',
        version: 3,
        fields: [
          makeField({ key: 'name', label: 'Name', type: 'text', required: true }),
          makeField({ key: 'age', label: 'Age', type: 'number', required: false }),
          makeField({ key: 'subscribe', label: 'Subscribe', type: 'checkbox', required: false }),
        ],
      })
      const answers = { name: 'John', age: 30, subscribe: true }
      const result = validateSubmission(form, answers, '2026-07-20T12:00:00.000Z')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.submission.form_id).toBe('form-valid')
      expect(result.submission.form_version_at_submission).toBe(3)
      // submitted_by_persona_id is set to empty string by validateSubmission
      // the repository's submit() method fills this in after validation
      expect(result.submission.submitted_by_persona_id).toBe('')
    })
  })
})
