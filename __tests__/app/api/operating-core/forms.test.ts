/**
 * @jest-environment node
 *
 * S15 — HTTP tests for forms endpoint.
 * GET  /api/operating-core/forms
 * POST /api/operating-core/forms
 * PATCH /api/operating-core/forms
 *
 * Threat matrix:
 * - Flag off → 404
 * - Missing auth → 401
 * - Missing forms.manage capability → 403
 * - Invalid body → 400
 * - Stale version on update → 409
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
const actorPersonaId = '22222222-2222-2222-2222-222222222222'
const formId = '33333333-3333-3333-3333-333333333333'

const formsManageCap = { key: 'operating_core.forms.manage', experience: 'operating_core', scopeType: 'experience', source: 'test' }
const formsSubmitCap = { key: 'operating_core.forms.submit', experience: 'operating_core', scopeType: 'experience', source: 'test' }
const otherCap = { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', source: 'test' }

const mockForm = {
  id: formId,
  owner_experience_id: 'exp-1',
  title: 'Test Form',
  description: undefined,
  fields: [],
  lifecycle: 'draft' as const,
  created_by_persona_id: actorPersonaId,
  created_at: '2026-07-20T12:00:00Z',
  updated_at: '2026-07-20T12:00:00Z',
  version: 1,
}

const mockPublishedForm = { ...mockForm, lifecycle: 'published' as const, version: 2 }

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

describe('Forms API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'on'
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED
  })

  // ─── GET /forms ─────────────────────────────────────────────────────────────

  describe('GET /api/operating-core/forms', () => {
    it('returns 404 when flag is off', async () => {
      process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'off'

      const { GET } = await import('@/app/api/operating-core/forms/route')
      const req = request('/api/operating-core/forms?owner_experience_id=exp-1')
      const res = await GET(req)

      expect(res.status).toBe(404)
    })

    it('returns 401 when no session', async () => {
      setupAuthAndSupabase([], null)

      const { GET } = await import('@/app/api/operating-core/forms/route')
      const req = request('/api/operating-core/forms?owner_experience_id=exp-1')
      const res = await GET(req)

      expect(res.status).toBe(401)
    })

    it('returns 403 when no forms.manage capability', async () => {
      setupAuthAndSupabase([otherCap])

      const { GET } = await import('@/app/api/operating-core/forms/route')
      const req = request('/api/operating-core/forms?owner_experience_id=exp-1')
      const res = await GET(req)

      expect(res.status).toBe(403)
    })

    it('returns 400 when owner_experience_id is missing', async () => {
      setupAuthAndSupabase([formsManageCap])

      const { GET } = await import('@/app/api/operating-core/forms/route')
      const req = request('/api/operating-core/forms')
      const res = await GET(req)

      expect(res.status).toBe(400)
    })

    it('returns 200 with list of forms', async () => {
      setupAuthAndSupabase([formsManageCap])
      const repo = setupRepoMock()
      repo.listByOwnerExperience.mockResolvedValue([mockForm])

      const { GET } = await import('@/app/api/operating-core/forms/route')
      const req = request('/api/operating-core/forms?owner_experience_id=exp-1')
      const res = await GET(req)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.forms).toHaveLength(1)
      expect(body.forms[0].id).toBe(formId)
    })
  })

  // ─── POST /forms ────────────────────────────────────────────────────────────

  describe('POST /api/operating-core/forms', () => {
    it('returns 401 when no session', async () => {
      setupAuthAndSupabase([], null)

      const { POST } = await import('@/app/api/operating-core/forms/route')
      const req = request('/api/operating-core/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_experience_id: 'exp-1',
          title: 'Test Form',
          fields: [],
        }),
      })
      const res = await POST(req)

      expect(res.status).toBe(401)
    })

    it('returns 403 when no forms.manage capability', async () => {
      setupAuthAndSupabase([formsSubmitCap])

      const { POST } = await import('@/app/api/operating-core/forms/route')
      const req = request('/api/operating-core/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_experience_id: 'exp-1',
          title: 'Test Form',
          fields: [],
        }),
      })
      const res = await POST(req)

      expect(res.status).toBe(403)
    })

    it('returns 400 when title is missing', async () => {
      setupAuthAndSupabase([formsManageCap])

      const { POST } = await import('@/app/api/operating-core/forms/route')
      const req = request('/api/operating-core/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_experience_id: 'exp-1',
          fields: [],
        }),
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('returns 201 with created form', async () => {
      setupAuthAndSupabase([formsManageCap])
      const repo = setupRepoMock()
      repo.create.mockResolvedValue(mockForm)

      const { POST } = await import('@/app/api/operating-core/forms/route')
      const req = request('/api/operating-core/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_experience_id: 'exp-1',
          title: 'Test Form',
          fields: [],
        }),
      })
      const res = await POST(req)

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.form.id).toBe(formId)
    })
  })

  // ─── PATCH /forms ────────────────────────────────────────────────────────────

  describe('PATCH /api/operating-core/forms', () => {
    it('returns 401 when no session', async () => {
      setupAuthAndSupabase([], null)

      const { PATCH } = await import('@/app/api/operating-core/forms/route')
      const req = request('/api/operating-core/forms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_id: formId,
          expected_version: 1,
          lifecycle: 'published',
        }),
      })
      const res = await PATCH(req)

      expect(res.status).toBe(401)
    })

    it('returns 403 when no forms.manage capability', async () => {
      setupAuthAndSupabase([formsSubmitCap])

      const { PATCH } = await import('@/app/api/operating-core/forms/route')
      const req = request('/api/operating-core/forms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_id: formId,
          expected_version: 1,
          lifecycle: 'published',
        }),
      })
      const res = await PATCH(req)

      expect(res.status).toBe(403)
    })

    it('returns 409 on stale version (concurrency conflict)', async () => {
      setupAuthAndSupabase([formsManageCap])
      const repo = setupRepoMock()
      const { OperatingCoreConcurrencyConflictError } = await import('@/lib/platform/operating-core/errors')
      repo.update.mockRejectedValue(new OperatingCoreConcurrencyConflictError('stale version'))

      const { PATCH } = await import('@/app/api/operating-core/forms/route')
      const req = request('/api/operating-core/forms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_id: formId,
          expected_version: 1, // stale
          lifecycle: 'published',
        }),
      })
      const res = await PATCH(req)

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.code).toBe('concurrency_conflict')
    })

    it('returns 200 when updating to published', async () => {
      setupAuthAndSupabase([formsManageCap])
      const repo = setupRepoMock()
      repo.update.mockResolvedValue(mockPublishedForm)

      const { PATCH } = await import('@/app/api/operating-core/forms/route')
      const req = request('/api/operating-core/forms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_id: formId,
          expected_version: 1,
          lifecycle: 'published',
        }),
      })
      const res = await PATCH(req)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.form.lifecycle).toBe('published')
    })
  })
})
