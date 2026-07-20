/**
 * S15 — Forms API route.
 * GET  /api/operating-core/forms        — list forms
 * POST /api/operating-core/forms        — create form
 * PATCH /api/operating-core/forms       — update/publish form
 *
 * Threat matrix:
 * - Flag off → 404
 * - Missing auth → 401
 * - Missing forms.manage capability → 403
 * - Invalid body → 400
 * - Stale version on update → 409
 * - Business outcomes never → 500
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isOperatingCoreEnabled,
  requireOperatingCoreSession,
  hasOperatingCoreFormsManageCapability,
} from '@/lib/platform/operating-core'
import { createOperatingCoreFormsRepository } from '@/lib/platform/operating-core/forms/factory'
import type { CreateFormInput, UpdateFormInput } from '@/lib/platform/operating-core/forms/form-repository'
import { OPERATING_CORE_FORM_LIFECYCLES } from '@/lib/platform/operating-core/forms/form-types'
import type { OperatingCoreFormLifecycle } from '@/lib/platform/operating-core/forms/form-types'

// Re-export the repository type for use in this module
export type { CreateFormInput, UpdateFormInput } from '@/lib/platform/operating-core/forms/form-repository'

// ─── GET /forms ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // 1. Flag check
  if (!isOperatingCoreEnabled()) {
    return NextResponse.json({ error: 'Operating Core is not enabled' }, { status: 404 })
  }

  // 2. Auth
  const session = await requireOperatingCoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Capability
  if (!hasOperatingCoreFormsManageCapability(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 4. Parse query params
  const url = new URL(req.url)
  const owner_experience_id = url.searchParams.get('owner_experience_id')
  const lifecycle = url.searchParams.get('lifecycle') as OperatingCoreFormLifecycle | null

  if (!owner_experience_id) {
    return NextResponse.json({ error: 'owner_experience_id is required' }, { status: 400 })
  }

  if (lifecycle && !OPERATING_CORE_FORM_LIFECYCLES.includes(lifecycle)) {
    return NextResponse.json({ error: 'Invalid lifecycle value' }, { status: 400 })
  }

  // 5. List forms
  const repo = createOperatingCoreFormsRepository()
  const forms = await repo.listByOwnerExperience(owner_experience_id, lifecycle ? { lifecycle } : undefined)

  // 6. Return (NO internal IDs leaked beyond what's in the form definition)
  return NextResponse.json({ forms }, { status: 200 })
}

// ─── POST /forms ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Flag check
  if (!isOperatingCoreEnabled()) {
    return NextResponse.json({ error: 'Operating Core is not enabled' }, { status: 404 })
  }

  // 2. Auth
  const session = await requireOperatingCoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Capability
  if (!hasOperatingCoreFormsManageCapability(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 4. Parse body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { owner_experience_id, title, description, fields } = body

  if (!owner_experience_id || typeof owner_experience_id !== 'string') {
    return NextResponse.json({ error: 'owner_experience_id is required' }, { status: 400 })
  }

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  if (description !== undefined && typeof description !== 'string') {
    return NextResponse.json({ error: 'description must be a string' }, { status: 400 })
  }

  if (!Array.isArray(fields)) {
    return NextResponse.json({ error: 'fields must be an array' }, { status: 400 })
  }

  // 5. Create form
  const repo = createOperatingCoreFormsRepository()
  const input: CreateFormInput = {
    owner_experience_id,
    title,
    description: description as string | undefined,
    fields: fields as CreateFormInput['fields'],
    created_by_persona_id: session.personaId,
  }

  const form = await repo.create(input)

  // 6. Return 201
  return NextResponse.json({ form }, { status: 201 })
}

// ─── PATCH /forms ─────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  // 1. Flag check
  if (!isOperatingCoreEnabled()) {
    return NextResponse.json({ error: 'Operating Core is not enabled' }, { status: 404 })
  }

  // 2. Auth
  const session = await requireOperatingCoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Capability
  if (!hasOperatingCoreFormsManageCapability(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 4. Parse body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { form_id, expected_version, title, description, fields, lifecycle } = body

  if (!form_id || typeof form_id !== 'string') {
    return NextResponse.json({ error: 'form_id is required' }, { status: 400 })
  }

  if (expected_version === undefined || typeof expected_version !== 'number') {
    return NextResponse.json({ error: 'expected_version is required and must be a number' }, { status: 400 })
  }

  if (title !== undefined && typeof title !== 'string') {
    return NextResponse.json({ error: 'title must be a string' }, { status: 400 })
  }

  if (description !== undefined && typeof description !== 'string') {
    return NextResponse.json({ error: 'description must be a string' }, { status: 400 })
  }

  if (fields !== undefined && !Array.isArray(fields)) {
    return NextResponse.json({ error: 'fields must be an array' }, { status: 400 })
  }

  if (lifecycle !== undefined && !OPERATING_CORE_FORM_LIFECYCLES.includes(lifecycle as OperatingCoreFormLifecycle)) {
    return NextResponse.json({ error: 'Invalid lifecycle value' }, { status: 400 })
  }

  // 5. Update form with optimistic concurrency
  const repo = createOperatingCoreFormsRepository()
  const input: UpdateFormInput = {
    id: form_id,
    expectedVersion: expected_version,
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(fields !== undefined && { fields: fields as UpdateFormInput['fields'] }),
    ...(lifecycle !== undefined && { lifecycle: lifecycle as OperatingCoreFormLifecycle }),
  }

  try {
    const form = await repo.update(input)
    return NextResponse.json({ form }, { status: 200 })
  } catch (error) {
    if (error instanceof Error && error.message.includes('version')) {
      return NextResponse.json({ error: 'Concurrency conflict: stale version', code: 'concurrency_conflict' }, { status: 409 })
    }
    throw error
  }
}
