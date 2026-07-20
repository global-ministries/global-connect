/**
 * @jest-environment node
 *
 * S16 — HTTP tests for resources endpoint.
 * GET  /api/operating-core/resources
 * POST /api/operating-core/resources
 * PATCH /api/operating-core/resources
 *
 * Threat matrix:
 * - Flag off → 404
 * - Missing auth → 401
 * - Missing resources.manage capability → 403
 * - Invalid body → 400
 * - Transfer: 200 with successor + archived; 400 on no-op
 */
import { NextRequest } from 'next/server'

// ─── Mock setup ───────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  resolveReadOnlyPlatformSession: jest.fn(),
}))

jest.mock('@/lib/platform/operating-core/resources/resource-repository-fake', () => ({
  createInMemoryResourcesRepository: jest.fn(),
}))

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock
const mockCreateInMemoryRepo = jest.requireMock('@/lib/platform/operating-core/resources/resource-repository-fake').createInMemoryResourcesRepository as jest.Mock

// ─── Test data ────────────────────────────────────────────────────────────────

const authId = '11111111-1111-1111-1111-111111111111'
const actorPersonaId = '22222222-2222-2222-2222-222222222222'
const resourceId = '33333333-3333-3333-3333-333333333333'

const resourcesManageCap = { key: 'operating_core.resources.manage', experience: 'operating_core', scopeType: 'experience', source: 'test' }
const otherCap = { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', source: 'test' }

const mockResource = {
  id: resourceId,
  kind: 'link' as const,
  title: 'Test Resource',
  description: null,
  category: 'documentation',
  tags: ['test'],
  area_experience_id: 'exp-1',
  visible_to_roles: ['director'] as readonly string[],
  visible_to_capabilities: [] as readonly string[],
  created_by_persona_id: actorPersonaId,
  created_at: '2026-07-20T12:00:00Z',
  archived_at: null,
  successor_of: null,
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
    list: jest.fn(),
    transferOwnership: jest.fn(),
    archive: jest.fn(),
  }
  mockCreateInMemoryRepo.mockReturnValue(repo)
  return repo
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Resources API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'on'
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED
  })

  // ─── GET /resources ─────────────────────────────────────────────────────────

  describe('GET /api/operating-core/resources', () => {
    it('returns 404 when flag is off', async () => {
      process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'off'

      const { GET } = await import('@/app/api/operating-core/resources/route')
      const req = request('/api/operating-core/resources')
      const res = await GET(req)

      expect(res.status).toBe(404)
    })

    it('returns 401 when no session', async () => {
      setupAuthAndSupabase([], null)

      const { GET } = await import('@/app/api/operating-core/resources/route')
      const req = request('/api/operating-core/resources')
      const res = await GET(req)

      expect(res.status).toBe(401)
    })

    it('returns 403 when no resources.manage capability', async () => {
      setupAuthAndSupabase([otherCap])

      const { GET } = await import('@/app/api/operating-core/resources/route')
      const req = request('/api/operating-core/resources')
      const res = await GET(req)

      expect(res.status).toBe(403)
    })

    it('returns 200 with list of resources', async () => {
      setupAuthAndSupabase([resourcesManageCap])
      const repo = setupRepoMock()
      repo.list.mockResolvedValue([mockResource])

      const { GET } = await import('@/app/api/operating-core/resources/route')
      const req = request('/api/operating-core/resources')
      const res = await GET(req)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.resources).toHaveLength(1)
      expect(body.resources[0].id).toBe(resourceId)
    })

    it('passes query params to repository list filter', async () => {
      setupAuthAndSupabase([resourcesManageCap])
      const repo = setupRepoMock()
      repo.list.mockResolvedValue([])

      const { GET } = await import('@/app/api/operating-core/resources/route')
      const req = request('/api/operating-core/resources?kind=file&area_experience_id=exp-1&category=docs&tag=test&includeArchived=true')
      const res = await GET(req)

      expect(res.status).toBe(200)
      expect(repo.list).toHaveBeenCalledWith({
        kind: 'file',
        area_experience_id: 'exp-1',
        category: 'docs',
        tag: 'test',
        includeArchived: true,
      })
    })
  })

  // ─── POST /resources ───────────────────────────────────────────────────────

  describe('POST /api/operating-core/resources', () => {
    it('returns 401 when no session', async () => {
      setupAuthAndSupabase([], null)

      const { POST } = await import('@/app/api/operating-core/resources/route')
      const req = request('/api/operating-core/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'link',
          title: 'Test Resource',
          category: 'docs',
          area_experience_id: 'exp-1',
        }),
      })
      const res = await POST(req)

      expect(res.status).toBe(401)
    })

    it('returns 403 when no resources.manage capability', async () => {
      setupAuthAndSupabase([otherCap])

      const { POST } = await import('@/app/api/operating-core/resources/route')
      const req = request('/api/operating-core/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'link',
          title: 'Test Resource',
          category: 'docs',
          area_experience_id: 'exp-1',
        }),
      })
      const res = await POST(req)

      expect(res.status).toBe(403)
    })

    it('returns 400 when kind is invalid', async () => {
      setupAuthAndSupabase([resourcesManageCap])

      const { POST } = await import('@/app/api/operating-core/resources/route')
      const req = request('/api/operating-core/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'audio', // invalid
          title: 'Test Resource',
          category: 'docs',
          area_experience_id: 'exp-1',
        }),
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('returns 201 with created resource', async () => {
      setupAuthAndSupabase([resourcesManageCap])
      const repo = setupRepoMock()
      repo.create.mockResolvedValue(mockResource)

      const { POST } = await import('@/app/api/operating-core/resources/route')
      const req = request('/api/operating-core/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'link',
          title: 'Test Resource',
          description: 'A description',
          category: 'docs',
          tags: ['test'],
          area_experience_id: 'exp-1',
          visible_to_roles: ['director'],
        }),
      })
      const res = await POST(req)

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.resource.id).toBe(resourceId)
      expect(body.resource.title).toBe('Test Resource')
    })
  })

  // ─── PATCH /resources ──────────────────────────────────────────────────────

  describe('PATCH /api/operating-core/resources', () => {
    it('returns 401 when no session', async () => {
      setupAuthAndSupabase([], null)

      const { PATCH } = await import('@/app/api/operating-core/resources/route')
      const req = request('/api/operating-core/resources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_id: resourceId,
          action: 'archive',
          actor_persona_id: actorPersonaId,
          current_iso_timestamp: '2026-07-20T12:00:00.000Z',
          reason: 'test',
        }),
      })
      const res = await PATCH(req)

      expect(res.status).toBe(401)
    })

    it('returns 403 when no resources.manage capability', async () => {
      setupAuthAndSupabase([otherCap])

      const { PATCH } = await import('@/app/api/operating-core/resources/route')
      const req = request('/api/operating-core/resources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_id: resourceId,
          action: 'archive',
          actor_persona_id: actorPersonaId,
          current_iso_timestamp: '2026-07-20T12:00:00.000Z',
          reason: 'test',
        }),
      })
      const res = await PATCH(req)

      expect(res.status).toBe(403)
    })

    it('returns 400 when action is unknown', async () => {
      setupAuthAndSupabase([resourcesManageCap])

      const { PATCH } = await import('@/app/api/operating-core/resources/route')
      const req = request('/api/operating-core/resources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_id: resourceId,
          action: 'unknown-action',
        }),
      })
      const res = await PATCH(req)

      expect(res.status).toBe(400)
    })

    it('returns 200 with successor + archived on transfer', async () => {
      setupAuthAndSupabase([resourcesManageCap])
      const repo = setupRepoMock()
      repo.findById.mockResolvedValue(mockResource)

      const successor = { ...mockResource, id: 'new-id', area_experience_id: 'exp-2' }
      const archived = { ...mockResource, id: resourceId, archived_at: '2026-07-20T14:00:00.000Z' }
      repo.transferOwnership.mockResolvedValue({ successor, archived })

      const { PATCH } = await import('@/app/api/operating-core/resources/route')
      const req = request('/api/operating-core/resources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_id: resourceId,
          action: 'transfer',
          new_area_experience_id: 'exp-2',
          new_visible_to_roles: ['coordinator'],
          new_visible_to_capabilities: [],
          actor_persona_id: actorPersonaId,
          current_iso_timestamp: '2026-07-20T14:00:00.000Z',
        }),
      })
      const res = await PATCH(req)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.successor).toBeDefined()
      expect(body.archived).toBeDefined()
      expect(body.successor.id).toBe('new-id')
    })

    it('returns 400 on no-op transfer (same scope)', async () => {
      setupAuthAndSupabase([resourcesManageCap])
      const repo = setupRepoMock()
      repo.transferOwnership.mockRejectedValue(new Error('transfer_same_scope'))

      const { PATCH } = await import('@/app/api/operating-core/resources/route')
      const req = request('/api/operating-core/resources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_id: resourceId,
          action: 'transfer',
          new_area_experience_id: 'exp-1', // same scope
          new_visible_to_roles: ['coordinator'],
          new_visible_to_capabilities: [],
          actor_persona_id: actorPersonaId,
          current_iso_timestamp: '2026-07-20T14:00:00.000Z',
        }),
      })
      const res = await PATCH(req)

      expect(res.status).toBe(400)
    })

    it('returns 200 on archive action', async () => {
      setupAuthAndSupabase([resourcesManageCap])
      const repo = setupRepoMock()
      const archived = { ...mockResource, archived_at: '2026-07-20T14:00:00.000Z' }
      repo.archive.mockResolvedValue(archived)

      const { PATCH } = await import('@/app/api/operating-core/resources/route')
      const req = request('/api/operating-core/resources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_id: resourceId,
          action: 'archive',
          actor_persona_id: actorPersonaId,
          current_iso_timestamp: '2026-07-20T14:00:00.000Z',
          reason: 'test reason',
        }),
      })
      const res = await PATCH(req)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.resource.archived_at).toBe('2026-07-20T14:00:00.000Z')
    })
  })
})
