/**
 * S15 — Form Submissions API route.
 * POST /api/operating-core/forms/[id]/submissions  — submit form answers
 * GET  /api/operating-core/forms/[id]/submissions  — list submissions (manage only)
 *
 * Threat matrix:
 * - Flag off → 404
 * - Missing auth → 401
 * - Missing forms.submit (POST) or forms.manage (GET) capability → 403
 * - Form not found OR not published → 404 (identity disclosure prevention)
 * - Invalid answers → 400 with validation errors
 * - Duplicate submission → 409 with code duplicate_submission
 * - Business outcomes never → 500
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isOperatingCoreEnabled,
  requireOperatingCoreSession,
  hasOperatingCoreFormsManageCapability,
  hasOperatingCoreFormsSubmitCapability,
} from '@/lib/platform/operating-core'
import { createOperatingCoreFormsRepository } from '@/lib/platform/operating-core/forms/factory'
import { canAcceptSubmission } from '@/lib/platform/operating-core/forms/form-state'
import { validateSubmission } from '@/lib/platform/operating-core/forms/form-state'
import type { SubmitFormInput } from '@/lib/platform/operating-core/forms/form-repository'
import { OperatingCoreConcurrencyConflictError } from '@/lib/platform/operating-core/errors'

type RouteParams = { params: Promise<{ id: string }> }

// ─── POST /forms/[id]/submissions ────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteParams) {
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
  if (!hasOperatingCoreFormsSubmitCapability(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 4. Parse body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { answers } = body

  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return NextResponse.json({ error: 'answers is required and must be an object' }, { status: 400 })
  }

  // 5. Find form
  const { id: form_id } = await params
  const repo = createOperatingCoreFormsRepository()
  const form = await repo.findById(form_id)

  if (!form) {
    // Identity disclosure prevention: return 404 for non-existent forms
    return NextResponse.json({ error: 'Form not found' }, { status: 404 })
  }

  // 6. Publish gating: only published forms accept submissions
  if (!canAcceptSubmission(form.lifecycle)) {
    // Identity disclosure prevention: return 404, not 400
    return NextResponse.json({ error: 'Form not found' }, { status: 404 })
  }

  // 7. Validate submission using S14's validateSubmission (MANDATORY before DB insert)
  const currentIsoTimestamp = new Date().toISOString()
  const validationResult = validateSubmission(form, answers as Record<string, unknown>, currentIsoTimestamp)

  if (!validationResult.ok) {
    // Return 400 with validation errors — BEFORE any DB call
    return NextResponse.json({
      error: 'Validation failed',
      errors: validationResult.errors,
      messages: validationResult.messages,
    }, { status: 400 })
  }

  // 8. Submit to repository
  const submitInput: SubmitFormInput = {
    form_id,
    answers: answers as Record<string, unknown>,
    submitted_by_persona_id: session.personaId,
    currentIsoTimestamp,
  }

  try {
    const submission = await repo.submit(submitInput)
    return NextResponse.json({ submission }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && (error as unknown as { code?: string }).code === 'duplicate_submission') {
      return NextResponse.json({
        error: 'Duplicate submission',
        code: 'duplicate_submission',
      }, { status: 409 })
    }
    if (error instanceof OperatingCoreConcurrencyConflictError) {
      return NextResponse.json({ error: 'Concurrency conflict', code: 'concurrency_conflict' }, { status: 409 })
    }
    throw error
  }
}

// ─── GET /forms/[id]/submissions ──────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: RouteParams) {
  // 1. Flag check
  if (!isOperatingCoreEnabled()) {
    return NextResponse.json({ error: 'Operating Core is not enabled' }, { status: 404 })
  }

  // 2. Auth
  const session = await requireOperatingCoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Capability (list requires forms.manage, not forms.submit)
  if (!hasOperatingCoreFormsManageCapability(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 4. Parse query params
  const url = new URL(req.url)
  const since = url.searchParams.get('since')

  // 5. List submissions
  const { id: form_id } = await params
  const repo = createOperatingCoreFormsRepository()

  // Verify form exists first (404 if not)
  const form = await repo.findById(form_id)
  if (!form) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 })
  }

  const submissions = await repo.listSubmissionsByForm(form_id, since ? { since } : undefined)

  return NextResponse.json({ submissions }, { status: 200 })
}
