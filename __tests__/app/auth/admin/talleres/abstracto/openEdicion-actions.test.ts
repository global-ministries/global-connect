/**
 * @jest-environment node
 *
 * PR23.2a — Tests for the openEdicion server action.
 *
 * Covers:
 *   - kill switch, auth, capability gate
 *   - input validation
 *   - happy path: director.write and admin.manage both pass
 *   - RPC error
 *   - the taller_id + nombre_edicion are passed to the RPC
 */

import {
  openEdicion,
  type OpenEdicionInput,
} from '@/app/(auth)/admin/talleres/abstracto/[slug]/actions'

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
  data: { edicion_id: 'e-1', periodo_id: 'p-1' },
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

const validInput: OpenEdicionInput = {
  taller_id: 't-1',
  tipo: 'pareja',
  nombre_edicion: 'Otoño 2026',
  link_type: 'matrimonio',
  sesiones_estimadas: 8,
  duracion_estimada_minutos: 90,
  modalidad_inscripcion: 'periodo_general',
  fecha_inicio_periodo: '2026-09-01T00:00:00.000Z',
  fecha_fin_periodo: '2026-12-15T00:00:00.000Z',
  firmantes: [],
  temporada_id: null,
}

beforeEach(() => {
  rpcCalls.length = 0
})

describe('openEdicion — kill switch', () => {
  it('returns not-found when isTalleresEnabled is false', async () => {
    setupSupabaseMock({ isEnabled: false })
    const result = await openEdicion(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })
})

describe('openEdicion — auth', () => {
  it('returns unauthorized when no user is signed in', async () => {
    setupSupabaseMock({ user: null })
    const result = await openEdicion(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })
})

describe('openEdicion — capability gate', () => {
  it('returns forbidden when neither director.write nor admin.manage is held', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const result = await openEdicion(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })

  it('returns ok for director.write', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
    const result = await openEdicion(validInput)
    expect(result.ok).toBe(true)
  })
})

describe('openEdicion — input validation', () => {
  beforeEach(() => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
  })

  it('rejects empty taller_id', async () => {
    const result = await openEdicion({ ...validInput, taller_id: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects empty nombre_edicion', async () => {
    const result = await openEdicion({ ...validInput, nombre_edicion: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects sesiones <= 0', async () => {
    const result = await openEdicion({ ...validInput, sesiones_estimadas: 0 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects duracion <= 0', async () => {
    const result = await openEdicion({ ...validInput, duracion_estimada_minutos: 0 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects missing fecha_inicio_periodo', async () => {
    const result = await openEdicion({ ...validInput, fecha_inicio_periodo: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })
})

describe('openEdicion — happy path', () => {
  it('normalizes link_type to null when tipo=individual (defense-in-depth)', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
    const result = await openEdicion({
      ...validInput,
      tipo: 'individual',
      link_type: 'matrimonio', // would be invalid; action normalizes to null
    })
    expect(result.ok).toBe(true)
    expect(rpcCalls[0]?.args['p_tipo']).toBe('individual')
    expect(rpcCalls[0]?.args['p_link_type']).toBeNull()
  })

  it('invokes the RPC with all expected parameters and returns the ids', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
    const result = await openEdicion(validInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.edicionId).toBe('e-1')
      expect(result.periodoId).toBe('p-1')
    }
    expect(rpcCalls.length).toBe(1)
    expect(rpcCalls[0]?.fn).toBe('open_edicion')
    expect(rpcCalls[0]?.args['p_taller_id']).toBe('t-1')
    expect(rpcCalls[0]?.args['p_tipo']).toBe('pareja')
    expect(rpcCalls[0]?.args['p_nombre_edicion']).toBe('Otoño 2026')
    expect(rpcCalls[0]?.args['p_modalidad_inscripcion']).toBe('periodo_general')
  })

  it('forwards temporada_id to the RPC as p_temporada_id and echoes it back (PR46)', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
      rpcResponse: {
        data: { edicion_id: 'e-2', periodo_id: null, temporada_id: 'temp-1' },
        error: null,
      },
    })
    const result = await openEdicion({ ...validInput, temporada_id: 'temp-1' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.temporadaId).toBe('temp-1')
    expect(rpcCalls[0]?.args['p_temporada_id']).toBe('temp-1')
  })

  it('always sends p_temporada_id (null when no season) so the 11-arg overload resolves (PR46)', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
    const result = await openEdicion({ ...validInput, temporada_id: null })
    expect(result.ok).toBe(true)
    expect(rpcCalls[0]?.args).toHaveProperty('p_temporada_id')
    expect(rpcCalls[0]?.args['p_temporada_id']).toBeNull()
  })
})

describe('openEdicion — RPC error', () => {
  it('returns internal with message when the RPC errors', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
      rpcResponse: { data: null, error: { message: 'TALLER_NOT_FOUND_OR_INACTIVE' } },
    })
    const result = await openEdicion(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('internal')
      expect(result.message).toBe('TALLER_NOT_FOUND_OR_INACTIVE')
    }
  })
})
