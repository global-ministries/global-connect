/**
 * @jest-environment node
 *
 * W17 — DT-002 — HTTP tests for POST /api/pastoral/admin/grants
 *
 * Grants or revokes pastoral.* capabilities to a persona.
 * Auth: requires pastoral.admin.manage (403 without capability).
 * Also 404 if pastoral flag is OFF.
 */
import { NextRequest } from 'next/server'

// Mock route-access BEFORE importing routes
jest.mock('@/lib/platform/pastoral/route-access', () => ({
  isPastoralRouteEnabled: jest.fn((env = process.env) => {
    return env.NEXT_PUBLIC_PASTORAL_ENABLED === 'on' && env.NEXT_PUBLIC_PASTORAL_STAGE !== 'off' && env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH !== 'on'
  }),
  requirePastoralSession: jest.fn(),
  hasPastoralAdminManageCapability: jest.fn(),
}))

// Mock createSupabaseServerClient
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

// Import route AFTER mocks
import { POST } from '@/app/api/pastoral/admin/grants/route'
import * as routeAccess from '@/lib/platform/pastoral/route-access'

const requireSession = routeAccess.requirePastoralSession as jest.Mock
const hasAdminCap = routeAccess.hasPastoralAdminManageCapability as jest.Mock

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(`http://localhost${path}`), init)
}

function authSession(overrides?: Partial<{ personaId: string; capabilities: Array<{ key: string }> }>) {
  requireSession.mockResolvedValue({
    personaId: overrides?.personaId ?? 'admin-persona-id',
    subjectAuthId: 'admin-auth-id',
    globalRoles: [],
    contexts: [],
    capabilities: overrides?.capabilities ?? [],
    ...overrides,
  })
}

function authNull() {
  requireSession.mockResolvedValue(null)
}

beforeEach(() => {
  jest.clearAllMocks()
  hasAdminCap.mockReturnValue(true)
  process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'on'
  process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'public'
  process.env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH = 'off'
})

describe('POST /api/pastoral/admin/grants', () => {
  describe('Auth checks', () => {
    it('401 when unauthenticated', async () => {
      authNull()

      const res = await POST(
        request('/api/pastoral/admin/grants', { method: 'POST' }),
        { params: Promise.resolve({}) } as any
      )

      expect(res.status).toBe(401)
    })

    it('403 when actor lacks pastoral.admin.manage', async () => {
      authSession({ capabilities: [] })
      hasAdminCap.mockReturnValue(false)

      const res = await POST(
        request('/api/pastoral/admin/grants', { method: 'POST' }),
        { params: Promise.resolve({}) } as any
      )

      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error).toContain('Permiso denegado')
    })

    it('404 when pastoral flag is off', async () => {
      authSession()
      process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'off'

      const res = await POST(
        request('/api/pastoral/admin/grants', { method: 'POST' }),
        { params: Promise.resolve({}) } as any
      )

      expect(res.status).toBe(404)
    })
  })

  describe('Body validation', () => {
    it('400 when body is missing', async () => {
      authSession()

      const req = new NextRequest(new URL('http://localhost/api/pastoral/admin/grants'), {
        method: 'POST',
        body: undefined,
      })

      const res = await POST(req, { params: Promise.resolve({}) } as any)

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('Body requerido')
    })

    it('400 when usuario_id is missing', async () => {
      authSession()

      const req = new NextRequest(new URL('http://localhost/api/pastoral/admin/grants'), {
        method: 'POST',
        body: JSON.stringify({ capability_key: 'pastoral.one_on_one.read', action: 'grant' }),
      })

      const res = await POST(req, { params: Promise.resolve({}) } as any)

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('usuario_id')
    })

    it('400 when capability_key is missing', async () => {
      authSession()

      const req = new NextRequest(new URL('http://localhost/api/pastoral/admin/grants'), {
        method: 'POST',
        body: JSON.stringify({ usuario_id: 'persona-uuid', action: 'grant' }),
      })

      const res = await POST(req, { params: Promise.resolve({}) } as any)

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('capability_key')
    })

    it('400 when action is invalid', async () => {
      authSession()

      const req = new NextRequest(new URL('http://localhost/api/pastoral/admin/grants'), {
        method: 'POST',
        body: JSON.stringify({ usuario_id: 'persona-uuid', capability_key: 'pastoral.one_on_one.read', action: 'invalid' }),
      })

      const res = await POST(req, { params: Promise.resolve({}) } as any)

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('action')
    })

    it('400 when capability is not pastoral.*', async () => {
      authSession()

      const req = new NextRequest(new URL('http://localhost/api/pastoral/admin/grants'), {
        method: 'POST',
        body: JSON.stringify({ usuario_id: 'persona-uuid', capability_key: 'dream_team.serve', action: 'grant' }),
      })

      const res = await POST(req, { params: Promise.resolve({}) } as any)

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('Solo capabilities pastoral.*')
    })
  })
})
