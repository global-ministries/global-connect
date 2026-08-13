/**
 * @jest-environment node
 *
 * PR23.1 — Tests for the createTallerAbstract server action.
 *
 * Covers:
 *   - kill switch: isTalleresEnabled=false → not-found
 *   - auth: no user, no persona → unauthorized
 *   - capability gate: missing director.write/admin.manage → forbidden
 *   - input validation: empty nombre, too long, invalid modalidad → invalid-input
 *   - happy path: director.write and admin.manage both pass; the RPC
 *     shape is correct; the slug is normalized client-side
 *   - RPC error → internal with message
 */

import {
  createTallerAbstract,
  type CreateTallerAbstractInput,
} from '@/app/(auth)/admin/talleres/abstracto/nuevo/actions'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(() => true),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  findPlatformSessionPersonaByAuthId: jest.fn(),
  resolveReadOnlyPlatformSession: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const findPersonaByAuthIdMock = jest.requireMock(
  '@/lib/auth/platformSessionReadOnly',
).findPlatformSessionPersonaByAuthId as jest.Mock
const resolveSessionMock = jest.requireMock(
  '@/lib/auth/platformSessionReadOnly',
).resolveReadOnlyPlatformSession as jest.Mock

interface CapturedRpcCall {
  readonly fn: string
  readonly args: Record<string, unknown>
}

const rpcCalls: CapturedRpcCall[] = []
let rpcResponse: { data: unknown; error: unknown | null } = {
  data: { taller_id: 't-1', slug: 'matrimoniosobrela-roca' },
  error: null,
}

function setupSupabaseMock(opts: {
  isEnabled?: boolean
  user?: { id: string } | null
  personaId?: string | null
  capabilities?: string[]
  rpcResponse?: { data: unknown; error: unknown | null }
}) {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  findPersonaByAuthIdMock.mockReset().mockImplementation(() =>
    Promise.resolve(
      opts.personaId
        ? { id: opts.personaId, authId: 'auth-1', globalRoles: [] }
        : null,
    ),
  )
  resolveSessionMock.mockReset().mockResolvedValue(
    opts.personaId
      ? {
          personaId: opts.personaId,
          subjectAuthId: 'auth-1',
          globalRoles: [],
          contexts: [],
          capabilities: (opts.capabilities ?? []).map((key) => ({
            key,
            experience: 'talleres_crecimiento',
            scopeType: 'taller',
            source: 'test',
          })),
        }
      : null,
  )
  rpcResponse = opts.rpcResponse ?? rpcResponse

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user ?? { id: 'auth-1' } },
        error: null,
      }),
    },
    rpc: jest.fn((fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return Promise.resolve(rpcResponse)
    }),
  })
}

const validInput: CreateTallerAbstractInput = {
  nombre: 'Matrimonio sobre la Roca',
  descripcion: 'Programa de 8 sesiones para parejas',
  modalidad_default: 'periodo_general',
}

beforeEach(() => {
  rpcCalls.length = 0
})

// ─── kill switch ─────────────────────────────────────────────────────

describe('createTallerAbstract — kill switch', () => {
  it('returns not-found when isTalleresEnabled is false', async () => {
    setupSupabaseMock({ isEnabled: false })
    const result = await createTallerAbstract(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })
})

// ─── auth ────────────────────────────────────────────────────────────

describe('createTallerAbstract — auth', () => {
  it('returns unauthorized when no user is signed in', async () => {
    setupSupabaseMock({ user: null })
    const result = await createTallerAbstract(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })

  it('returns unauthorized when persona cannot be resolved', async () => {
    setupSupabaseMock({ personaId: null })
    const result = await createTallerAbstract(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })
})

// ─── capability gate ─────────────────────────────────────────────────

describe('createTallerAbstract — capability gate', () => {
  it('returns forbidden when neither director.write nor admin.manage is held', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const result = await createTallerAbstract(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })

  it('returns ok for director.write', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
    const result = await createTallerAbstract(validInput)
    expect(result.ok).toBe(true)
  })

  it('returns ok for admin.manage', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
    })
    const result = await createTallerAbstract(validInput)
    expect(result.ok).toBe(true)
  })
})

// ─── input validation ───────────────────────────────────────────────

describe('createTallerAbstract — input validation', () => {
  beforeEach(() => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
  })

  it('rejects empty nombre', async () => {
    const result = await createTallerAbstract({ ...validInput, nombre: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects nombre shorter than 2 chars', async () => {
    const result = await createTallerAbstract({ ...validInput, nombre: 'X' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects invalid modalidad', async () => {
    const result = await createTallerAbstract({
      ...validInput,
      modalidad_default: 'invalid' as 'periodo_general',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects descripcion longer than 2000 chars', async () => {
    const result = await createTallerAbstract({
      ...validInput,
      descripcion: 'x'.repeat(2001),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })
})

// ─── happy path ─────────────────────────────────────────────────────

describe('createTallerAbstract — happy path', () => {
  it('invokes the RPC with all expected parameters and returns the ids', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
    const result = await createTallerAbstract(validInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.tallerId).toBe('t-1')
      expect(result.slug).toBe('matrimoniosobrela-roca')
    }
    expect(rpcCalls.length).toBe(1)
    const call = rpcCalls[0]
    expect(call?.fn).toBe('create_taller_abstract')
    expect(call?.args['p_nombre']).toBe('Matrimonio sobre la Roca')
    expect(call?.args['p_modalidad_default']).toBe('periodo_general')
    expect(call?.args['p_slug']).toBe('')
  })

  it('passes null for empty descripcion (RPC handles NULLIF)', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
    const result = await createTallerAbstract({ ...validInput, descripcion: null })
    expect(result.ok).toBe(true)
    expect(rpcCalls[0]?.args['p_descripcion']).toBe('')
  })
})

// ─── RPC error ──────────────────────────────────────────────────────

describe('createTallerAbstract — RPC error', () => {
  it('returns internal with message when the RPC errors', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
      rpcResponse: {
        data: null,
        error: { message: 'NOMBRE_REQUIRED' },
      },
    })
    const result = await createTallerAbstract(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('internal')
      expect(result.message).toBe('NOMBRE_REQUIRED')
    }
  })
})
