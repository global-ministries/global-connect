/**
 * @jest-environment node
 *
 * W17 — DT-003 — HTTP tests for GET /api/pastoral/admin/usuarios
 *
 * Returns all usuarios with their pastoral capabilities.
 * Auth: requires pastoral.admin.manage or pastoral.read.all.
 */
import { NextRequest } from 'next/server'

// Mock route-access BEFORE importing routes
jest.mock('@/lib/platform/pastoral/route-access', () => ({
  isPastoralRouteEnabled: jest.fn((env = process.env) => {
    return env.NEXT_PUBLIC_PASTORAL_ENABLED === 'on' && env.NEXT_PUBLIC_PASTORAL_STAGE !== 'off' && env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH !== 'on'
  }),
  requirePastoralSession: jest.fn(),
  hasPastoralAdminManageCapability: jest.fn(),
  hasPastoralReadAllCapability: jest.fn(),
}))

// Mock createSupabaseServerClient - use a more flexible approach
const mockFrom = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(() => Promise.resolve({ from: mockFrom })),
}))

// Import route AFTER mocks
import { GET } from '@/app/api/pastoral/admin/usuarios/route'
import * as routeAccess from '@/lib/platform/pastoral/route-access'

const requireSession = routeAccess.requirePastoralSession as jest.Mock
const hasAdminCap = routeAccess.hasPastoralAdminManageCapability as jest.Mock
const hasReadAllCap = routeAccess.hasPastoralReadAllCapability as jest.Mock

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

// Helper to create a simple query mock chain
function createQueryChain(data: unknown, error: unknown = null) {
  return {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data, error }),
    in: jest.fn().mockReturnValue({
      like: jest.fn().mockResolvedValue({ data, error }),
    }),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  hasAdminCap.mockReturnValue(true)
  hasReadAllCap.mockReturnValue(false)
  process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'on'
  process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'public'
  process.env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH = 'off'
})

describe('GET /api/pastoral/admin/usuarios', () => {
  describe('Auth checks', () => {
    it('401 when unauthenticated', async () => {
      authNull()

      const res = await GET(
        request('/api/pastoral/admin/usuarios'),
        { params: Promise.resolve({}) } as any
      )

      expect(res.status).toBe(401)
    })

    it('403 when actor lacks pastoral.admin.manage and pastoral.read.all', async () => {
      authSession({ capabilities: [] })
      hasAdminCap.mockReturnValue(false)
      hasReadAllCap.mockReturnValue(false)

      const res = await GET(
        request('/api/pastoral/admin/usuarios'),
        { params: Promise.resolve({}) } as any
      )

      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error).toContain('Permiso denegado')
    })

    it('404 when pastoral flag is off', async () => {
      authSession()
      process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'off'

      const res = await GET(
        request('/api/pastoral/admin/usuarios'),
        { params: Promise.resolve({}) } as any
      )

      expect(res.status).toBe(404)
    })

    it('allows actor with pastoral.admin.manage', async () => {
      authSession({ capabilities: [] })
      hasAdminCap.mockReturnValue(true)
      hasReadAllCap.mockReturnValue(false)

      const mockPersonas = [
        {
          id: 'persona-1',
          email: 'user1@test.com',
          nombre: 'User',
          apellido: 'One',
          auth_id: 'auth-1',
        },
      ]

      const mockGrants = [
        {
          persona_id: 'persona-1',
          capability_key: 'pastoral.one_on_one.read',
          granted_at: '2025-01-01T00:00:00Z',
          revoked_at: null,
        },
      ]

      // First call: from('usuarios')
      mockFrom.mockReturnValueOnce(createQueryChain(mockPersonas, null))
      // Second call: from('dream_team_capability_grants')
      mockFrom.mockReturnValueOnce(createQueryChain(mockGrants, null))

      const res = await GET(
        request('/api/pastoral/admin/usuarios'),
        { params: Promise.resolve({}) } as any
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].email).toBe('user1@test.com')
      expect(body[0].capabilities).toHaveLength(1)
    })

    it('allows actor with pastoral.read.all', async () => {
      authSession({ capabilities: [] })
      hasAdminCap.mockReturnValue(false)
      hasReadAllCap.mockReturnValue(true)

      // First call: from('usuarios')
      mockFrom.mockReturnValueOnce(createQueryChain([], null))
      // Second call: from('dream_team_capability_grants')
      mockFrom.mockReturnValueOnce(createQueryChain([], null))

      const res = await GET(
        request('/api/pastoral/admin/usuarios'),
        { params: Promise.resolve({}) } as any
      )

      expect(res.status).toBe(200)
    })
  })
})
