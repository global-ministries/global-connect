/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { GET, PATCH, POST } from '@/app/api/operating-core/events/[id]/route'
import { createInMemoryEventsRepository } from '@/lib/platform/operating-core/repositories/events-repository-fake'
import type { VersionedOperatingCoreEvent } from '@/lib/platform/operating-core/repositories/events-repository'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({ resolveReadOnlyPlatformSession: jest.fn() }))
jest.mock('@/lib/platform/operating-core/repositories/factory', () => ({
  createOperatingCoreEventsRepository: jest.fn(),
}))

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock
const createRepo = jest.requireMock('@/lib/platform/operating-core/repositories/factory').createOperatingCoreEventsRepository as jest.Mock

const authId = '11111111-1111-1111-1111-111111111111'
const actorPersonaId = '22222222-2222-2222-2222-222222222222'
const readCap = { key: 'operating_core.events.read', experience: 'operating_core', scopeType: 'experience', source: 'test' }
const manageCap = { key: 'operating_core.events.manage', experience: 'operating_core', scopeType: 'experience', source: 'test' }
const otherCap = { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', source: 'test' }

const seedEvent = {
  id: 'evt-001',
  serviceId: null,
  kind: 'service' as const,
  estado: 'active' as const,
  title: 'Sunday Service',
  startTime: '2026-07-19T10:00:00.000Z',
  visibilityScope: 'public',
  recurrenceRule: null,
  parentEventId: null,
  version: 1,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
}

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(`http://localhost${path}`), init)
}

function ctx(id: string) {
  return { params: { id } }
}

function auth(caps: Record<string, unknown>[], user: { id: string; email: string } | null = { id: authId, email: 'actor@example.com' }) {
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) } })
  resolveSession.mockResolvedValue(user ? { personaId: actorPersonaId, subjectAuthId: authId, globalRoles: [], contexts: [], capabilities: caps } : null)
}

function repo(seed?: ReadonlyArray<VersionedOperatingCoreEvent>) {
  createRepo.mockReturnValue(createInMemoryEventsRepository(seed ? { seed } : {}))
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'on'
})

describe('GET /api/operating-core/events/[id]', () => {
  it('401 unauthenticated', async () => {
    auth([], null)
    repo()
    expect((await GET(request('/api/operating-core/events/evt-001'), ctx('evt-001'))).status).toBe(401)
  })

  it('403 without read capability', async () => {
    auth([otherCap])
    repo()
    expect((await GET(request('/api/operating-core/events/evt-001'), ctx('evt-001'))).status).toBe(403)
  })

  it('404 when flag off', async () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'off'
    auth([readCap])
    repo()
    expect((await GET(request('/api/operating-core/events/evt-001'), ctx('evt-001'))).status).toBe(404)
  })

  it('200 returns event by id', async () => {
    auth([readCap])
    repo([seedEvent])
    const res = await GET(request('/api/operating-core/events/evt-001'), ctx('evt-001'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.event.id).toBe('evt-001')
  })

  it('404 when event not found', async () => {
    auth([readCap])
    repo([])
    expect((await GET(request('/api/operating-core/events/nonexistent'), ctx('nonexistent'))).status).toBe(404)
  })
})

describe('PATCH /api/operating-core/events/[id]', () => {
  it('401 unauthenticated', async () => {
    auth([], null)
    repo()
    expect((await PATCH(request('/api/operating-core/events/evt-001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated Title', version: 1 }),
    }), ctx('evt-001'))).status).toBe(401)
  })

  it('403 without manage capability', async () => {
    auth([readCap])
    repo()
    expect((await PATCH(request('/api/operating-core/events/evt-001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated Title', version: 1 }),
    }), ctx('evt-001'))).status).toBe(403)
  })

  it('404 when flag off', async () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'off'
    auth([manageCap])
    repo()
    expect((await PATCH(request('/api/operating-core/events/evt-001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated Title', version: 1 }),
    }), ctx('evt-001'))).status).toBe(404)
  })

  it('200 updates event title', async () => {
    auth([manageCap])
    repo([seedEvent])
    const res = await PATCH(request('/api/operating-core/events/evt-001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated Title', version: 1 }),
    }), ctx('evt-001'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.event.title).toBe('Updated Title')
    expect(body.event.version).toBe(2)
  })

  it('404 when event not found', async () => {
    auth([manageCap])
    repo([])
    expect((await PATCH(request('/api/operating-core/events/nonexistent', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated Title', version: 1 }),
    }), ctx('nonexistent'))).status).toBe(404)
  })

  it('409 on version conflict', async () => {
    auth([manageCap])
    repo([seedEvent])
    const res = await PATCH(request('/api/operating-core/events/evt-001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated Title', version: 99 }),
    }), ctx('evt-001'))
    expect(res.status).toBe(409)
  })
})

describe('POST /api/operating-core/events/[id] (cancel)', () => {
  it('401 unauthenticated', async () => {
    auth([], null)
    repo()
    expect((await POST(request('/api/operating-core/events/evt-001', {
      method: 'POST',
      body: JSON.stringify({ action: 'cancel', motivo: 'weather' }),
    }), ctx('evt-001'))).status).toBe(401)
  })

  it('403 without manage capability', async () => {
    auth([readCap])
    repo()
    expect((await POST(request('/api/operating-core/events/evt-001', {
      method: 'POST',
      body: JSON.stringify({ action: 'cancel', motivo: 'weather' }),
    }), ctx('evt-001'))).status).toBe(403)
  })

  it('404 when flag off', async () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'off'
    auth([manageCap])
    repo()
    expect((await POST(request('/api/operating-core/events/evt-001', {
      method: 'POST',
      body: JSON.stringify({ action: 'cancel', motivo: 'weather' }),
    }), ctx('evt-001'))).status).toBe(404)
  })

  it('200 cancels event', async () => {
    auth([manageCap])
    repo([seedEvent])
    const res = await POST(request('/api/operating-core/events/evt-001', {
      method: 'POST',
      body: JSON.stringify({ action: 'cancel', motivo: 'weather' }),
    }), ctx('evt-001'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.event.estado).toBe('cancelled')
  })
})
