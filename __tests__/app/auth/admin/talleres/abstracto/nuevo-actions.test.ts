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
  equipoId: 'equipo-1',
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

// ─── equipo choice (T3) ─────────────────────────────────────────────

describe('createTallerAbstract — equipo choice', () => {
  beforeEach(() => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
  })

  it('rejects when neither equipoId nor parentEquipoId is given', async () => {
    const result = await createTallerAbstract({
      nombre: 'Punto de Partida',
      descripcion: null,
      modalidad_default: 'periodo_general',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
    expect(rpcCalls.length).toBe(0)
  })

  it('rejects when both equipoId and parentEquipoId are given', async () => {
    const result = await createTallerAbstract({
      nombre: 'Punto de Partida',
      descripcion: null,
      modalidad_default: 'periodo_general',
      equipoId: 'equipo-1',
      parentEquipoId: 'parent-1',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
    expect(rpcCalls.length).toBe(0)
  })

  it('rejects a blank equipoId (whitespace only)', async () => {
    const result = await createTallerAbstract({
      nombre: 'Punto de Partida',
      descripcion: null,
      modalidad_default: 'periodo_general',
      equipoId: '   ',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
    expect(rpcCalls.length).toBe(0)
  })

  it('passes p_equipo_id and a null p_parent_equipo_id for vincular mode', async () => {
    const result = await createTallerAbstract({ ...validInput, equipoId: 'equipo-1', parentEquipoId: undefined })
    expect(result.ok).toBe(true)
    const call = rpcCalls[0]
    expect(call?.args['p_equipo_id']).toBe('equipo-1')
    expect(call?.args['p_parent_equipo_id']).toBeNull()
  })

  it('passes p_parent_equipo_id and a null p_equipo_id for nuevo mode', async () => {
    const result = await createTallerAbstract({
      nombre: 'Nuevo bajo DPS',
      descripcion: null,
      modalidad_default: 'periodo_general',
      parentEquipoId: 'parent-1',
    })
    expect(result.ok).toBe(true)
    const call = rpcCalls[0]
    expect(call?.args['p_equipo_id']).toBeNull()
    expect(call?.args['p_parent_equipo_id']).toBe('parent-1')
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
    expect(call?.args['p_equipo_id']).toBe('equipo-1')
    expect(call?.args['p_parent_equipo_id']).toBeNull()
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

  it('maps EQUIPO_ALREADY_LINKED to a friendly Spanish message', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
      rpcResponse: {
        data: null,
        error: { code: 'P0002', message: 'EQUIPO_ALREADY_LINKED: 11111111-1111-1111-1111-111111111111' },
      },
    })
    const result = await createTallerAbstract(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('internal')
      expect(result.message).toBe('Ese equipo ya está vinculado a otro taller.')
    }
  })

  it('maps MUST_CHOOSE_EXACTLY_ONE_MODE to a friendly Spanish message', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
      rpcResponse: {
        data: null,
        error: { code: 'P0003', message: 'MUST_CHOOSE_EXACTLY_ONE_MODE: se requiere exactamente uno de p_equipo_id o p_parent_equipo_id' },
      },
    })
    const result = await createTallerAbstract(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe('Elegí un nodo del árbol para vincular, o un padre para crear uno nuevo — no ambos ni ninguno.')
    }
  })

  it('falls back to the raw message for an unrecognized error code', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
      rpcResponse: {
        data: null,
        error: { message: 'SOME_UNKNOWN_ERROR: detail' },
      },
    })
    const result = await createTallerAbstract(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toBe('SOME_UNKNOWN_ERROR: detail')
  })
})
