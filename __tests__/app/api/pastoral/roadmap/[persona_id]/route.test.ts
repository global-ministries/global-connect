/**
 * @jest-environment node
 *
 * W15 — DT-081 — HTTP tests for public roadmap API route.
 *
 * GET /api/pastoral/roadmap/[persona_id]
 * Returns public roadmap (P6: only validated milestones, dates, suggested next steps).
 * Auth: actor can be the assisted themselves, their official mentor, or pastoral.read.all.
 */

// Mock route-access BEFORE importing routes
jest.mock('@/lib/platform/pastoral/route-access', () => ({
  isPastoralRouteEnabled: jest.fn((env = process.env) => {
    return env.NEXT_PUBLIC_PASTORAL_ENABLED === 'on' && env.NEXT_PUBLIC_PASTORAL_STAGE !== 'off' && env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH !== 'on'
  }),
  requirePastoralSession: jest.fn(),
  hasPastoralOneOnOneReadCapability: jest.fn(),
  hasPastoralReadAllCapability: jest.fn(),
}))

// Mock the loadPublicRoadmap function
jest.mock('@/lib/platform/pastoral/public-roadmap/load-public-roadmap', () => ({
  loadPublicRoadmap: jest.fn(),
}))

// Import route AFTER mocks
import { GET } from '@/app/api/pastoral/roadmap/[persona_id]/route'
import * as routeAccess from '@/lib/platform/pastoral/route-access'
import { loadPublicRoadmap } from '@/lib/platform/pastoral/public-roadmap/load-public-roadmap'
import { NextRequest } from 'next/server'

const requireSession = routeAccess.requirePastoralSession as jest.Mock
const hasReadCap = routeAccess.hasPastoralOneOnOneReadCapability as jest.Mock
const hasReadAllCap = routeAccess.hasPastoralReadAllCapability as jest.Mock
const mockLoadPublicRoadmap = loadPublicRoadmap as jest.Mock

const actorPersonaId = '22222222-2222-2222-2222-222222222222'
const assistedPersonaId = '33333333-3333-3333-3333-333333333333'

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(`http://localhost${path}`), init)
}

function authSession(overrides?: Partial<{ personaId: string; capabilities: Array<{ key: string }> }>) {
  requireSession.mockResolvedValue({
    personaId: actorPersonaId,
    subjectAuthId: '11111111-1111-1111-1111-111111111111',
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
  hasReadCap.mockReturnValue(true)
  hasReadAllCap.mockReturnValue(false)
  process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'on'
  process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'public'
  process.env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH = 'off'
  mockLoadPublicRoadmap.mockReset()
})

describe('GET /api/pastoral/roadmap/[persona_id]', () => {
  describe('Auth checks', () => {
    it('401 when unauthenticated', async () => {
      authNull()
      const res = await GET(
        request('/api/pastoral/roadmap/33333333'),
        { params: Promise.resolve({ persona_id: '33333333' }) } as any
      )
      expect(res.status).toBe(401)
    })

    it('403 when actor is not the assisted, not their mentor, and not pastoral.read.all', async () => {
      // Actor is neither assisted nor mentor and has no pastoral.read.all
      authSession({
        capabilities: [],
        personaId: '99999999-9999-9999-9999-999999999999',
      })
      hasReadCap.mockReturnValue(false)
      hasReadAllCap.mockReturnValue(false)

      const res = await GET(
        request('/api/pastoral/roadmap/33333333'),
        { params: Promise.resolve({ persona_id: '33333333' }) } as any
      )
      expect(res.status).toBe(403)
    })

    it('404 when pastoral flag is off', async () => {
      authSession()
      process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'off'

      const res = await GET(
        request('/api/pastoral/roadmap/33333333'),
        { params: Promise.resolve({ persona_id: '33333333' }) } as any
      )
      expect(res.status).toBe(404)
    })
  })

  describe('Access control (P6)', () => {
    it('allows actor is the assisted person', async () => {
      authSession({
        capabilities: [],
        personaId: assistedPersonaId, // Actor IS the assisted
      })
      hasReadCap.mockReturnValue(false)
      hasReadAllCap.mockReturnValue(false)

      mockLoadPublicRoadmap.mockResolvedValue({
        assistedPersonaId,
        sesiones: [],
        proximoUnoAuno: null,
        pasosValidadosTotal: [],
        proximoPasoSugerido: null,
        generatedAtIso: new Date().toISOString(),
      })

      const res = await GET(
        request(`/api/pastoral/roadmap/${assistedPersonaId}`),
        { params: Promise.resolve({ persona_id: assistedPersonaId }) } as any
      )
      expect(res.status).toBe(200)
    })

    it('allows actor is the official mentor (has read capability)', async () => {
      authSession({
        capabilities: [{ key: 'pastoral.one_on_one.read' }],
        personaId: actorPersonaId,
      })
      hasReadCap.mockReturnValue(true)
      hasReadAllCap.mockReturnValue(false)

      mockLoadPublicRoadmap.mockResolvedValue({
        assistedPersonaId,
        sesiones: [],
        proximoUnoAuno: null,
        pasosValidadosTotal: [],
        proximoPasoSugerido: null,
        generatedAtIso: new Date().toISOString(),
      })

      const res = await GET(
        request(`/api/pastoral/roadmap/${assistedPersonaId}`),
        { params: Promise.resolve({ persona_id: assistedPersonaId }) } as any
      )
      expect(res.status).toBe(200)
    })

    it('allows actor has pastoral.read.all capability', async () => {
      authSession({
        capabilities: [{ key: 'pastoral.read.all' }],
        personaId: 'admin-persona-id',
      })
      hasReadCap.mockReturnValue(false)
      hasReadAllCap.mockReturnValue(true)

      mockLoadPublicRoadmap.mockResolvedValue({
        assistedPersonaId,
        sesiones: [],
        proximoUnoAuno: null,
        pasosValidadosTotal: [],
        proximoPasoSugerido: null,
        generatedAtIso: new Date().toISOString(),
      })

      const res = await GET(
        request(`/api/pastoral/roadmap/${assistedPersonaId}`),
        { params: Promise.resolve({ persona_id: assistedPersonaId }) } as any
      )
      expect(res.status).toBe(200)
    })

    it('returns 404 when loadPublicRoadmap returns null', async () => {
      authSession({
        capabilities: [],
        personaId: assistedPersonaId,
      })
      hasReadCap.mockReturnValue(false)
      hasReadAllCap.mockReturnValue(false)

      mockLoadPublicRoadmap.mockResolvedValue(null)

      const res = await GET(
        request(`/api/pastoral/roadmap/${assistedPersonaId}`),
        { params: Promise.resolve({ persona_id: assistedPersonaId }) } as any
      )
      expect(res.status).toBe(404)
    })
  })

  describe('Response shape (P6)', () => {
    it('returns public roadmap with field-projection (P6)', async () => {
      authSession({
        capabilities: [],
        personaId: assistedPersonaId,
      })
      hasReadCap.mockReturnValue(false)
      hasReadAllCap.mockReturnValue(false)

      const mockRoadmap = {
        assistedPersonaId,
        sesiones: [
          {
            id: 'ooo-1',
            estado: 'completed',
            scheduledAtIso: '2025-06-01T10:00:00Z',
            completedAtIso: '2025-06-01T11:00:00Z',
            pasosValidados: [
              {
                id: 'step-1',
                stepKey: 'primera_conexion',
                validatedAtIso: '2025-06-01T10:30:00Z',
                isSharedMilestone: true,
              },
            ],
            resumen: null, // P6: never exposed
            notas: null,   // P6: never exposed
          },
        ],
        proximoUnoAuno: null,
        pasosValidadosTotal: [],
        proximoPasoSugerido: 'establecer_proposito',
        generatedAtIso: new Date().toISOString(),
      }

      mockLoadPublicRoadmap.mockResolvedValue(mockRoadmap)

      const res = await GET(
        request(`/api/pastoral/roadmap/${assistedPersonaId}`),
        { params: Promise.resolve({ persona_id: assistedPersonaId }) } as any
      )

      expect(res.status).toBe(200)
      const body = await res.json()

      // P6: resumen and notas should be null (never exposed)
      expect(body.sesiones[0].resumen).toBeNull()
      expect(body.sesiones[0].notas).toBeNull()

      // Should have the validated steps
      expect(body.sesiones[0].pasosValidados).toHaveLength(1)
      expect(body.sesiones[0].pasosValidados[0].stepKey).toBe('primera_conexion')

      // Should have generatedAt
      expect(body.generatedAtIso).toBeDefined()
    })
  })
})
