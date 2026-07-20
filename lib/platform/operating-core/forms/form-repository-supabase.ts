/**
 * S15 — FormsRepository Supabase adapter.
 *
 * Mirrors registration-repository-supabase.ts (S10) and
 * capacity-repository-supabase.ts (S13) patterns.
 *
 * RLS enforcement: service_role bypasses RLS; no p_auth_id parameter is ever
 * sent by the client. Identity is bound server-side.
 *
 * NOTE: operating_core_forms and operating_core_form_submissions are future-apply
 * migrations (not yet in generated Database types). This adapter uses a relaxed
 * SupabaseClient type to allow compile-time use before the migration is applied.
 * The actual table names are validated at runtime by Postgres.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
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
import type {
  OperatingCoreFormRow,
  OperatingCoreFormSubmissionRow,
} from './form-sql-row'
import {
  mapSqlFormRowToDomain,
  mapSqlSubmissionRowToDomain,
} from './form-sql-row'

// ─── Types ───────────────────────────────────────────────────────────────────

// Relaxed client type — operating_core_forms is not yet in generated Database
// types (future-apply migration). Using SupabaseClient without Database generic
// avoids cast-heavy code while maintaining runtime safety via Postgres.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberate type relaxation for future-apply table
type AnySupabaseClient = SupabaseClient<any, any>

export interface FormsRepositorySupabaseOptions {
  supabase: AnySupabaseClient
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FORMS_TABLE = 'operating_core_forms' as const
const SUBMISSIONS_TABLE = 'operating_core_form_submissions' as const

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createSupabaseFormsRepository(
  options: FormsRepositorySupabaseOptions,
): FormsRepository {
  const { supabase } = options

  // ── helpers ──────────────────────────────────────────────────────────────

  async function findFormByIdInternal(
    id: string,
  ): Promise<OperatingCoreFormRow | null> {
    const { data, error } = await (supabase as unknown as { from: (t: string) => { select: () => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: OperatingCoreFormRow | null; error: unknown }> } } } })
      .from(FORMS_TABLE)
      .select()
      .eq('id', id)
      .maybeSingle()

    if (error || !data) return null
    return data as OperatingCoreFormRow
  }

  async function upsertFormAndSelect(
    data: Record<string, unknown>,
  ): Promise<OperatingCoreFormRow> {
    const { data: row, error } = await (supabase as unknown as { from: (t: string) => { insert: (d: Record<string, unknown>) => { select: () => { single: () => Promise<{ data: OperatingCoreFormRow; error: unknown }> } } } })
      .from(FORMS_TABLE)
      .insert(data)
      .select()
      .single()

    if (error || !row) {
      throw new Error(`Failed to insert form: ${String(error)}`)
    }
    return row as OperatingCoreFormRow
  }

  // ── create ──────────────────────────────────────────────────────────────

  async function create(input: CreateFormInput): Promise<OperatingCoreFormDefinition> {
    const capturedAt = new Date().toISOString()
    const row = await upsertFormAndSelect({
      owner_experience_id: input.owner_experience_id,
      title: input.title,
      description: input.description ?? null,
      fields: input.fields,
      lifecycle: 'draft',
      created_by_persona_id: input.created_by_persona_id,
      created_at: capturedAt,
      updated_at: capturedAt,
      version: 1,
    })
    return mapSqlFormRowToDomain(row)
  }

  // ── findById ─────────────────────────────────────────────────────────────

  async function findById(id: string): Promise<OperatingCoreFormDefinition | null> {
    const row = await findFormByIdInternal(id)
    if (!row) return null
    return mapSqlFormRowToDomain(row)
  }

  // ── listByOwnerExperience ────────────────────────────────────────────────

  async function listByOwnerExperience(
    owner_experience_id: string,
    filter?: { readonly lifecycle?: import('./form-types').OperatingCoreFormLifecycle },
  ): Promise<readonly OperatingCoreFormDefinition[]> {
    const query = (supabase as unknown as { from: (t: string) => { select: () => { eq: (k: string, v: string) => { maybeSingle: () => unknown } } } })
      .from(FORMS_TABLE)
      .select() as { eq: (k: string, v: string) => { data?: OperatingCoreFormRow[]; error?: unknown } }

    const { data, error } = await query
      .eq('owner_experience_id', owner_experience_id)

    if (error || !data) return []
    let rows = data as OperatingCoreFormRow[]

    if (filter?.lifecycle) {
      rows = rows.filter((r) => r.lifecycle === filter.lifecycle)
    }

    return rows.map(mapSqlFormRowToDomain)
  }

  // ── update ───────────────────────────────────────────────────────────────

  async function update(input: UpdateFormInput): Promise<OperatingCoreFormDefinition> {
    // Fetch current row for version check
    const current = await findFormByIdInternal(input.id)
    if (!current) {
      throw new Error(`Form '${input.id}' not found`)
    }

    if (current.version !== input.expectedVersion) {
      throw new OperatingCoreConcurrencyConflictError(
        `expectedVersion ${input.expectedVersion} does not match current version ${current.version}`,
        { id: input.id, expectedVersion: input.expectedVersion, currentVersion: current.version },
      )
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      version: current.version + 1,
    }

    if (input.title !== undefined) updates.title = input.title
    if (input.description !== undefined) updates.description = input.description ?? null
    if (input.fields !== undefined) updates.fields = input.fields
    if (input.lifecycle !== undefined) updates.lifecycle = input.lifecycle

    const { data, error } = await (supabase as unknown as { from: (t: string) => { update: (u: Record<string, unknown>) => { eq: (k: string, v: string) => { select: () => { single: () => Promise<{ data: OperatingCoreFormRow; error: unknown }> } } } } })
      .from(FORMS_TABLE)
      .update(updates)
      .eq('id', input.id)
      .select()
      .single()

    if (error || !data) {
      throw new Error(`Failed to update form: ${String(error)}`)
    }

    return mapSqlFormRowToDomain(data as OperatingCoreFormRow)
  }

  // ── submit ───────────────────────────────────────────────────────────────

  async function submit(input: SubmitFormInput): Promise<OperatingCoreFormSubmission> {
    // Fetch form for validation
    const form = await findFormByIdInternal(input.form_id)
    if (!form) {
      throw new Error(`Form '${input.form_id}' not found`)
    }

    const domainForm = mapSqlFormRowToDomain(form)

    // MANDATORY: validate using S14's validateSubmission BEFORE any DB insert
    const validationResult = validateSubmission(
      domainForm,
      input.answers,
      input.currentIsoTimestamp,
    )

    if (!validationResult.ok) {
      // Throw with validation errors — caller handles 400 response
      throw new Error(
        `Form submission validation failed: ${validationResult.errors.join(', ')}`,
      )
    }

    // Insert submission row
    const { data, error } = await (supabase as unknown as { from: (t: string) => { insert: (d: Record<string, unknown>) => { select: () => { single: () => Promise<{ data: OperatingCoreFormSubmissionRow; error: unknown }> } } } })
      .from(SUBMISSIONS_TABLE)
      .insert({
        form_id: input.form_id,
        form_version_at_submission: domainForm.version,
        answers: input.answers,
        submitted_by_persona_id: input.submitted_by_persona_id,
        submitted_at: input.currentIsoTimestamp,
      })
      .select()
      .single()

    if (error) {
      // Check for unique constraint violation (duplicate submission)
      const errorStr = String(error)
      if (errorStr.includes('uq_submission_per_persona_form') || errorStr.includes('duplicate key')) {
        const dupError = new Error('Duplicate submission')
        ;(dupError as unknown as { code: string }).code = 'duplicate_submission'
        throw dupError
      }
      throw new Error(`Failed to insert submission: ${String(error)}`)
    }

    if (!data) {
      throw new Error('Failed to insert submission: no data returned')
    }

    return mapSqlSubmissionRowToDomain(data as OperatingCoreFormSubmissionRow)
  }

  // ── listSubmissionsByForm ─────────────────────────────────────────────────

  async function listSubmissionsByForm(
    form_id: string,
    filter?: { readonly since?: string },
  ): Promise<readonly OperatingCoreFormSubmission[]> {
    const query = (supabase as unknown as { from: (t: string) => { select: () => { eq: (k: string, v: string) => { data?: OperatingCoreFormSubmissionRow[]; error?: unknown } } } })
      .from(SUBMISSIONS_TABLE)
      .select()
      .eq('form_id', form_id)

    const { data, error } = await query

    if (error || !data) return []
    let rows = data as OperatingCoreFormSubmissionRow[]

    if (filter?.since) {
      rows = rows.filter((r) => r.submitted_at > filter.since!)
    }

    return rows.map(mapSqlSubmissionRowToDomain)
  }

  return {
    create,
    findById,
    listByOwnerExperience,
    update,
    submit,
    listSubmissionsByForm,
  }
}
