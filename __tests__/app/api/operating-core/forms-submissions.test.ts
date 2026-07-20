/**
 * @jest-environment node
 *
 * S15 — HTTP tests for form submissions endpoint.
 * POST /api/operating-core/forms/[id]/submissions
 * GET  /api/operating-core/forms/[id]/submissions
 *
 * Threat matrix:
 * - Flag off → 404
 * - Missing auth → 401
 * - Missing forms.submit (POST) or forms.manage (GET) capability → 403
 * - Form not found → 404 (identity disclosure)
 * - Form exists BUT lifecycle !== 'published' → 404 (identity disclosure)
 * - Valid submission → 201
 * - Invalid answers → 400 with validation errors
 * - Duplicate submission → 409 with code duplicate_submission
 */

import { NextRequest } from 'next/server'

// ─── Mock setup ───────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  resolveReadOnlyPlatformSession: jest.fn(),
}))

jest.mock('@/lib/platform/operating-core/forms/factory', () => ({
  createOperatingCoreFormsRepository: jest.fn(),
}))

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock
const mockCreateRepo = jest.requireMock('@/lib/platform/operating-core/forms/factory').createOperatingCoreFormsRepository as jest.Mock

// ─── Test data ────────────────────────────────────────────────────────────────

const authId = '11111111-1111-1111-1111-111111111111'
const actorPersonaId = '22222222-2222-2222-2222-222222222111'
const formId = '33333333-3333-3333-3333-333333333333'

const formsManageCap = { key: 'operating_core.forms.manage', experience: 'operating_core', scopeType: 'experience', source: 'test' }
const formsSubmitCap = { key: 'operating_core.forms.submit', experience: 'operating_core', scopeType: 'experience', source: 'test' }

const draftForm = {
  id: formId,
  owner_experience_id: 'exp-1',
  title: 'Draft Form',
  description: undefined,
  fields: [{ key: 'name', label: 'Name', type: 'text', required: true, order: 0 }],
  lifecycle: 'draft' as const,
  created_by_persona_id: actorPersonaId,
  created_at: '2026-07-20T12:00:00Z',
  updated_at: '2026-07-20T12:00:00Z',
  version: 1,
}

const publishedForm = { ...draftForm, lifecycle: 'published' as const }

const archivedForm = { ...draftForm, lifecycle: 'archived' as const }

const validSubmission = {
  id: 'sub-uuid-1',
  form_id: formId,
  form_version_at_submission: 1,
  answers: { name: 'John' },
  submitted_by_persona_id: actorPersonaId,
  submitted_at: '2026-07-20T12:00:00Z',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(`http://localhost${path}`), init)
}

function setupAuthAndSupabase(caps: Record<string, unknown>[], user: { id: string; email: string } | null = { id: authId, email: 'actor@example.com' }) {
  resolveSession.mockResolvedValue(user ? {
    personaId: actorPersonaId,
    subjectAuthId: authId,
    globalRoles: [],
    contexts: [],
    capabilities: caps,
  } : null)

  createClient.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: jest.fn().mockReturnValue({}),
    rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
  })
}

function setupRepoMock() {
  const repo = {
    create: jest.fn(),
    findById: jest.fn(),
    listByOwnerExperience: jest.fn(),
    update: jest.fn(),
    submit: jest.fn(),
    listSubmissionsByForm: jest.fn(),
  }
  mockCreateRepo.mockReturnValue(repo)
  return repo
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Form Submissions API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'on'
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED
  })

  // ─── POST /forms/[id]/submissions ──────────────────────────────────────────

  describe('POST /api/operating-core/forms/[id]/submissions', () => {
    it('returns 404 when flag is off', async () => {
      process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'off'

      const { POST } = await import('@/app/api/operating-core/forms/[id]/submissions/route')
      const req = request('/api/operating-core/forms/33333333-3333-3333-3333-333333333333/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: { name: 'John' } }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: formId }) })

      expect(res.status).toBe(404)
    })

    it('returns 401 when no session', async () => {
      setupAuthAndSupabase([], null)

      const { POST } = await import('@/app/api/operating-core/forms/[id]/submissions/route')
      const req = request('/api/operating-core/forms/33333333-3333-3333-3333-333333333333/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: { name: 'John' } }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: formId }) })

      expect(res.status).toBe(401)
    })

    it('returns 403 when no forms.submit capability', async () => {
      setupAuthAndSupabase([formsManageCap]) // wrong capability

      const { POST } = await import('@/app/api/operating-core/forms/[id]/submissions/route')
      const req = request('/api/operating-core/forms/33333333-3333-3333-3333-333333333333/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: { name: 'John' } }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: formId }) })

      expect(res.status).toBe(403)
    })

    it('returns 404 when form does not exist', async () => {
      setupAuthAndSupabase([formsSubmitCap])
      const repo = setupRepoMock()
      repo.findById.mockResolvedValue(null)

      const { POST } = await import('@/app/api/operating-core/forms/[id]/submissions/route')
      const req = request('/api/operating-core/forms/33333333-3333-3333-3333-333333333333/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: { name: 'John' } }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: formId }) })

      expect(res.status).toBe(404)
    })

    it('returns 404 when form is draft (identity disclosure prevention)', async () => {
      setupAuthAndSupabase([formsSubmitCap])
      const repo = setupRepoMock()
      repo.findById.mockResolvedValue(draftForm)

      const { POST } = await import('@/app/api/operating-core/forms/[id]/submissions/route')
      const req = request('/api/operating-core/forms/33333333-3333-3333-3333-333333333333/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: { name: 'John' } }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: formId }) })

      expect(res.status).toBe(404)
      // Should NOT reveal that the form exists
      const body = await res.json()
      expect(body.error).toBe('Form not found')
    })

    it('returns 404 when form is archived (identity disclosure prevention)', async () => {
      setupAuthAndSupabase([formsSubmitCap])
      const repo = setupRepoMock()
      repo.findById.mockResolvedValue(archivedForm)

      const { POST } = await import('@/app/api/operating-core/forms/[id]/submissions/route')
      const req = request('/api/operating-core/forms/33333333-3333-3333-3333-333333333333/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: { name: 'John' } }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: formId }) })

      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe('Form not found')
    })

    it('returns 201 with valid submission to published form', async () => {
      setupAuthAndSupabase([formsSubmitCap])
      const repo = setupRepoMock()
      repo.findById.mockResolvedValue(publishedForm)
      repo.submit.mockResolvedValue(validSubmission)

      const { POST } = await import('@/app/api/operating-core/forms/[id]/submissions/route')
      const req = request('/api/operating-core/forms/33333333-3333-3333-3333-333333333333/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: { name: 'John' } }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: formId }) })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.submission.id).toBe('sub-uuid-1')
    })

    it('returns 400 with validation errors for invalid answers', async () => {
      setupAuthAndSupabase([formsSubmitCap])
      const repo = setupRepoMock()
      repo.findById.mockResolvedValue(publishedForm)
      // repo.submit is called AFTER validation passes in the route
      // So submit will be called, but we can make it throw if needed
      // The route validates BEFORE calling repo.submit
      // So this test would need to test the route's validateSubmission call
      // For now, just verify the route structure handles validation errors

      const { POST } = await import('@/app/api/operating-core/forms/[id]/submissions/route')
      const req = request('/api/operating-core/forms/33333333-3333-3333-3333-333333333333/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: { name: 123 } }), // wrong type - should be string
      })
      const res = await POST(req, { params: Promise.resolve({ id: formId }) })

      // The route validates the answer type and should return 400
      expect(res.status).toBe(400)
    })

    it('returns 409 with code duplicate_submission on duplicate', async () => {
      setupAuthAndSupabase([formsSubmitCap])
      const repo = setupRepoMock()
      repo.findById.mockResolvedValue(publishedForm)
      const dupError = new Error('Duplicate submission')
      ;(dupError as unknown as { code: string }).code = 'duplicate_submission'
      repo.submit.mockRejectedValue(dupError)

      const { POST } = await import('@/app/api/operating-core/forms/[id]/submissions/route')
      const req = request('/api/operating-core/forms/33333333-3333-3333-3333-333333333333/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: { name: 'John' } }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: formId }) })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.code).toBe('duplicate_submission')
    })
  })

  // ─── GET /forms/[id]/submissions ────────────────────────────────────────────

  describe('GET /api/operating-core/forms/[id]/submissions', () => {
    it('returns 401 when no session', async () => {
      setupAuthAndSupabase([], null)

      const { GET } = await import('@/app/api/operating-core/forms/[id]/submissions/route')
      const req = request('/api/operating-core/forms/33333333-3333-3333-3333-333333333333/submissions')
      const res = await GET(req, { params: Promise.resolve({ id: formId }) })

      expect(res.status).toBe(401)
    })

    it('returns 403 when no forms.manage capability (needs manage, not submit)', async () => {
      setupAuthAndSupabase([formsSubmitCap]) // submit is not enough for listing

      const { GET } = await import('@/app/api/operating-core/forms/[id]/submissions/route')
      const req = request('/api/operating-core/forms/33333333-3333-3333-3333-333333333333/submissions')
      const res = await GET(req, { params: Promise.resolve({ id: formId }) })

      expect(res.status).toBe(403)
    })

    it('returns 404 when form does not exist', async () => {
      setupAuthAndSupabase([formsManageCap])
      const repo = setupRepoMock()
      repo.findById.mockResolvedValue(null)

      const { GET } = await import('@/app/api/operating-core/forms/[id]/submissions/route')
      const req = request('/api/operating-core/forms/33333333-3333-3333-3333-333333333333/submissions')
      const res = await GET(req, { params: Promise.resolve({ id: formId }) })

      expect(res.status).toBe(404)
    })

    it('returns 200 with list of submissions', async () => {
      setupAuthAndSupabase([formsManageCap])
      const repo = setupRepoMock()
      repo.findById.mockResolvedValue(publishedForm)
      repo.listSubmissionsByForm.mockResolvedValue([validSubmission])

      const { GET } = await import('@/app/api/operating-core/forms/[id]/submissions/route')
      const req = request('/api/operating-core/forms/33333333-3333-3333-3333-333333333333/submissions')
      const res = await GET(req, { params: Promise.resolve({ id: formId }) })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.submissions).toHaveLength(1)
      expect(body.submissions[0].id).toBe('sub-uuid-1')
    })
  })
})
