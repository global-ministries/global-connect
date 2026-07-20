/**
 * S14 — in-memory fake implementation of FormsRepository.
 * For unit tests only — no Supabase adapter in this slice.
 */
import { OperatingCoreConcurrencyConflictError } from '../errors'
import { validateSubmission } from './form-state'
import type {
  OperatingCoreFormDefinition,
  OperatingCoreFormSubmission,
} from './form-types'
import type {
  CreateFormInput,
  UpdateFormInput,
  SubmitFormInput,
  FormsRepository,
} from './form-repository'

export interface InMemoryFormsRepositoryOptions {
  readonly seed?: ReadonlyArray<OperatingCoreFormDefinition>
}

export function createFormsRepositoryFake(
  options: InMemoryFormsRepositoryOptions = {},
): FormsRepository {
  // Primary storage
  const forms: OperatingCoreFormDefinition[] = options.seed ? [...options.seed] : []
  const submissions: OperatingCoreFormSubmission[] = []

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function now(): string {
    return new Date().toISOString()
  }

  function requireForm(id: string): OperatingCoreFormDefinition {
    const found = forms.find((f) => f.id === id)
    if (!found) {
      throw new Error(`Form '${id}' not found`)
    }
    return found
  }

  // ---------------------------------------------------------------------------
  // Repository methods
  // ---------------------------------------------------------------------------

  return {
    async create(input: CreateFormInput): Promise<OperatingCoreFormDefinition> {
      const capturedAt = now()
      const form: OperatingCoreFormDefinition = {
        id: crypto.randomUUID(),
        owner_experience_id: input.owner_experience_id,
        title: input.title,
        description: input.description,
        fields: input.fields,
        lifecycle: 'draft',
        created_by_persona_id: input.created_by_persona_id,
        created_at: capturedAt,
        updated_at: capturedAt,
        version: 1,
      }
      forms.push(form)
      return form
    },

    async findById(id: string): Promise<OperatingCoreFormDefinition | null> {
      return forms.find((f) => f.id === id) ?? null
    },

    async listByOwnerExperience(
      owner_experience_id: string,
      filter?: { readonly lifecycle?: import('./form-types').OperatingCoreFormLifecycle },
    ): Promise<readonly OperatingCoreFormDefinition[]> {
      let result = forms.filter((f) => f.owner_experience_id === owner_experience_id)
      if (filter?.lifecycle) {
        result = result.filter((f) => f.lifecycle === filter.lifecycle)
      }
      return result
    },

    async update(input: UpdateFormInput): Promise<OperatingCoreFormDefinition> {
      const current = requireForm(input.id)

      // Optimistic concurrency check
      if (current.version !== input.expectedVersion) {
        throw new OperatingCoreConcurrencyConflictError(
          `expectedVersion ${input.expectedVersion} does not match current version ${current.version}`,
          { id: input.id, expectedVersion: input.expectedVersion, currentVersion: current.version },
        )
      }

      const updated: OperatingCoreFormDefinition = {
        ...current,
        title: input.title ?? current.title,
        description: input.description ?? current.description,
        fields: input.fields ?? current.fields,
        lifecycle: input.lifecycle ?? current.lifecycle,
        updated_at: now(),
        version: current.version + 1,
      }

      const index = forms.findIndex((f) => f.id === input.id)
      forms[index] = updated
      return updated
    },

    async submit(input: SubmitFormInput): Promise<OperatingCoreFormSubmission> {
      const form = requireForm(input.form_id)

      // Validate using the state machine — this will reject draft/archived forms
      const validationResult = validateSubmission(form, input.answers, input.currentIsoTimestamp)

      if (!validationResult.ok) {
        // Re-throw as a generic error — the validation errors are in the result
        // Callers can inspect via the repository's validateSubmission directly if needed
        throw new Error(
          `Form submission validation failed: ${validationResult.errors.join(', ')}`,
        )
      }

      // Fill in the submitter ID (validation result doesn't have it)
      const submission: OperatingCoreFormSubmission = {
        ...validationResult.submission,
        submitted_by_persona_id: input.submitted_by_persona_id,
      }

      submissions.push(submission)
      return submission
    },

    async listSubmissionsByForm(
      form_id: string,
      filter?: { readonly since?: string },
    ): Promise<readonly OperatingCoreFormSubmission[]> {
      let result = submissions.filter((s) => s.form_id === form_id)
      if (filter?.since) {
        result = result.filter((s) => s.submitted_at > filter.since!)
      }
      return result
    },
  }
}
