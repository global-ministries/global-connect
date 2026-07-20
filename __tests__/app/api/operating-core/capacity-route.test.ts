/**
 * @jest-environment node
 *
 * S13 — HTTP tests for authenticated capacity endpoint
 * POST /api/operating-core/capacity
 *
 * Threat matrix:
 * - Flag off → 404
 * - Missing auth → 401
 * - Missing capability → 403
 * - Invalid body → 400
 * - Reason too short → 400 with code reason_too_short
 * - Override > base → 400 with code override_exceeds_base
 *
 * Note: setOverride/getCurrent/promote_waitlist tests are covered in
 * the adapter unit tests and integration tests. Here we test the
 * route's auth/capability/body validation layers.
 */

import { NextRequest } from 'next/server'

// ─── Mock setup ───────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  resolveReadOnlyPlatformSession: jest.fn(),
}))

jest.mock('@/lib/platform/operating-core/capacity/capacity-repository-supabase', () => ({
  createSupabaseCapacityRepository: jest.fn(),
}))

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock
const mockCreateCapacityRepo = jest.requireMock('@/lib/platform/operating-core/capacity/capacity-repository-supabase').createSupabaseCapacityRepository as jest.Mock

// ─── Test data ────────────────────────────────────────────────────────────────

const authId = '11111111-1111-1111-1111-111111111111'
const actorPersonaId = '22222222-2222-2222-2222-222222222222'
const eventId = '33333333-3333-3333-3333-333333333333'

const capacityCap = { key: 'operating_core.capacity.manage', experience: 'operating_core', scopeType: 'experience', source: 'test' }
const otherCap = { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', source: 'test' }

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

   
  const eventsQueryMock = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: { id: eventId, capacity_base: 30 }, error: null }),
  }

  createClient.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'operating_core_events') return eventsQueryMock
      return {}
    }),
    rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
  })
}

function setupCapacityRepoMock() {
  const repo = {
    getCurrent: jest.fn().mockResolvedValue({
      base: { value: 30, scope: 'event', effectiveAt: new Date().toISOString() },
      override: null,
      effective: 30,
    }),
    setOverride: jest.fn().mockResolvedValue({
      base: { value: 30, scope: 'event', effectiveAt: new Date().toISOString() },
      override: { value: 25, reason: 'venue layout', setByPersonaId: actorPersonaId, setAt: new Date().toISOString() },
      effective: 25,
    }),
    getAlertHook: jest.fn().mockReturnValue({ alerts: [], subscribe: undefined }),
  }
  mockCreateCapacityRepo.mockReturnValue(repo)
  return repo
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateCapacityRepo.mockReset()
  process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'on'
})

// ─── Import route handler ─────────────────────────────────────────────────────

import { POST } from '@/app/api/operating-core/capacity/route'

// ─── POST /api/operating-core/capacity ──────────────────────────────────────

describe('POST /api/operating-core/capacity', () => {
  describe('Auth & capability guards', () => {
    it('404 when flag off', async () => {
      process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'off'
      setupAuthAndSupabase([capacityCap])
      setupCapacityRepoMock()

      const res = await POST(request('/api/operating-core/capacity', {
        method: 'POST',
        body: JSON.stringify({ event_id: eventId, capacity_operativa: 25, reason: 'venue layout' }),
      }))

      expect(res.status).toBe(404)
    })

    it('401 unauthenticated', async () => {
      setupAuthAndSupabase([], null)
      setupCapacityRepoMock()

      const res = await POST(request('/api/operating-core/capacity', {
        method: 'POST',
        body: JSON.stringify({ event_id: eventId, capacity_operativa: 25, reason: 'venue layout' }),
      }))

      expect(res.status).toBe(401)
    })

    it('403 without capacity.manage capability', async () => {
      setupAuthAndSupabase([otherCap])
      setupCapacityRepoMock()

      const res = await POST(request('/api/operating-core/capacity', {
        method: 'POST',
        body: JSON.stringify({ event_id: eventId, capacity_operativa: 25, reason: 'venue layout' }),
      }))

      expect(res.status).toBe(403)
    })
  })

  describe('Body validation', () => {
    it('400 when event_id missing', async () => {
      setupAuthAndSupabase([capacityCap])
      setupCapacityRepoMock()

      const res = await POST(request('/api/operating-core/capacity', {
        method: 'POST',
        body: JSON.stringify({}),
      }))

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/event_id/i)
    })

    it('400 when reason too short', async () => {
      setupAuthAndSupabase([capacityCap])
      setupCapacityRepoMock()

      const res = await POST(request('/api/operating-core/capacity', {
        method: 'POST',
        body: JSON.stringify({ event_id: eventId, capacity_operativa: 20, reason: 'x' }),
      }))

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.code).toBe('reason_too_short')
    })

    it('400 when override exceeds base', async () => {
      setupAuthAndSupabase([capacityCap])
      const repo = setupCapacityRepoMock()
      // Throw error with same name as CapacityOverrideValidationError
      // (route checks error.name, not instanceof)
      const err = new Error('override 50 exceeds base 30')
      err.name = 'CapacityOverrideValidationError'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(err as any).code = 'override_exceeds_base'
      repo.setOverride.mockImplementation(() => { throw err })

      const res = await POST(request('/api/operating-core/capacity', {
        method: 'POST',
        body: JSON.stringify({ event_id: eventId, capacity_operativa: 50, reason: 'venue layout' }),
      }))

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.code).toBe('override_exceeds_base')
    })

    it('404 when event not found', async () => {
      setupAuthAndSupabase([capacityCap])
      // Override the event query mock to return null
      createClient.mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: authId, email: 'actor@example.com' } }, error: null }) },
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'operating_core_events') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }
          }
          return {}
        }),
        rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
      })
      setupCapacityRepoMock()

      const res = await POST(request('/api/operating-core/capacity', {
        method: 'POST',
        body: JSON.stringify({ event_id: eventId, capacity_operativa: 25, reason: 'venue layout' }),
      }))

      expect(res.status).toBe(404)
    })
  })

  describe('Successful override set', () => {
    it('200 when successful override set', async () => {
      setupAuthAndSupabase([capacityCap])
      setupCapacityRepoMock()

      const res = await POST(request('/api/operating-core/capacity', {
        method: 'POST',
        body: JSON.stringify({ event_id: eventId, capacity_operativa: 25, reason: 'venue layout' }),
      }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.effective).toBe(25)
      expect(body.source).toBe('override')
    })

    it('200 when override removed (omitted capacity_operativa)', async () => {
      setupAuthAndSupabase([capacityCap])
      const repo = setupCapacityRepoMock()
      repo.setOverride.mockResolvedValue({
        base: { value: 30, scope: 'event', effectiveAt: new Date().toISOString() },
        override: null,
        effective: 30,
      })

      const res = await POST(request('/api/operating-core/capacity', {
        method: 'POST',
        body: JSON.stringify({ event_id: eventId }),
      }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.effective).toBe(30)
      expect(body.source).toBe('base')
    })
  })
})
