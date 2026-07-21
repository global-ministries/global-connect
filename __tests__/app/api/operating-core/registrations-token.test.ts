/**
 * @jest-environment node
 *
 * S11 — HTTP tests for public token registration endpoint
 * POST /api/operating-core/registrations/[token]
 *
 * Threat matrix:
 * - Missing auth → N/A (public endpoint)
 * - Invalid/replay/expired → 404 (NOT 409 to avoid existence disclosure)
 * - Rate limit → 429
 * - Response body must NOT contain internal IDs (registrationId, personaId)
 */

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/operating-core/registrations/[token]/route'
import { hashPublicToken } from '@/lib/platform/operating-core/public-tokens/token-hash'

// ─── Mock setup ───────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('@/lib/platform/operating-core/public-tokens/public-token-repository-supabase', () => ({
  createSupabasePublicTokensRepository: jest.fn(),
}))

jest.mock('@/lib/platform/operating-core/registrations/registration-repository-supabase', () => ({
  createSupabaseRegistrationsRepository: jest.fn(),
}))

const mockSupabaseClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const mockTokensRepo = jest.requireMock('@/lib/platform/operating-core/public-tokens/public-token-repository-supabase').createSupabasePublicTokensRepository as jest.Mock
const mockRegsRepo = jest.requireMock('@/lib/platform/operating-core/registrations/registration-repository-supabase').createSupabaseRegistrationsRepository as jest.Mock

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(`http://localhost${path}`), {
    ...init,
    headers: {
      ...init?.headers,
      'x-forwarded-for': '192.168.1.1',
    },
  })
}



function setupSupabase() {
  mockSupabaseClient.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-001' } }, error: null }) },
  })
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/operating-core/registrations/[token]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupSupabase()
  })

  describe('rate limiting', () => {
    it('allows requests within rate limit', async () => {
      const mockTokensRepoInstance = {
        claim: jest.fn().mockResolvedValue({ ok: false, reason: 'token_not_found' }),
      }
      mockTokensRepo.mockReturnValue(mockTokensRepoInstance)

      const res = await POST(request('/api/operating-core/registrations/token', {
        method: 'POST',
        body: JSON.stringify({ rawToken: 'valid-token', resourceType: 'registration_link', resourceId: 'event-001' }),
      }))

      // Either 404 (invalid) or rate-limited — but not a crash
      expect([404, 429]).toContain(res.status)
    })

    it('returns 429 after exceeding rate limit (10 req/min)', async () => {
      // Rate limit is per (tokenHash, ip) - use the SAME token for all requests
      const mockTokensRepoInstance = {
        claim: jest.fn().mockResolvedValue({ ok: false, reason: 'token_not_found' }),
      }
      mockTokensRepo.mockReturnValue(mockTokensRepoInstance)

      // Make 10 requests within the limit — all with the SAME token
      for (let i = 0; i < 10; i++) {
        await POST(request('/api/operating-core/registrations/token', {
          method: 'POST',
          body: JSON.stringify({ rawToken: 'rate-limited-token', resourceType: 'registration_link', resourceId: 'event-001' }),
        }))
      }

      // 11th request with same token should be rate limited
      const res = await POST(request('/api/operating-core/registrations/token', {
        method: 'POST',
        body: JSON.stringify({ rawToken: 'rate-limited-token', resourceType: 'registration_link', resourceId: 'event-001' }),
      }))

      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.error).toBeDefined()
    })
  })

  describe('replay protection — 404 (NOT 409)', () => {
    it('first valid claim returns 200 with outcome', async () => {
      const tokenHash = hashPublicToken('replay-token')
      const mockTokenRow = {
        token_hash: tokenHash,
        resource_type: 'registration_link',
        resource_id: 'event-001',
        persona_id: null,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        consumed_at: null,
        consumed_by_persona_id: null,
        captured_by_persona_id: null,
        metadata: {},
        created_at: new Date().toISOString(),
      }

      const mockTokensRepoInstance = {
        claim: jest.fn().mockResolvedValue({ ok: true, row: mockTokenRow }),
      }
      const mockRegsRepoInstance = {
        listByEvent: jest.fn().mockResolvedValue([]),
        listWaitlist: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ kind: 'confirmed', registrationId: 'reg-001', state: 'confirmada' }),
      }
      mockTokensRepo.mockReturnValue(mockTokensRepoInstance)
      mockRegsRepo.mockReturnValue(mockRegsRepoInstance)

      const res = await POST(request('/api/operating-core/registrations/token', {
        method: 'POST',
        body: JSON.stringify({ rawToken: 'replay-token', resourceType: 'registration_link', resourceId: 'event-001', personaId: 'persona-001' }),
      }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.outcome).toBe('confirmed')
    })

    it('second claim of same token returns 404 (NOT 409)', async () => {
      const tokenHash = hashPublicToken('replay-token')
      const mockTokenRow = {
        token_hash: tokenHash,
        resource_type: 'registration_link',
        resource_id: 'event-001',
        persona_id: null,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        consumed_at: new Date().toISOString(),
        consumed_by_persona_id: 'persona-first',
        captured_by_persona_id: null,
        metadata: {},
        created_at: new Date().toISOString(),
      }

      const mockTokensRepoInstance = {
        claim: jest.fn()
          .mockResolvedValueOnce({ ok: true, row: mockTokenRow })
          .mockResolvedValueOnce({ ok: false, reason: 'token_not_found' }),
      }
      const mockRegsRepoInstance = {
        listByEvent: jest.fn().mockResolvedValue([]),
        listWaitlist: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ kind: 'confirmed', registrationId: 'reg-001', state: 'confirmada' }),
      }
      mockTokensRepo.mockReturnValue(mockTokensRepoInstance)
      mockRegsRepo.mockReturnValue(mockRegsRepoInstance)

      // First request succeeds
      await POST(request('/api/operating-core/registrations/token', {
        method: 'POST',
        body: JSON.stringify({ rawToken: 'replay-token', resourceType: 'registration_link', resourceId: 'event-001', personaId: 'persona-001' }),
      }))

      // Second request (replay) → 404
      const res = await POST(request('/api/operating-core/registrations/token', {
        method: 'POST',
        body: JSON.stringify({ rawToken: 'replay-token', resourceType: 'registration_link', resourceId: 'event-001', personaId: 'persona-002' }),
      }))

      expect(res.status).toBe(404)
    })
  })

  describe('disclosure protection — no internal IDs in response', () => {
    it('response must NOT contain registrationId', async () => {
      const tokenHash = hashPublicToken('disclosure-test-token')
      const mockTokenRow = {
        token_hash: tokenHash,
        resource_type: 'registration_link',
        resource_id: 'event-001',
        persona_id: 'persona-001',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        consumed_at: null,
        consumed_by_persona_id: null,
        captured_by_persona_id: null,
        metadata: {},
        created_at: new Date().toISOString(),
      }

      const mockTokensRepoInstance = {
        claim: jest.fn().mockResolvedValue({ ok: true, row: mockTokenRow }),
      }
      const mockRegsRepoInstance = {
        listByEvent: jest.fn().mockResolvedValue([]),
        listWaitlist: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ kind: 'confirmed', registrationId: 'reg-internal-123', state: 'confirmada' }),
      }
      mockTokensRepo.mockReturnValue(mockTokensRepoInstance)
      mockRegsRepo.mockReturnValue(mockRegsRepoInstance)

      const res = await POST(request('/api/operating-core/registrations/token', {
        method: 'POST',
        body: JSON.stringify({ rawToken: 'disclosure-test-token', resourceType: 'registration_link', resourceId: 'event-001' }),
      }))

      const body = await res.json()
      expect(body).not.toHaveProperty('registrationId')
      expect(body).not.toHaveProperty('personaId')
      expect(body).not.toHaveProperty('id')
    })

    it('response must NOT contain personaId', async () => {
      const tokenHash = hashPublicToken('disclosure-persona-token')
      const mockTokenRow = {
        token_hash: tokenHash,
        resource_type: 'registration_link',
        resource_id: 'event-001',
        persona_id: 'persona-001',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        consumed_at: null,
        consumed_by_persona_id: null,
        captured_by_persona_id: null,
        metadata: {},
        created_at: new Date().toISOString(),
      }

      const mockTokensRepoInstance = {
        claim: jest.fn().mockResolvedValue({ ok: true, row: mockTokenRow }),
      }
      const mockRegsRepoInstance = {
        listByEvent: jest.fn().mockResolvedValue([]),
        listWaitlist: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ kind: 'waitlisted', registrationId: 'reg-001', state: 'pendiente', waitlistPosition: 1 }),
      }
      mockTokensRepo.mockReturnValue(mockTokensRepoInstance)
      mockRegsRepo.mockReturnValue(mockRegsRepoInstance)

      const res = await POST(request('/api/operating-core/registrations/token', {
        method: 'POST',
        body: JSON.stringify({ rawToken: 'disclosure-persona-token', resourceType: 'registration_link', resourceId: 'event-001' }),
      }))

      const body = await res.json()
      expect(body).not.toHaveProperty('personaId')
      expect(body.outcome).toBe('waitlisted')
    })
  })

  describe('invalid/expired tokens → 404', () => {
    it('non-existent token → 404', async () => {
      const mockTokensRepoInstance = {
        claim: jest.fn().mockResolvedValue({ ok: false, reason: 'token_not_found' }),
      }
      mockTokensRepo.mockReturnValue(mockTokensRepoInstance)

      const res = await POST(request('/api/operating-core/registrations/token', {
        method: 'POST',
        body: JSON.stringify({ rawToken: 'non-existent', resourceType: 'registration_link', resourceId: 'event-001' }),
      }))

      expect(res.status).toBe(404)
    })

    it('expired token → 404', async () => {
      const mockTokensRepoInstance = {
        claim: jest.fn().mockResolvedValue({ ok: false, reason: 'token_expired' }),
      }
      mockTokensRepo.mockReturnValue(mockTokensRepoInstance)

      const res = await POST(request('/api/operating-core/registrations/token', {
        method: 'POST',
        body: JSON.stringify({ rawToken: 'expired-token', resourceType: 'registration_link', resourceId: 'event-001' }),
      }))

      expect(res.status).toBe(404)
    })
  })

  describe('waitlisted outcome', () => {
    it('waitlisted response includes waitlistPosition', async () => {
      const tokenHash = hashPublicToken('waitlist-token')
      const mockTokenRow = {
        token_hash: tokenHash,
        resource_type: 'registration_link',
        resource_id: 'event-001',
        persona_id: 'persona-001',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        consumed_at: null,
        consumed_by_persona_id: null,
        captured_by_persona_id: null,
        metadata: {},
        created_at: new Date().toISOString(),
      }

      const mockTokensRepoInstance = {
        claim: jest.fn().mockResolvedValue({ ok: true, row: mockTokenRow }),
      }
      const mockRegsRepoInstance = {
        listByEvent: jest.fn().mockResolvedValue([{ id: 'r1' }]), // at capacity
        listWaitlist: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ kind: 'waitlisted', registrationId: 'reg-001', state: 'pendiente', waitlistPosition: 1 }),
      }
      mockTokensRepo.mockReturnValue(mockTokensRepoInstance)
      mockRegsRepo.mockReturnValue(mockRegsRepoInstance)

      const res = await POST(request('/api/operating-core/registrations/token', {
        method: 'POST',
        body: JSON.stringify({ rawToken: 'waitlist-token', resourceType: 'registration_link', resourceId: 'event-001' }),
      }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.outcome).toBe('waitlisted')
      expect(body.waitlistPosition).toBe(1)
    })
  })

  describe('capacity conflict → 409', () => {
    it('non-waitlistable capacity → 409', async () => {
      const tokenHash = hashPublicToken('capacity-token')
      const mockTokenRow = {
        token_hash: tokenHash,
        resource_type: 'registration_link',
        resource_id: 'event-001',
        persona_id: 'persona-001',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        consumed_at: null,
        consumed_by_persona_id: null,
        captured_by_persona_id: null,
        metadata: {},
        created_at: new Date().toISOString(),
      }

      const mockTokensRepoInstance = {
        claim: jest.fn().mockResolvedValue({ ok: true, row: mockTokenRow }),
      }
      const mockRegsRepoInstance = {
        listByEvent: jest.fn().mockResolvedValue([]),
        listWaitlist: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ kind: 'capacity_conflict', effectiveCapacity: 20, waitlistable: false }),
      }
      mockTokensRepo.mockReturnValue(mockTokensRepoInstance)
      mockRegsRepo.mockReturnValue(mockRegsRepoInstance)

      const res = await POST(request('/api/operating-core/registrations/token', {
        method: 'POST',
        body: JSON.stringify({ rawToken: 'capacity-token', resourceType: 'registration_link', resourceId: 'event-001' }),
      }))

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.code).toBe('capacity_exceeded')
    })
  })
})
