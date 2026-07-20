/**
 * S14 TDD RED — forms-repository tests with in-memory fake.
 * Tests cover:
 * - create + findById
 * - update with correct version → success; with wrong version → throws
 * - listByOwnerExperience
 * - submit returns submission with form_version_at_submission snapshot
 * - listSubmissionsByForm
 */
import { OperatingCoreConcurrencyConflictError } from '@/lib/platform/operating-core/errors'
import type {
  OperatingCoreFormField,
} from '@/lib/platform/operating-core/forms/form-types'
import type {
  CreateFormInput,
  UpdateFormInput,
  SubmitFormInput,
} from '@/lib/platform/operating-core/forms/form-repository'
import { createFormsRepositoryFake } from '@/lib/platform/operating-core/forms/form-repository-fake'

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

function makeCreateInput(overrides: Partial<CreateFormInput> = {}): CreateFormInput {
  return {
    owner_experience_id: 'exp-1',
    title: 'Test Form',
    description: 'A test form',
    fields: [],
    created_by_persona_id: 'persona-1',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// FormsRepository (fake)
// ---------------------------------------------------------------------------

describe('FormsRepository (fake)', () => {
  let repo: import('@/lib/platform/operating-core/forms/form-repository').FormsRepository

  beforeEach(() => {
    repo = createFormsRepositoryFake()
  })

  // ---------------------------------------------------------------------------
  // create + findById
  // ---------------------------------------------------------------------------

  describe('create + findById', () => {
    it('creates a form and returns it with all fields populated', async () => {
      const input = makeCreateInput({
        title: 'My Form',
        fields: [makeField({ key: 'name', label: 'Name', type: 'text', required: true })],
      })
      const form = await repo.create(input)
      expect(form.id).toBeDefined()
      expect(form.title).toBe('My Form')
      expect(form.owner_experience_id).toBe('exp-1')
      expect(form.lifecycle).toBe('draft') // new forms start as draft
      expect(form.fields).toHaveLength(1)
      expect(form.version).toBe(1)
      expect(form.created_at).toBeDefined()
      expect(form.updated_at).toBeDefined()
    })

    it('findById returns the created form', async () => {
      const input = makeCreateInput({ title: 'Find Me' })
      const created = await repo.create(input)
      const found = await repo.findById(created.id)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
      expect(found!.title).toBe('Find Me')
    })

    it('findById returns null for unknown id', async () => {
      const found = await repo.findById('unknown-id')
      expect(found).toBeNull()
    })

    it('created form has draft lifecycle by default', async () => {
      const input = makeCreateInput()
      const form = await repo.create(input)
      expect(form.lifecycle).toBe('draft')
    })
  })

  // ---------------------------------------------------------------------------
  // update with optimistic concurrency
  // ---------------------------------------------------------------------------

  describe('update — optimistic concurrency', () => {
    it('updates form with correct expectedVersion and increments version', async () => {
      const created = await repo.create(makeCreateInput())
      const update: UpdateFormInput = {
        id: created.id,
        expectedVersion: 1,
        title: 'Updated Title',
        lifecycle: 'published',
      }
      const updated = await repo.update(update)
      expect(updated.title).toBe('Updated Title')
      expect(updated.lifecycle).toBe('published')
      expect(updated.version).toBe(2)
    })

    it('throws OperatingCoreConcurrencyConflictError with wrong expectedVersion', async () => {
      const created = await repo.create(makeCreateInput())
      const update: UpdateFormInput = {
        id: created.id,
        expectedVersion: 99, // wrong version
        title: 'Should Fail',
      }
      await expect(repo.update(update)).rejects.toThrow(OperatingCoreConcurrencyConflictError)
    })

    it('persists the update and subsequent findById reflects changes', async () => {
      const created = await repo.create(makeCreateInput({ title: 'Original' }))
      await repo.update({ id: created.id, expectedVersion: 1, title: 'Modified' })
      const found = await repo.findById(created.id)
      expect(found!.title).toBe('Modified')
      expect(found!.version).toBe(2)
    })

    it('can transition from draft to published', async () => {
      const created = await repo.create(makeCreateInput())
      const updated = await repo.update({
        id: created.id,
        expectedVersion: 1,
        lifecycle: 'published',
      })
      expect(updated.lifecycle).toBe('published')
    })

    it('can transition from published to archived', async () => {
      const created = await repo.create(makeCreateInput({ lifecycle: 'published' } as CreateFormInput & { lifecycle: 'published' }))
      // First update to published if not already
      await repo.update({ id: created.id, expectedVersion: 1, lifecycle: 'published' })
      const updated = await repo.update({
        id: created.id,
        expectedVersion: 2,
        lifecycle: 'archived',
      })
      expect(updated.lifecycle).toBe('archived')
    })
  })

  // ---------------------------------------------------------------------------
  // listByOwnerExperience
  // ---------------------------------------------------------------------------

  describe('listByOwnerExperience', () => {
    it('returns all forms for an owner_experience_id', async () => {
      await repo.create(makeCreateInput({ owner_experience_id: 'exp-1', title: 'Form A' }))
      await repo.create(makeCreateInput({ owner_experience_id: 'exp-1', title: 'Form B' }))
      await repo.create(makeCreateInput({ owner_experience_id: 'exp-2', title: 'Form C' }))

      const list = await repo.listByOwnerExperience('exp-1')
      expect(list).toHaveLength(2)
      expect(list.map((f) => f.title).sort()).toEqual(['Form A', 'Form B'])
    })

    it('returns empty array when no forms exist for owner', async () => {
      const list = await repo.listByOwnerExperience('nonexistent')
      expect(list).toHaveLength(0)
    })

    it('can filter by lifecycle', async () => {
      await repo.create(makeCreateInput({ owner_experience_id: 'exp-1', title: 'Draft Form' }))
      const form2 = await repo.create(makeCreateInput({ owner_experience_id: 'exp-1', title: 'Pub Form' }))
      await repo.update({ id: form2.id, expectedVersion: 1, lifecycle: 'published' })

      const drafts = await repo.listByOwnerExperience('exp-1', { lifecycle: 'draft' })
      expect(drafts).toHaveLength(1)
      expect(drafts[0].title).toBe('Draft Form')

      const published = await repo.listByOwnerExperience('exp-1', { lifecycle: 'published' })
      expect(published).toHaveLength(1)
      expect(published[0].title).toBe('Pub Form')

      const archived = await repo.listByOwnerExperience('exp-1', { lifecycle: 'archived' })
      expect(archived).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------------------
  // submit — returns submission with form_version_at_submission snapshot
  // ---------------------------------------------------------------------------

  describe('submit', () => {
    it('rejects submission to draft form', async () => {
      const form = await repo.create(makeCreateInput())
      const input: SubmitFormInput = {
        form_id: form.id,
        answers: { name: 'John' },
        submitted_by_persona_id: 'persona-submitter',
        currentIsoTimestamp: '2026-07-20T12:00:00.000Z',
      }
      // The repository should call validateSubmission internally
      // which should reject draft forms
      await expect(repo.submit(input)).rejects.toThrow()
    })

    it('accepts submission to published form', async () => {
      const form = await repo.create(makeCreateInput({
        fields: [makeField({ key: 'name', label: 'Name', type: 'text', required: true })],
      }))
      // Publish the form
      await repo.update({ id: form.id, expectedVersion: 1, lifecycle: 'published' })

      const input: SubmitFormInput = {
        form_id: form.id,
        answers: { name: 'John' },
        submitted_by_persona_id: 'persona-submitter',
        currentIsoTimestamp: '2026-07-20T12:00:00.000Z',
      }
      const submission = await repo.submit(input)
      expect(submission.id).toBeDefined()
      expect(submission.form_id).toBe(form.id)
      expect(submission.form_version_at_submission).toBe(2) // version after publish
      expect(submission.submitted_by_persona_id).toBe('persona-submitter')
      expect(submission.submitted_at).toBe('2026-07-20T12:00:00.000Z')
    })

    it('captures form version snapshot at submission time', async () => {
      const form = await repo.create(makeCreateInput({ fields: [makeField({ key: 'name', label: 'Name', type: 'text', required: true })] }))
      await repo.update({ id: form.id, expectedVersion: 1, lifecycle: 'published' })
      // Update again to bump version
      await repo.update({ id: form.id, expectedVersion: 2, title: 'Updated Form' })

      const input: SubmitFormInput = {
        form_id: form.id,
        answers: { name: 'John' },
        submitted_by_persona_id: 'persona-submitter',
        currentIsoTimestamp: '2026-07-20T12:00:00.000Z',
      }
      const submission = await repo.submit(input)
      // Version at submission time should be 3 (after the second update)
      expect(submission.form_version_at_submission).toBe(3)
    })

    it('rejects submission to archived form', async () => {
      const form = await repo.create(makeCreateInput({ fields: [makeField({ key: 'name', label: 'Name', type: 'text', required: true })] }))
      await repo.update({ id: form.id, expectedVersion: 1, lifecycle: 'published' })
      await repo.update({ id: form.id, expectedVersion: 2, lifecycle: 'archived' })

      const input: SubmitFormInput = {
        form_id: form.id,
        answers: { name: 'John' },
        submitted_by_persona_id: 'persona-submitter',
        currentIsoTimestamp: '2026-07-20T12:00:00.000Z',
      }
      await expect(repo.submit(input)).rejects.toThrow()
    })
  })

  // ---------------------------------------------------------------------------
  // listSubmissionsByForm
  // ---------------------------------------------------------------------------

  describe('listSubmissionsByForm', () => {
    it('returns all submissions for a form', async () => {
      const form = await repo.create(makeCreateInput({ fields: [makeField({ key: 'name', label: 'Name', type: 'text', required: true })] }))
      await repo.update({ id: form.id, expectedVersion: 1, lifecycle: 'published' })

      await repo.submit({
        form_id: form.id,
        answers: { name: 'Alice' },
        submitted_by_persona_id: 'persona-1',
        currentIsoTimestamp: '2026-07-20T10:00:00.000Z',
      })
      await repo.submit({
        form_id: form.id,
        answers: { name: 'Bob' },
        submitted_by_persona_id: 'persona-2',
        currentIsoTimestamp: '2026-07-20T11:00:00.000Z',
      })

      const submissions = await repo.listSubmissionsByForm(form.id)
      expect(submissions).toHaveLength(2)
    })

    it('returns empty array when no submissions exist', async () => {
      const form = await repo.create(makeCreateInput())
      const submissions = await repo.listSubmissionsByForm(form.id)
      expect(submissions).toHaveLength(0)
    })

    it('can filter by since timestamp', async () => {
      const form = await repo.create(makeCreateInput({ fields: [makeField({ key: 'name', label: 'Name', type: 'text', required: true })] }))
      await repo.update({ id: form.id, expectedVersion: 1, lifecycle: 'published' })

      await repo.submit({
        form_id: form.id,
        answers: { name: 'Old' },
        submitted_by_persona_id: 'persona-1',
        currentIsoTimestamp: '2026-07-20T08:00:00.000Z',
      })
      await repo.submit({
        form_id: form.id,
        answers: { name: 'New' },
        submitted_by_persona_id: 'persona-2',
        currentIsoTimestamp: '2026-07-20T12:00:00.000Z',
      })

      const recent = await repo.listSubmissionsByForm(form.id, { since: '2026-07-20T10:00:00.000Z' })
      expect(recent).toHaveLength(1)
      expect(recent[0].submitted_by_persona_id).toBe('persona-2')
    })
  })
})
