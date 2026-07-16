/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/operating-core/services/route'
import { createInMemoryServicesRepository } from '@/lib/platform/operating-core/repositories/services-repository-fake'
import type { VersionedOperatingCoreService } from '@/lib/platform/operating-core/repositories/services-repository'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({ resolveReadOnlyPlatformSession: jest.fn() }))
jest.mock('@/lib/platform/operating-core/repositories/factory', () => ({
  createOperatingCoreServicesRepository: jest.fn(),
}))

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock
const createRepo = jest.requireMock('@/lib/platform/operating-core/repositories/factory').createOperatingCoreServicesRepository as jest.Mock

const authId = '11111111-1111-1111-1111-111111111111'
const actorPersonaId = '22222222-2222-2222-2222-222222222222'
const readCap = { key: 'operating_core.services.read', experience: 'operating_core', scopeType: 'experience', source: 'test' }
const manageCap = { key: 'operating_core.services.manage', experience: 'operating_core', scopeType: 'experience', source: 'test' }
const otherCap = { key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', source: 'test' }

const seedService = {
  id: 'srv-001',
  campusId: 'campus-north',
  kind: 'service' as const,
  label: 'Sunday Service',
  weekday: 0,
  startTime: '10:00',
  estado: 'active' as const,
  version: 1,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
}

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(`http://localhost${path}`), init)
}

function auth(caps: Record<string, unknown>[], user: { id: string; email: string } | null = { id: authId, email: 'actor@example.com' }) {
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) } })
  resolveSession.mockResolvedValue(user ? { personaId: actorPersonaId, subjectAuthId: authId, globalRoles: [], contexts: [], capabilities: caps } : null)
}

function repo(seed?: ReadonlyArray<VersionedOperatingCoreService>) {
  createRepo.mockReturnValue(createInMemoryServicesRepository(seed ? { seed } : {}))
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'on'
})

describe('GET /api/operating-core/services', () => {
  it('401 unauthenticated', async () => {
    auth([], null)
    repo()
    expect((await GET(request('/api/operating-core/services'))).status).toBe(401)
  })

  it('403 without read capability', async () => {
    auth([otherCap])
    repo()
    expect((await GET(request('/api/operating-core/services'))).status).toBe(403)
  })

  it('404 when flag off', async () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'off'
    auth([readCap])
    repo()
    expect((await GET(request('/api/operating-core/services'))).status).toBe(404)
  })

  it('200 returns all services without filters', async () => {
    auth([readCap])
    repo([seedService])
    const res = await GET(request('/api/operating-core/services'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.services).toHaveLength(1)
    expect(body.services[0].id).toBe('srv-001')
  })

  it('200 returns empty list when no services', async () => {
    auth([readCap])
    repo([])
    const res = await GET(request('/api/operating-core/services'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.services).toHaveLength(0)
  })
})

describe('POST /api/operating-core/services', () => {
  it('401 unauthenticated', async () => {
    auth([], null)
    repo()
    expect((await POST(request('/api/operating-core/services', {
      method: 'POST',
      body: JSON.stringify({ campusId: 'campus-north', kind: 'service', label: 'New Service', weekday: 0, startTime: '10:00' }),
    }))).status).toBe(401)
  })

  it('403 without manage capability', async () => {
    auth([readCap])
    repo()
    expect((await POST(request('/api/operating-core/services', {
      method: 'POST',
      body: JSON.stringify({ campusId: 'campus-north', kind: 'service', label: 'New Service', weekday: 0, startTime: '10:00' }),
    }))).status).toBe(403)
  })

  it('404 when flag off', async () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'off'
    auth([manageCap])
    repo()
    expect((await POST(request('/api/operating-core/services', {
      method: 'POST',
      body: JSON.stringify({ campusId: 'campus-north', kind: 'service', label: 'New Service', weekday: 0, startTime: '10:00' }),
    }))).status).toBe(404)
  })

  it('201 creates service with all required fields', async () => {
    auth([manageCap])
    repo()
    const res = await POST(request('/api/operating-core/services', {
      method: 'POST',
      body: JSON.stringify({ campusId: 'campus-south', kind: 'workshop', label: 'Workshop', weekday: 3, startTime: '14:00' }),
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.service.kind).toBe('workshop')
    expect(body.service.label).toBe('Workshop')
    expect(body.service.estado).toBe('active')
    expect(body.service.version).toBe(1)
  })

  it('400 when campusId is missing', async () => {
    auth([manageCap])
    repo()
    expect((await POST(request('/api/operating-core/services', {
      method: 'POST',
      body: JSON.stringify({ kind: 'service', label: 'Missing Campus', weekday: 0, startTime: '10:00' }),
    }))).status).toBe(400)
  })

  it('400 when kind is invalid', async () => {
    auth([manageCap])
    repo()
    expect((await POST(request('/api/operating-core/services', {
      method: 'POST',
      body: JSON.stringify({ campusId: 'campus-north', kind: 'camp', label: 'Invalid', weekday: 0, startTime: '10:00' }),
    }))).status).toBe(400)
  })

  it('400 when weekday is out of range', async () => {
    auth([manageCap])
    repo()
    expect((await POST(request('/api/operating-core/services', {
      method: 'POST',
      body: JSON.stringify({ campusId: 'campus-north', kind: 'service', label: 'Invalid', weekday: 7, startTime: '10:00' }),
    }))).status).toBe(400)
  })
})
