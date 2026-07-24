/**
 * @jest-environment node
 *
 * W06 — DT-037-044 — HTTP tests for pastoral 1:1 API routes.
 *
 * Tests the key auth/flag/input branches for each endpoint.
 * Route-access capability functions are mocked to isolate route logic testing.
 */
import { NextRequest } from 'next/server'

// Mock route-access BEFORE importing routes
jest.mock('@/lib/platform/pastoral/route-access', () => ({
  isPastoralRouteEnabled: jest.fn((env = process.env) => {
    return env.NEXT_PUBLIC_PASTORAL_ENABLED === 'on' && env.NEXT_PUBLIC_PASTORAL_STAGE !== 'off' && env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH !== 'on'
  }),
  requirePastoralSession: jest.fn(),
  hasPastoralOneOnOneWriteCapability: jest.fn(),
  hasPastoralOneOnOneReadCapability: jest.fn(),
  hasPastoralOneOnOneNotesCapability: jest.fn(),
  hasPastoralOneOnOneValidateCapability: jest.fn(),
  hasPastoralOneOnOneCompleteCapability: jest.fn(),
  hasPastoralReadAllCapability: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  resolveReadOnlyPlatformSession: jest.fn(),
}))

import { POST as createPost } from '@/app/api/pastoral/one-on-one/route'
import { POST as validateStepPost } from '@/app/api/pastoral/one-on-one/[id]/validate-step/route'
import * as routeAccess from '@/lib/platform/pastoral/route-access'

const requireSession = routeAccess.requirePastoralSession as jest.Mock
const hasWriteCap = routeAccess.hasPastoralOneOnOneWriteCapability as jest.Mock
const hasValidateCap = routeAccess.hasPastoralOneOnOneValidateCapability as jest.Mock
const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock

const authId = '11111111-1111-1111-1111-111111111111'
const actorPersonaId = '22222222-2222-2222-2222-222222222222'

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(`http://localhost${path}`), init)
}

function authSession() {
  createClient.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: authId, email: 'actor@example.com' } }, error: null }) },
  })
  requireSession.mockResolvedValue({
    personaId: actorPersonaId,
    subjectAuthId: authId,
    globalRoles: [],
    contexts: [],
    capabilities: [],
  })
}

function authNull() {
  requireSession.mockResolvedValue(null)
}

beforeEach(() => {
  jest.clearAllMocks()
  hasWriteCap.mockReturnValue(true)
  hasValidateCap.mockReturnValue(true)
  process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'on'
  process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'public'
  process.env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH = 'off'
})

// ─── POST /api/pastoral/one-on-one ─────────────────────────────────────────

describe('POST /api/pastoral/one-on-one', () => {
  it('401 unauthenticated', async () => {
    authNull()
    const res = await createPost(request('/api/pastoral/one-on-one', {
      method: 'POST',
      body: JSON.stringify({ mentorOficialPersonaId: actorPersonaId }),
    }))
    expect(res.status).toBe(401)
  })

  it('403 without create capability', async () => {
    authSession()
    hasWriteCap.mockReturnValueOnce(false)
    const res = await createPost(request('/api/pastoral/one-on-one', {
      method: 'POST',
      body: JSON.stringify({ mentorOficialPersonaId: actorPersonaId }),
    }))
    expect(res.status).toBe(403)
  })

  it('404 when pastoral flag off', async () => {
    process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'off'
    authSession()
    const res = await createPost(request('/api/pastoral/one-on-one', {
      method: 'POST',
      body: JSON.stringify({ mentorOficialPersonaId: actorPersonaId }),
    }))
    expect(res.status).toBe(404)
  })

  it('400 when mentorOficialPersonaId missing', async () => {
    authSession()
    const res = await createPost(request('/api/pastoral/one-on-one', {
      method: 'POST',
      body: JSON.stringify({}),
    }))
    expect(res.status).toBe(400)
  })
})

// ─── POST /api/pastoral/one-on-one/[id]/validate-step ────────────────────────

describe('POST /api/pastoral/one-on-one/[id]/validate-step', () => {
  it('401 unauthenticated', async () => {
    authNull()
    const res = await validateStepPost(
      request('/api/pastoral/one-on-one/ooo-1/validate-step', {
        method: 'POST',
        body: JSON.stringify({ stepId: 'step-1' }),
      }),
      { params: Promise.resolve({ id: 'ooo-1' }) } as any,
    )
    expect(res.status).toBe(401)
  })

  it('403 without validate_step capability', async () => {
    authSession()
    hasValidateCap.mockReturnValueOnce(false)
    const res = await validateStepPost(
      request('/api/pastoral/one-on-one/ooo-1/validate-step', {
        method: 'POST',
        body: JSON.stringify({ stepId: 'step-1' }),
      }),
      { params: Promise.resolve({ id: 'ooo-1' }) } as any,
    )
    expect(res.status).toBe(403)
  })

  it('400 when stepId missing', async () => {
    authSession()
    const res = await validateStepPost(
      request('/api/pastoral/one-on-one/ooo-1/validate-step', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'ooo-1' }) } as any,
    )
    expect(res.status).toBe(400)
  })

  it('404 when pastoral flag off', async () => {
    process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'off'
    authSession()
    const res = await validateStepPost(
      request('/api/pastoral/one-on-one/ooo-1/validate-step', {
        method: 'POST',
        body: JSON.stringify({ stepId: 'step-1' }),
      }),
      { params: Promise.resolve({ id: 'ooo-1' }) } as any,
    )
    expect(res.status).toBe(404)
  })
})
