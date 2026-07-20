/**
 * @jest-environment node
 *
 * S11 — HTTP tests for authenticated registrations endpoint
 * GET|POST /api/operating-core/registrations
 *
 * Threat matrix:
 * - Missing auth → 401
 * - Missing capability → 403
 * - Flag off → 404
 */

import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/operating-core/registrations/route'

// ─── Mock setup ───────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  resolveReadOnlyPlatformSession: jest.fn(),
}))

jest.mock('@/lib/platform/operating-core/registrations/registration-repository-supabase', () => ({
  createSupabaseRegistrationsRepository: jest.fn(),
}))

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock
const mockRegsRepo = jest.requireMock('@/lib/platform/operating-core/registrations/registration-repository-supabase').createSupabaseRegistrationsRepository as jest.Mock

const authId = '11111111-1111-1111-1111-111111111111'
const actorPersonaId = '22222222-2222-2222-2222-222222222222'
const manageCap = { key: 'operating_core.events.manage', experience: 'operating_core', scopeType: 'experience', source: 'test' }
const otherCap = { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', source: 'test' }

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(`http://localhost${path}`), init)
}

function auth(caps: Record<string, unknown>[], user: { id: string; email: string } | null = { id: authId, email: 'actor@example.com' }) {
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) } })
  resolveSession.mockResolvedValue(user ? { personaId: actorPersonaId, subjectAuthId: authId, globalRoles: [], contexts: [], capabilities: caps } : null)
}

function repo() {
  mockRegsRepo.mockReturnValue({
    list: jest.fn().mockResolvedValue([]),
    listByEvent: jest.fn().mockResolvedValue([]),
    listWaitlist: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'on'
})

// ─── GET /api/operating-core/registrations ─────────────────────────────────────

describe('GET /api/operating-core/registrations', () => {
  it('401 unauthenticated', async () => {
    auth([], null)
    repo()
    expect((await GET(request('/api/operating-core/registrations'))).status).toBe(401)
  })

  it('403 without manage capability', async () => {
    auth([otherCap])
    repo()
    expect((await GET(request('/api/operating-core/registrations'))).status).toBe(403)
  })

  it('404 when flag off', async () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'off'
    auth([manageCap])
    repo()
    expect((await GET(request('/api/operating-core/registrations'))).status).toBe(404)
  })

  it('200 with manage capability', async () => {
    auth([manageCap])
    repo()
    expect((await GET(request('/api/operating-core/registrations'))).status).toBe(200)
  })
})

// ─── POST /api/operating-core/registrations ───────────────────────────────────

describe('POST /api/operating-core/registrations', () => {
  it('401 unauthenticated', async () => {
    auth([], null)
    repo()
    expect((await POST(request('/api/operating-core/registrations', {
      method: 'POST',
      body: JSON.stringify({ personaId: 'p1', eventId: 'e1', confirmationMode: 'automatic', effectiveCapacity: 20, waitlistable: true }),
    }))).status).toBe(401)
  })

  it('403 without manage capability', async () => {
    auth([otherCap])
    repo()
    expect((await POST(request('/api/operating-core/registrations', {
      method: 'POST',
      body: JSON.stringify({ personaId: 'p1', eventId: 'e1', confirmationMode: 'automatic', effectiveCapacity: 20, waitlistable: true }),
    }))).status).toBe(403)
  })

  it('404 when flag off', async () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'off'
    auth([manageCap])
    repo()
    expect((await POST(request('/api/operating-core/registrations', {
      method: 'POST',
      body: JSON.stringify({ personaId: 'p1', eventId: 'e1', confirmationMode: 'automatic', effectiveCapacity: 20, waitlistable: true }),
    }))).status).toBe(404)
  })

  it('400 when personaId missing', async () => {
    auth([manageCap])
    repo()
    expect((await POST(request('/api/operating-core/registrations', {
      method: 'POST',
      body: JSON.stringify({ eventId: 'e1', confirmationMode: 'automatic', effectiveCapacity: 20, waitlistable: true }),
    }))).status).toBe(400)
  })

  it('400 when confirmationMode invalid', async () => {
    auth([manageCap])
    repo()
    expect((await POST(request('/api/operating-core/registrations', {
      method: 'POST',
      body: JSON.stringify({ personaId: 'p1', eventId: 'e1', confirmationMode: 'invalid', effectiveCapacity: 20, waitlistable: true }),
    }))).status).toBe(400)
  })

  it('409 capacity_conflict returns code capacity_exceeded', async () => {
    auth([manageCap])
    const mockRepoInstance = {
      listByEvent: jest.fn().mockResolvedValue([]),
      listWaitlist: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ kind: 'capacity_conflict', effectiveCapacity: 20, waitlistable: false }),
    }
    mockRegsRepo.mockReturnValue(mockRepoInstance)

    const res = await POST(request('/api/operating-core/registrations', {
      method: 'POST',
      body: JSON.stringify({ personaId: 'p1', eventId: 'e1', confirmationMode: 'automatic', effectiveCapacity: 20, waitlistable: false }),
    }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('capacity_exceeded')
  })

  it('409 irreconcilable_idempotency returns code already_registered', async () => {
    auth([manageCap])
    const mockRepoInstance = {
      listByEvent: jest.fn().mockResolvedValue([]),
      listWaitlist: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ kind: 'irreconcilable_idempotency', personaId: 'p1', eventId: 'e1' }),
    }
    mockRegsRepo.mockReturnValue(mockRepoInstance)

    const res = await POST(request('/api/operating-core/registrations', {
      method: 'POST',
      body: JSON.stringify({ personaId: 'p1', eventId: 'e1', confirmationMode: 'automatic', effectiveCapacity: 20, waitlistable: true }),
    }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('already_registered')
  })

  it('200 confirmed outcome', async () => {
    auth([manageCap])
    const mockRepoInstance = {
      listByEvent: jest.fn().mockResolvedValue([]),
      listWaitlist: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ kind: 'confirmed', registrationId: 'reg-001', state: 'confirmada' }),
    }
    mockRegsRepo.mockReturnValue(mockRepoInstance)

    const res = await POST(request('/api/operating-core/registrations', {
      method: 'POST',
      body: JSON.stringify({ personaId: 'p1', eventId: 'e1', confirmationMode: 'automatic', effectiveCapacity: 20, waitlistable: true }),
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.outcome).toBe('confirmed')
    expect(body).not.toHaveProperty('registrationId')
    expect(body).not.toHaveProperty('personaId')
  })

  it('200 waitlisted outcome with waitlistPosition', async () => {
    auth([manageCap])
    const mockRepoInstance = {
      listByEvent: jest.fn().mockResolvedValue([]),
      listWaitlist: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ kind: 'waitlisted', registrationId: 'reg-001', state: 'pendiente', waitlistPosition: 3 }),
    }
    mockRegsRepo.mockReturnValue(mockRepoInstance)

    const res = await POST(request('/api/operating-core/registrations', {
      method: 'POST',
      body: JSON.stringify({ personaId: 'p1', eventId: 'e1', confirmationMode: 'automatic', effectiveCapacity: 20, waitlistable: true }),
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.outcome).toBe('waitlisted')
    expect(body.waitlistPosition).toBe(3)
  })
})
