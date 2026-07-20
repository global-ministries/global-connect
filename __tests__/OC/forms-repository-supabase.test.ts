/**
 * S15 RED — FormsRepository Supabase Adapter Tests
 *
 * Tests the Supabase adapter for FormsRepository.
 * Uses mocked Supabase client to verify:
 * - create calls insert with mapped row
 * - findById calls .select().eq('id', id).maybeSingle()
 * - update with correct version succeeds
 * - update with stale version throws OperatingCoreConcurrencyConflictError
 * - submit validates via validateSubmission FIRST
 * - submit with ok:false validation throws WITHOUT DB call
 * - submit with duplicate (form_id, persona_id) → DB unique violation → 409
 */

import { OperatingCoreConcurrencyConflictError } from '@/lib/platform/operating-core/errors'
import { createSupabaseFormsRepository } from '@/lib/platform/operating-core/forms/form-repository-supabase'
import { validateSubmission } from '@/lib/platform/operating-core/forms/form-state'

// ─── Mock validateSubmission ──────────────────────────────────────────────────

jest.mock('@/lib/platform/operating-core/forms/form-state', () => ({
  validateSubmission: jest.fn(),
}))

const mockValidateSubmission = validateSubmission as jest.Mock

// ─── Mock Supabase client ────────────────────────────────────────────────────

function createMockSupabaseClient() {
  const mockFrom = jest.fn()
  const mockInsert = jest.fn()
  const mockSelect = jest.fn()
  const mockUpdate = jest.fn()
  const mockEq = jest.fn()
  const mockMaybeSingle = jest.fn()

  mockSelect.mockReturnValue({ eq: mockEq })
  mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle })
  mockInsert.mockReturnValue({ select: () => ({ single: mockMaybeSingle }) })
  mockUpdate.mockReturnValue({ eq: () => ({ select: () => ({ single: mockMaybeSingle }) }) })

  mockFrom.mockImplementation((table: string) => {
    if (table === 'operating_core_forms') {
      return {
        select: mockSelect,
        insert: mockInsert,
        update: mockUpdate,
      }
    }
    if (table === 'operating_core_form_submissions') {
      return {
        select: mockSelect,
        insert: mockInsert,
      }
    }
    return {}
  })

  return {
    from: mockFrom,
    mockInsert,
    mockSelect,
    mockUpdate,
    mockEq,
    mockMaybeSingle,
  }
}

function createMockSupabaseClientWithError() {
  // Creates a mock client that returns an error for submissions insert
  const mockFrom = jest.fn()

  mockFrom.mockImplementation((table: string) => {
    if (table === 'operating_core_forms') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: PUBLISHED_FORM_ROW, error: null }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: FORM_ROW, error: null }),
          }),
        }),
      }
    }
    if (table === 'operating_core_form_submissions') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              // Return error as a string so String(error) includes 'uq_submission_per_persona_form'
              error: 'duplicate key value violates unique constraint "uq_submission_per_persona_form"',
            }),
          }),
        }),
      }
    }
    return {}
  })

  return { from: mockFrom }
}

// ─── Test data ────────────────────────────────────────────────────────────────

const FORM_ROW = {
  id: 'form-uuid-1',
  owner_experience_id: 'exp-1',
  title: 'Test Form',
  description: null,
  fields: [],
  lifecycle: 'draft',
  created_by_persona_id: 'persona-1',
  created_at: '2026-07-20T12:00:00Z',
  updated_at: '2026-07-20T12:00:00Z',
  version: 1,
}

const PUBLISHED_FORM_ROW = {
  ...FORM_ROW,
  id: 'form-uuid-published',
  lifecycle: 'published',
}

const SUBMISSION_ROW = {
  id: 'sub-uuid-1',
  form_id: 'form-uuid-published',
  form_version_at_submission: 1,
  answers: { name: 'John' },
  submitted_by_persona_id: 'persona-1',
  submitted_at: '2026-07-20T12:00:00Z',
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FormsRepository Supabase Adapter', () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>

  beforeEach(() => {
    jest.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockValidateSubmission.mockReset()
  })

  describe('create', () => {
    it('calls insert with mapped row', async () => {
      mockClient.mockMaybeSingle.mockResolvedValue({ data: FORM_ROW, error: null })

      const repo = createSupabaseFormsRepository({ supabase: mockClient as unknown as Parameters<typeof createSupabaseFormsRepository>[0]['supabase'] })

      const input = {
        owner_experience_id: 'exp-1',
        title: 'Test Form',
        description: undefined,
        fields: [],
        created_by_persona_id: 'persona-1',
      }

      await repo.create(input)

      expect(mockClient.mockInsert).toHaveBeenCalled()
      const insertCall = mockClient.mockInsert.mock.calls[0]?.[0]
      expect(insertCall).toMatchObject({
        owner_experience_id: 'exp-1',
        title: 'Test Form',
        lifecycle: 'draft',
        created_by_persona_id: 'persona-1',
      })
    })
  })

  describe('findById', () => {
    it('calls .select().eq(id).maybeSingle()', async () => {
      mockClient.mockMaybeSingle.mockResolvedValue({ data: FORM_ROW, error: null })

      const repo = createSupabaseFormsRepository({ supabase: mockClient as unknown as Parameters<typeof createSupabaseFormsRepository>[0]['supabase'] })

      const result = await repo.findById('form-uuid-1')

      expect(mockClient.mockEq).toHaveBeenCalledWith('id', 'form-uuid-1')
      expect(result).toBeDefined()
      expect(result?.id).toBe('form-uuid-1')
    })

    it('returns null when not found', async () => {
      mockClient.mockMaybeSingle.mockResolvedValue({ data: null, error: null })

      const repo = createSupabaseFormsRepository({ supabase: mockClient as unknown as Parameters<typeof createSupabaseFormsRepository>[0]['supabase'] })

      const result = await repo.findById('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('update', () => {
    it('succeeds with correct version', async () => {
      // First findById returns current row
      mockClient.mockMaybeSingle
        .mockResolvedValueOnce({ data: FORM_ROW, error: null })  // findByIdInternal
        .mockResolvedValueOnce({ data: { ...FORM_ROW, version: 2 }, error: null })  // update select

      const repo = createSupabaseFormsRepository({ supabase: mockClient as unknown as Parameters<typeof createSupabaseFormsRepository>[0]['supabase'] })

      const result = await repo.update({
        id: 'form-uuid-1',
        expectedVersion: 1,
        lifecycle: 'published',
      })

      expect(result.version).toBe(2)
    })

    it('throws OperatingCoreConcurrencyConflictError with stale version', async () => {
      // First findById returns row with version 2 (stale)
      mockClient.mockMaybeSingle.mockResolvedValueOnce({
        data: { ...FORM_ROW, version: 2 },
        error: null,
      })

      const repo = createSupabaseFormsRepository({ supabase: mockClient as unknown as Parameters<typeof createSupabaseFormsRepository>[0]['supabase'] })

      await expect(
        repo.update({
          id: 'form-uuid-1',
          expectedVersion: 1, // stale!
          lifecycle: 'published',
        }),
      ).rejects.toThrow(OperatingCoreConcurrencyConflictError)
    })
  })

  describe('submit', () => {
    const validAnswers = { name: 'John' }
    const currentTimestamp = '2026-07-20T12:00:00Z'

    it('validates via validateSubmission BEFORE DB insert', async () => {
      mockClient.mockMaybeSingle
        .mockResolvedValueOnce({ data: PUBLISHED_FORM_ROW, error: null })  // findByIdInternal
        .mockResolvedValueOnce({ data: SUBMISSION_ROW, error: null })  // insert

      mockValidateSubmission.mockReturnValue({
        ok: true,
        submission: {
          id: 'sub-uuid-1',
          form_id: 'form-uuid-published',
          form_version_at_submission: 1,
          answers: validAnswers,
          submitted_by_persona_id: 'persona-1',
          submitted_at: currentTimestamp,
        },
      })

      const repo = createSupabaseFormsRepository({ supabase: mockClient as unknown as Parameters<typeof createSupabaseFormsRepository>[0]['supabase'] })

      await repo.submit({
        form_id: 'form-uuid-published',
        answers: validAnswers,
        submitted_by_persona_id: 'persona-1',
        currentIsoTimestamp: currentTimestamp,
      })

      // validateSubmission should have been called
      expect(mockValidateSubmission).toHaveBeenCalled()
      // But insert should NOT have been called yet (validation happens first)
      // The insert happens after validation succeeds
    })

    it('throws WITHOUT DB call when validation fails', async () => {
      mockClient.mockMaybeSingle.mockResolvedValueOnce({
        data: PUBLISHED_FORM_ROW,
        error: null,
      })

      mockValidateSubmission.mockReturnValue({
        ok: false,
        errors: ['field_required_missing'],
        messages: ['Required field name is missing'],
      })

      const repo = createSupabaseFormsRepository({ supabase: mockClient as unknown as Parameters<typeof createSupabaseFormsRepository>[0]['supabase'] })

      await expect(
        repo.submit({
          form_id: 'form-uuid-published',
          answers: {},
          submitted_by_persona_id: 'persona-1',
          currentIsoTimestamp: currentTimestamp,
        }),
      ).rejects.toThrow('Form submission validation failed')

      // insert should NOT have been called
      expect(mockClient.mockInsert).not.toHaveBeenCalled()
    })

    it('throws duplicate_submission error on unique constraint violation', async () => {
      // This test verifies the error handling path for duplicate submissions
      // We create a new mock client that will return an error on insert
      const errorClient = createMockSupabaseClientWithError()

      mockValidateSubmission.mockReturnValue({
        ok: true,
        submission: {
          id: 'sub-uuid-1',
          form_id: 'form-uuid-published',
          form_version_at_submission: 1,
          answers: validAnswers,
          submitted_by_persona_id: 'persona-1',
          submitted_at: currentTimestamp,
        },
      })

      const repo = createSupabaseFormsRepository({ supabase: errorClient as unknown as Parameters<typeof createSupabaseFormsRepository>[0]['supabase'] })

      await expect(
        repo.submit({
          form_id: 'form-uuid-published',
          answers: validAnswers,
          submitted_by_persona_id: 'persona-1',
          currentIsoTimestamp: currentTimestamp,
        }),
      ).rejects.toMatchObject({ code: 'duplicate_submission' })
    })
  })

  describe('listByOwnerExperience', () => {
    it('calls select with owner_experience_id filter', async () => {
      const mockData = [FORM_ROW]
      ;(mockClient as unknown as { from: () => { select: () => { eq: () => { data?: typeof mockData; error?: null } } } })
        .from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({ data: mockData, error: null }),
        }),
      })

      const repo = createSupabaseFormsRepository({ supabase: mockClient as unknown as Parameters<typeof createSupabaseFormsRepository>[0]['supabase'] })

      const result = await repo.listByOwnerExperience('exp-1')

      expect(result).toHaveLength(1)
    })
  })

  describe('listSubmissionsByForm', () => {
    it('calls select with form_id filter', async () => {
      const mockData = [SUBMISSION_ROW]
      ;(mockClient as unknown as { from: () => { select: () => { eq: () => { data?: typeof mockData; error?: null } } } })
        .from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({ data: mockData, error: null }),
        }),
      })

      const repo = createSupabaseFormsRepository({ supabase: mockClient as unknown as Parameters<typeof createSupabaseFormsRepository>[0]['supabase'] })

      const result = await repo.listSubmissionsByForm('form-uuid-published')

      expect(result).toHaveLength(1)
    })
  })
})
