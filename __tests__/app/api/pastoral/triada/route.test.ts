/**
 * @jest-environment node
 *
 * W08 — DT-045 to DT-049 — HTTP tests for pastoral triada API routes.
 *
 * Tests the key auth/flag/input branches for each endpoint.
 * Route-access capability functions are mocked to isolate route logic testing.
 * Uses in-memory fake repository to avoid Supabase dependency in unit tests.
 */
import { NextRequest } from 'next/server'

// Mock route-access BEFORE importing routes
jest.mock('@/lib/platform/pastoral/route-access', () => ({
  isPastoralRouteEnabled: jest.fn((env = process.env) => {
    return env.NEXT_PUBLIC_PASTORAL_ENABLED === 'on' && env.NEXT_PUBLIC_PASTORAL_STAGE !== 'off' && env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH !== 'on'
  }),
  requirePastoralSession: jest.fn(),
  hasPastoralTriadaCreateCapability: jest.fn(),
  hasPastoralTriadaReadCapability: jest.fn(),
  hasPastoralTriadaNotesCapability: jest.fn(),
  hasPastoralTriadaDisbandCapability: jest.fn(),
  hasPastoralReadAllCapability: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  resolveReadOnlyPlatformSession: jest.fn(),
}))

jest.mock('@/lib/platform/pastoral/triad/factories', () => ({
  createPastoralTriadaRepository: jest.fn(),
}))

jest.mock('@/lib/platform/pastoral/participation-ledger-pastoral-writer', () => ({
  createSupabasePastoralLedgerWriter: jest.fn(),
}))

jest.mock('@/lib/platform/operating-core/participation-ledger-repository-supabase', () => ({
  createSupabaseParticipationLedgerRepository: jest.fn(),
}))

jest.mock('@/lib/platform/pastoral/crisis/scan', () => ({
  scanAndAlertPastoralCrisis: jest.fn().mockResolvedValue(null),
}))

import * as routeAccess from '@/lib/platform/pastoral/route-access'
import * as factories from '@/lib/platform/pastoral/triad/factories'
import * as ledgerWriter from '@/lib/platform/pastoral/participation-ledger-pastoral-writer'
import * as participationLedgerRepo from '@/lib/platform/operating-core/participation-ledger-repository-supabase'

const requireSession = routeAccess.requirePastoralSession as jest.Mock
const hasTriadaCreateCap = routeAccess.hasPastoralTriadaCreateCapability as jest.Mock
const hasTriadaReadCap = routeAccess.hasPastoralTriadaReadCapability as jest.Mock
const hasTriadaNotesCap = routeAccess.hasPastoralTriadaNotesCapability as jest.Mock
const hasTriadaDisbandCap = routeAccess.hasPastoralTriadaDisbandCapability as jest.Mock
const hasReadAllCap = routeAccess.hasPastoralReadAllCapability as jest.Mock
const createRepo = factories.createPastoralTriadaRepository as jest.Mock
const createLedgerWriter = ledgerWriter.createSupabasePastoralLedgerWriter as jest.Mock
const createLedgerRepo = participationLedgerRepo.createSupabaseParticipationLedgerRepository as jest.Mock
const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock

const authId = '11111111-1111-1111-1111-111111111111'
const actorPersonaId = '22222222-2222-2222-2222-222222222222'
const mentorPersonaId = '22222222-2222-2222-2222-222222222222'
const assistedPersonaId = '33333333-3333-3333-3333-333333333333'
const coordinatorPersonaId = '44444444-4444-4444-4444-444444444444'

// ─── In-memory fake for testing ──────────────────────────────────────────────

function createTestRepo() {
  const { createInMemoryPastoralTriadaRepository } = require('@/lib/platform/pastoral/triad/repository-fake')
  return createInMemoryPastoralTriadaRepository()
}

function createTestLedgerWriter() {
  return {
    emitPastoralEvent: jest.fn().mockResolvedValue({ id: 'ledger-event-1' }),
    emit: jest.fn().mockResolvedValue({ id: 'ledger-event-1' }),
  }
}

function authSession(personaId = actorPersonaId, caps: string[] = []) {
  createClient.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: authId, email: 'actor@example.com' } }, error: null }) },
  })
  requireSession.mockResolvedValue({
    personaId,
    subjectAuthId: authId,
    globalRoles: [],
    contexts: [],
    capabilities: caps.map((key) => ({ key, experience: 'pastoral', scopeType: 'pastoral' as const })),
  })
}

function authNull() {
  requireSession.mockResolvedValue(null)
}

function mockRepo() {
  const repo = createTestRepo()
  createRepo.mockReturnValue(repo)
  return repo
}

function mockLedgerWriter() {
  const lw = createTestLedgerWriter()
  createLedgerWriter.mockReturnValue(lw)
  return lw
}

function mockLedgerRepo() {
  const lr = { append: jest.fn().mockResolvedValue({ id: 'ledger-event-1' }) }
  createLedgerRepo.mockReturnValue(lr)
  return lr
}

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(`http://localhost${path}`), init)
}

beforeEach(() => {
  jest.clearAllMocks()
  hasTriadaCreateCap.mockReturnValue(true)
  hasTriadaReadCap.mockReturnValue(true)
  hasTriadaNotesCap.mockReturnValue(true)
  hasTriadaDisbandCap.mockReturnValue(true)
  hasReadAllCap.mockReturnValue(false)
  process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'on'
  process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'public'
  process.env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH = 'off'
})

// ─── DT-045: POST /api/pastoral/triada ──────────────────────────────────────

describe('POST /api/pastoral/triada', () => {
  let CreateRoute: (req: NextRequest) => Promise<Response>

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = await import('@/app/api/pastoral/triada/route')
    CreateRoute = mod.POST
  })

  it('401 unauthenticated', async () => {
    authNull()
    mockRepo()
    const res = await CreateRoute(request('/api/pastoral/triada', {
      method: 'POST',
      body: JSON.stringify({}),
    }))
    expect(res.status).toBe(401)
  })

  it('403 without create capability', async () => {
    authSession()
    hasTriadaCreateCap.mockReturnValueOnce(false)
    mockRepo()
    const res = await CreateRoute(request('/api/pastoral/triada', {
      method: 'POST',
      body: JSON.stringify({}),
    }))
    expect(res.status).toBe(403)
  })

  it('404 when pastoral flag off', async () => {
    process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'off'
    authSession()
    mockRepo()
    const res = await CreateRoute(request('/api/pastoral/triada', {
      method: 'POST',
      body: JSON.stringify({}),
    }))
    expect(res.status).toBe(404)
  })

  it('400 when miembros missing', async () => {
    authSession()
    mockRepo()
    const res = await CreateRoute(request('/api/pastoral/triada', {
      method: 'POST',
      body: JSON.stringify({ contexto: 'simultaneidad' }),
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('miembros')
  })

  it('400 when cardinality != 3', async () => {
    authSession()
    mockRepo()
    const res = await CreateRoute(request('/api/pastoral/triada', {
      method: 'POST',
      body: JSON.stringify({
        contexto: 'simultaneidad',
        miembros: [
          { personaId: 'p1', rolEnTriada: 'mentor' },
          { personaId: 'p2', rolEnTriada: 'asistido' },
          // missing 3rd
        ],
      }),
    }))
    expect(res.status).toBe(400)
  })

  it('400 when contexto missing', async () => {
    authSession()
    mockRepo()
    const res = await CreateRoute(request('/api/pastoral/triada', {
      method: 'POST',
      body: JSON.stringify({
        miembros: [
          { personaId: 'p1', rolEnTriada: 'mentor' },
          { personaId: 'p2', rolEnTriada: 'asistido' },
          { personaId: 'p3', rolEnTriada: 'coordinador' },
        ],
      }),
    }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('contexto')
  })

  it('201 happy path with 3 distinct humans', async () => {
    authSession()
    const repo = mockRepo()
    mockLedgerWriter()
    const res = await CreateRoute(request('/api/pastoral/triada', {
      method: 'POST',
      body: JSON.stringify({
        contexto: 'simultaneidad',
        miembros: [
          { personaId: mentorPersonaId, rolEnTriada: 'mentor' },
          { personaId: assistedPersonaId, rolEnTriada: 'asistido' },
          { personaId: coordinatorPersonaId, rolEnTriada: 'coordinador' },
        ],
      }),
    }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.id).toBeDefined()
    expect(json.version).toBe(1)
    expect(json.miembros).toHaveLength(3)
  })
})

// ─── DT-046: GET /api/pastoral/triada/[id] ──────────────────────────────────

describe('GET /api/pastoral/triada/[id]', () => {
  let GetRoute: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = await import('@/app/api/pastoral/triada/[id]/route')
    GetRoute = mod.GET
  })

  it('401 unauthenticated', async () => {
    authNull()
    mockRepo()
    const res = await GetRoute(request('/api/pastoral/triada/t1'), {
      params: Promise.resolve({ id: 't1' }),
    } as any)
    expect(res.status).toBe(401)
  })

  it('403 not mentor/member/read-all', async () => {
    authSession('stranger-persona-id')
    hasReadAllCap.mockReturnValue(false)
    const repo = mockRepo()
    await repo.createTriada({
      id: 't1',
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })
    const res = await GetRoute(request('/api/pastoral/triada/t1'), {
      params: Promise.resolve({ id: 't1' }),
    } as any)
    expect(res.status).toBe(403)
  })

  it('404 triada not found', async () => {
    authSession()
    mockRepo()
    const res = await GetRoute(request('/api/pastoral/triada/nonexistent'), {
      params: Promise.resolve({ id: 'nonexistent' }),
    } as any)
    expect(res.status).toBe(404)
  })

  it('200 as mentor oficial', async () => {
    authSession(mentorPersonaId)
    const repo = mockRepo()
    const triada = await repo.createTriada({
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })
    await repo.addMiembro({ triadaId: triada.id, personaId: mentorPersonaId, rolEnTriada: 'mentor' })
    await repo.addMiembro({ triadaId: triada.id, personaId: assistedPersonaId, rolEnTriada: 'asistido' })
    await repo.addMiembro({ triadaId: triada.id, personaId: coordinatorPersonaId, rolEnTriada: 'coordinador' })

    const res = await GetRoute(request(`/api/pastoral/triada/${triada.id}`), {
      params: Promise.resolve({ id: triada.id }),
    } as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.triada.id).toBe(triada.id)
    expect(json.miembros).toHaveLength(3)
  })

  it('200 as pastoral.read.all', async () => {
    authSession('admin-persona', ['pastoral.read.all'])
    hasReadAllCap.mockReturnValue(true)
    const repo = mockRepo()
    const triada = await repo.createTriada({
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })

    const res = await GetRoute(request(`/api/pastoral/triada/${triada.id}`), {
      params: Promise.resolve({ id: triada.id }),
    } as any)
    expect(res.status).toBe(200)
  })

  it('200 as member of triada', async () => {
    authSession(assistedPersonaId)
    hasReadAllCap.mockReturnValue(false)
    const repo = mockRepo()
    const triada = await repo.createTriada({
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })
    await repo.addMiembro({ triadaId: triada.id, personaId: mentorPersonaId, rolEnTriada: 'mentor' })
    await repo.addMiembro({ triadaId: triada.id, personaId: assistedPersonaId, rolEnTriada: 'asistido' })
    await repo.addMiembro({ triadaId: triada.id, personaId: coordinatorPersonaId, rolEnTriada: 'coordinador' })

    const res = await GetRoute(request(`/api/pastoral/triada/${triada.id}`), {
      params: Promise.resolve({ id: triada.id }),
    } as any)
    expect(res.status).toBe(200)
  })
})

// ─── DT-047: POST /api/pastoral/triada/[id]/confirm ─────────────────────────

describe('POST /api/pastoral/triada/[id]/confirm', () => {
  let ConfirmRoute: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = await import('@/app/api/pastoral/triada/[id]/confirm/route')
    ConfirmRoute = mod.POST
  })

  it('401 unauthenticated', async () => {
    authNull()
    mockRepo()
    const res = await ConfirmRoute(
      request('/api/pastoral/triada/t1/confirm', { method: 'POST', body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: 't1' }) } as any,
    )
    expect(res.status).toBe(401)
  })

  it('403 without pastoral.read.all', async () => {
    authSession()
    hasReadAllCap.mockReturnValue(false)
    mockRepo()
    const res = await ConfirmRoute(
      request('/api/pastoral/triada/t1/confirm', { method: 'POST', body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: 't1' }) } as any,
    )
    expect(res.status).toBe(403)
  })

  it('404 triada not found', async () => {
    authSession()
    hasReadAllCap.mockReturnValue(true)
    const repo = mockRepo()
    mockLedgerWriter()
    const res = await ConfirmRoute(
      request('/api/pastoral/triada/nonexistent/confirm', {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 1 }),
      }),
      { params: Promise.resolve({ id: 'nonexistent' }) } as any,
    )
    expect(res.status).toBe(404)
  })

  it('400 invalid state transition (not pending_confirmation)', async () => {
    authSession()
    hasReadAllCap.mockReturnValue(true)
    const repo = mockRepo()
    mockLedgerWriter()
    const triada = await repo.createTriada({
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })
    // Transition to active first
    await repo.updateTriada(triada.id, { estado: 'active', expectedVersion: 1 })

    const res = await ConfirmRoute(
      request(`/api/pastoral/triada/${triada.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 2 }),
      }),
      { params: Promise.resolve({ id: triada.id }) } as any,
    )
    expect(res.status).toBe(400)
  })

  it('409 stale version', async () => {
    authSession()
    hasReadAllCap.mockReturnValue(true)
    const repo = mockRepo()
    mockLedgerWriter()
    const triada = await repo.createTriada({
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })

    const res = await ConfirmRoute(
      request(`/api/pastoral/triada/${triada.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 99 }), // stale
      }),
      { params: Promise.resolve({ id: triada.id }) } as any,
    )
    expect(res.status).toBe(409)
  })

  it('200 happy path pending_confirmation → active', async () => {
    authSession()
    hasReadAllCap.mockReturnValue(true)
    const repo = mockRepo()
    mockLedgerWriter()
    const triada = await repo.createTriada({
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })

    const res = await ConfirmRoute(
      request(`/api/pastoral/triada/${triada.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 1 }),
      }),
      { params: Promise.resolve({ id: triada.id }) } as any,
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.estado).toBe('active')
    expect(json.version).toBe(2)
  })
})

// ─── DT-048: POST /api/pastoral/triada/[id]/disband ─────────────────────────

describe('POST /api/pastoral/triada/[id]/disband', () => {
  let DisbandRoute: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = await import('@/app/api/pastoral/triada/[id]/disband/route')
    DisbandRoute = mod.POST
  })

  it('401 unauthenticated', async () => {
    authNull()
    mockRepo()
    const res = await DisbandRoute(
      request('/api/pastoral/triada/t1/disband', { method: 'POST', body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: 't1' }) } as any,
    )
    expect(res.status).toBe(401)
  })

  it('403 without disband capability', async () => {
    authSession()
    hasTriadaDisbandCap.mockReturnValueOnce(false)
    mockRepo()
    const res = await DisbandRoute(
      request('/api/pastoral/triada/t1/disband', { method: 'POST', body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: 't1' }) } as any,
    )
    expect(res.status).toBe(403)
  })

  it('404 triada not found', async () => {
    authSession()
    mockRepo()
    mockLedgerWriter()
    mockLedgerRepo()
    const res = await DisbandRoute(
      request('/api/pastoral/triada/nonexistent/disband', {
        method: 'POST',
        body: JSON.stringify({ motivo: 'pastoral_decision', expectedVersion: 1 }),
      }),
      { params: Promise.resolve({ id: 'nonexistent' }) } as any,
    )
    expect(res.status).toBe(404)
  })

  it('403 not mentor oficial', async () => {
    authSession('not-mentor-persona-id')
    hasTriadaDisbandCap.mockReturnValue(true)
    const repo = mockRepo()
    mockLedgerWriter()
    mockLedgerRepo()
    const triada = await repo.createTriada({
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })

    const res = await DisbandRoute(
      request(`/api/pastoral/triada/${triada.id}/disband`, {
        method: 'POST',
        body: JSON.stringify({ motivo: 'pastoral_decision', expectedVersion: 1 }),
      }),
      { params: Promise.resolve({ id: triada.id }) } as any,
    )
    expect(res.status).toBe(403)
  })

  it('400 missing motivo', async () => {
    authSession(mentorPersonaId)
    const repo = mockRepo()
    mockLedgerWriter()
    mockLedgerRepo()
    const triada = await repo.createTriada({
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })

    const res = await DisbandRoute(
      request(`/api/pastoral/triada/${triada.id}/disband`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 1 }),
      }),
      { params: Promise.resolve({ id: triada.id }) } as any,
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('motivo')
  })

  it('409 already disbanded (terminal state)', async () => {
    authSession(mentorPersonaId)
    const repo = mockRepo()
    mockLedgerWriter()
    mockLedgerRepo()
    const triada = await repo.createTriada({
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })
    // Disband first
    await repo.updateTriada(triada.id, { estado: 'disbanded', motivoDisolucion: 'pastoral_decision', expectedVersion: 1 })

    const res = await DisbandRoute(
      request(`/api/pastoral/triada/${triada.id}/disband`, {
        method: 'POST',
        body: JSON.stringify({ motivo: 'pastoral_decision', expectedVersion: 2 }),
      }),
      { params: Promise.resolve({ id: triada.id }) } as any,
    )
    expect(res.status).toBe(409)
  })

  it('409 stale version', async () => {
    authSession(mentorPersonaId)
    const repo = mockRepo()
    mockLedgerWriter()
    mockLedgerRepo()
    const triada = await repo.createTriada({
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })

    const res = await DisbandRoute(
      request(`/api/pastoral/triada/${triada.id}/disband`, {
        method: 'POST',
        body: JSON.stringify({ motivo: 'pastoral_decision', expectedVersion: 99 }),
      }),
      { params: Promise.resolve({ id: triada.id }) } as any,
    )
    expect(res.status).toBe(409)
  })

  it('200 happy path disband', async () => {
    authSession(mentorPersonaId)
    const repo = mockRepo()
    mockLedgerWriter()
    mockLedgerRepo()
    const triada = await repo.createTriada({
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })

    const res = await DisbandRoute(
      request(`/api/pastoral/triada/${triada.id}/disband`, {
        method: 'POST',
        body: JSON.stringify({ motivo: 'pastoral_decision', expectedVersion: 1 }),
      }),
      { params: Promise.resolve({ id: triada.id }) } as any,
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.estado).toBe('disbanded')
    expect(json.motivoDisolucion).toBe('pastoral_decision')
  })
})

// ─── DT-049: GET|POST /api/pastoral/triada/[id]/notes ─────────────────────────

describe('GET /api/pastoral/triada/[id]/notes', () => {
  let GetNotesRoute: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = await import('@/app/api/pastoral/triada/[id]/notes/route')
    GetNotesRoute = mod.GET
  })

  it('401 unauthenticated', async () => {
    authNull()
    mockRepo()
    const res = await GetNotesRoute(
      request('/api/pastoral/triada/t1/notes'),
      { params: Promise.resolve({ id: 't1' }) } as any,
    )
    expect(res.status).toBe(401)
  })

  it('403 without notes or read-all capability', async () => {
    authSession()
    hasTriadaNotesCap.mockReturnValue(false)
    hasReadAllCap.mockReturnValue(false)
    mockRepo()
    const res = await GetNotesRoute(
      request('/api/pastoral/triada/t1/notes'),
      { params: Promise.resolve({ id: 't1' }) } as any,
    )
    expect(res.status).toBe(403)
  })

  it('404 triada not found', async () => {
    authSession()
    hasTriadaNotesCap.mockReturnValue(true)
    mockRepo()
    const res = await GetNotesRoute(
      request('/api/pastoral/triada/nonexistent/notes'),
      { params: Promise.resolve({ id: 'nonexistent' }) } as any,
    )
    expect(res.status).toBe(404)
  })

  it('403 not mentor/member/read-all', async () => {
    authSession('stranger')
    hasTriadaNotesCap.mockReturnValue(true)
    hasReadAllCap.mockReturnValue(false)
    const repo = mockRepo()
    const triada = await repo.createTriada({
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })
    const res = await GetNotesRoute(
      request(`/api/pastoral/triada/${triada.id}/notes`),
      { params: Promise.resolve({ id: triada.id }) } as any,
    )
    expect(res.status).toBe(403)
  })

  it('200 returns notes with P7 filter for coordinador_area in simultaneidad', async () => {
    // Coordinator persona trying to read notes in simultaneidad context
    authSession(coordinatorPersonaId)
    hasTriadaNotesCap.mockReturnValue(true)
    hasReadAllCap.mockReturnValue(false)
    const repo = mockRepo()
    const triada = await repo.createTriada({
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })
    await repo.addMiembro({ triadaId: triada.id, personaId: mentorPersonaId, rolEnTriada: 'mentor' })
    await repo.addMiembro({ triadaId: triada.id, personaId: assistedPersonaId, rolEnTriada: 'asistido' })
    await repo.addMiembro({ triadaId: triada.id, personaId: coordinatorPersonaId, rolEnTriada: 'coordinador_area' })

    // Add note from mentor (GDV leader) — should be filtered out by P7
    await repo.addNota({ triadaId: triada.id, autorPersonaId: mentorPersonaId, contenido: 'Nota del líder GDV' })
    // Add note from coordinator — should be visible
    await repo.addNota({ triadaId: triada.id, autorPersonaId: coordinatorPersonaId, contenido: 'Nota del coordinador' })

    const res = await GetNotesRoute(
      request(`/api/pastoral/triada/${triada.id}/notes`),
      { params: Promise.resolve({ id: triada.id }) } as any,
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    // P7: coordinador_area in simultaneidad cannot see mentor's notes
    expect(json.notas).toHaveLength(1)
    expect(json.notas[0].autorPersonaId).toBe(coordinatorPersonaId)
  })

  it('200 returns all notes for pastoral.read.all (P7 bypass)', async () => {
    authSession('admin')
    hasTriadaNotesCap.mockReturnValue(true)
    hasReadAllCap.mockReturnValue(true)
    const repo = mockRepo()
    const triada = await repo.createTriada({
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })
    await repo.addMiembro({ triadaId: triada.id, personaId: mentorPersonaId, rolEnTriada: 'mentor' })
    await repo.addMiembro({ triadaId: triada.id, personaId: assistedPersonaId, rolEnTriada: 'asistido' })
    await repo.addMiembro({ triadaId: triada.id, personaId: coordinatorPersonaId, rolEnTriada: 'coordinador_area' })
    await repo.addNota({ triadaId: triada.id, autorPersonaId: mentorPersonaId, contenido: 'Nota del líder GDV' })
    await repo.addNota({ triadaId: triada.id, autorPersonaId: coordinatorPersonaId, contenido: 'Nota del coordinador' })

    const res = await GetNotesRoute(
      request(`/api/pastoral/triada/${triada.id}/notes`),
      { params: Promise.resolve({ id: triada.id }) } as any,
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    // pastoral.read.all bypasses P7 — sees all notes
    expect(json.notas).toHaveLength(2)
  })
})

describe('POST /api/pastoral/triada/[id]/notes', () => {
  let PostNotesRoute: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = await import('@/app/api/pastoral/triada/[id]/notes/route')
    PostNotesRoute = mod.POST
  })

  it('401 unauthenticated', async () => {
    authNull()
    mockRepo()
    const res = await PostNotesRoute(
      request('/api/pastoral/triada/t1/notes', { method: 'POST', body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: 't1' }) } as any,
    )
    expect(res.status).toBe(401)
  })

  it('403 without notes capability', async () => {
    authSession()
    hasTriadaNotesCap.mockReturnValue(false)
    mockRepo()
    const res = await PostNotesRoute(
      request('/api/pastoral/triada/t1/notes', { method: 'POST', body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: 't1' }) } as any,
    )
    expect(res.status).toBe(403)
  })

  it('400 missing contenido', async () => {
    authSession()
    hasTriadaNotesCap.mockReturnValue(true)
    mockRepo()
    const res = await PostNotesRoute(
      request('/api/pastoral/triada/t1/notes', { method: 'POST', body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: 't1' }) } as any,
    )
    expect(res.status).toBe(400)
  })

  it('201 as mentor oficial', async () => {
    authSession(mentorPersonaId)
    hasTriadaNotesCap.mockReturnValue(true)
    hasReadAllCap.mockReturnValue(false)
    const repo = mockRepo()
    const triada = await repo.createTriada({
      mentorOficialPersonaId: mentorPersonaId,
      autorPersonaId: 'autor',
      contexto: 'simultaneidad',
    })
    await repo.addMiembro({ triadaId: triada.id, personaId: mentorPersonaId, rolEnTriada: 'mentor' })

    const res = await PostNotesRoute(
      request(`/api/pastoral/triada/${triada.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ contenido: 'Nota de prueba' }),
      }),
      { params: Promise.resolve({ id: triada.id }) } as any,
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.contenido).toBe('Nota de prueba')
    expect(json.autorPersonaId).toBe(mentorPersonaId)
  })
})
