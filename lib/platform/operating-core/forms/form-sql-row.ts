/**
 * SQL schema mirror for `operating_core_forms` and `operating_core_form_submissions`.
 *
 * Hand-written (NOT regenerated into database.types.ts per program rules).
 * Source: supabase/migrations/<ts>_operating_core_forms.sql and
 *         <ts>_operating_core_form_submissions.sql
 */

import type {
  OperatingCoreFormDefinition,
  OperatingCoreFormField,
  OperatingCoreFormLifecycle,
  OperatingCoreFormSubmission,
} from './form-types'

// ─── Forms ───────────────────────────────────────────────────────────────────

export type OperatingCoreFormLifecycleSql = 'draft' | 'published' | 'archived'

export interface OperatingCoreFormRow {
  id: string
  owner_experience_id: string
  title: string
  description: string | null
  fields: ReadonlyArray<unknown>
  lifecycle: OperatingCoreFormLifecycleSql
  created_by_persona_id: string
  created_at: string
  updated_at: string
  version: number
}

export interface OperatingCoreFormDomainMapped {
  id: string
  owner_experience_id: string
  title: string
  description: string | undefined
  fields: readonly OperatingCoreFormField[]
  lifecycle: OperatingCoreFormLifecycle
  created_by_persona_id: string
  created_at: string
  updated_at: string
  version: number
}

/**
 * Map from SQL snake_case row to domain camelCase.
 * fields jsonb is cast as OperatingCoreFormField[] (parsed by domain layer).
 */
export function mapSqlFormRowToDomain(row: OperatingCoreFormRow): OperatingCoreFormDefinition {
  return {
    id: row.id,
    owner_experience_id: row.owner_experience_id,
    title: row.title,
    description: row.description ?? undefined,
    fields: row.fields as readonly OperatingCoreFormField[],
    lifecycle: row.lifecycle as OperatingCoreFormLifecycle,
    created_by_persona_id: row.created_by_persona_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version,
  }
}

// ─── Form Submissions ───────────────────────────────────────────────────────

export interface OperatingCoreFormSubmissionRow {
  id: string
  form_id: string
  form_version_at_submission: number
  answers: Readonly<Record<string, unknown>>
  submitted_by_persona_id: string
  submitted_at: string
}

export interface OperatingCoreFormSubmissionDomainMapped {
  id: string
  form_id: string
  form_version_at_submission: number
  answers: Readonly<Record<string, unknown>>
  submitted_by_persona_id: string
  submitted_at: string
}

/**
 * Map from SQL snake_case row to domain camelCase.
 */
export function mapSqlSubmissionRowToDomain(row: OperatingCoreFormSubmissionRow): OperatingCoreFormSubmission {
  return {
    id: row.id,
    form_id: row.form_id,
    form_version_at_submission: row.form_version_at_submission,
    // Cast answers from unknown to FormAnswerValue — validation happens before insert
    answers: row.answers as Readonly<Record<string, import('./form-types').FormAnswerValue>>,
    submitted_by_persona_id: row.submitted_by_persona_id,
    submitted_at: row.submitted_at,
  }
}
