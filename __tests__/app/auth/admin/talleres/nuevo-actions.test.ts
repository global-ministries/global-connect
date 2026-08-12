/**
 * @jest-environment node
 *
 * PR21 — Tests for the createTaller server action.
 *
 * Covers:
 *   - kill switch (isTalleresEnabled=false → not-found)
 *   - unauthenticated → unauthorized
 *   - missing capability (neither director.write nor admin.manage) → forbidden
 *   - validation: missing nombre, sesiones<=0, invalid link_type, etc. → invalid-input
 *   - link_type on individual → invalid-input
 *   - happy path → invokes RPC and returns ids
 *   - RPC error → internal with message
 *
 * The tests do not exercise the SQL function itself (that requires a
 * live DB); they only verify the action's orchestration + validation.
 */

import {
  createTaller,
  type CreateTallerInput,
} from '@/app/(auth)/admin/talleres/nuevo/actions'

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
  data: { taller_id: 't-1', cohorte_id: 'c-1', equipo_id: 'e-1' },
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

const validInput: CreateTallerInput = {
  nombre: 'Matrimonio 101',
  edicion: 'otoño-2026',
  tipo: 'pareja',
  link_type: 'matrimonio',
  sesiones_estimadas: 8,
  duracion_estimada_minutos: 90,
  fecha_inicio_periodo: '2026-03-15T00:00:00.000Z',
  fecha_fin_periodo: '2026-06-15T00:00:00.000Z',
  firmantes: [{ nombre: 'Juan Pérez', rol: 'Director Pastoral' }],
  cohorte_edicion_label: 'otoño-2026',
  cohorte_started_at: '2026-03-15T00:00:00.000Z',
  cohorte_ended_at: '2026-06-15T00:00:00.000Z',
  equipo_id: 'eq-existing-1',
  equipo_label: null,
}

beforeEach(() => {
  rpcCalls.length = 0
})

// ─── kill switch ─────────────────────────────────────────────────────

describe('createTaller — kill switch', () => {
  it('returns not-found when isTalleresEnabled is false', async () => {
    setupSupabaseMock({ isEnabled: false })
    const result = await createTaller(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })
})

// ─── auth ────────────────────────────────────────────────────────────

describe('createTaller — auth', () => {
  it('returns unauthorized when no user is signed in', async () => {
    setupSupabaseMock({ user: null })
    const result = await createTaller(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })

  it('returns unauthorized when persona cannot be resolved', async () => {
    setupSupabaseMock({ personaId: null })
    const result = await createTaller(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })
})

// ─── capability gate ─────────────────────────────────────────────────

describe('createTaller — capability gate', () => {
  it('returns forbidden when neither director.write nor admin.manage is held', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.read'],
    })
    const result = await createTaller(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })

  it('returns ok for director.write', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
    const result = await createTaller(validInput)
    expect(result.ok).toBe(true)
  })

  it('returns ok for admin.manage', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
    })
    const result = await createTaller(validInput)
    expect(result.ok).toBe(true)
  })
})

// ─── input validation ───────────────────────────────────────────────

describe('createTaller — input validation', () => {
  beforeEach(() => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
  })

  it('rejects empty nombre', async () => {
    const result = await createTaller({ ...validInput, nombre: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects empty edicion', async () => {
    const result = await createTaller({ ...validInput, edicion: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects invalid tipo', async () => {
    const result = await createTaller({
      ...validInput,
      tipo: 'invalid' as 'individual',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects link_type on individual taller', async () => {
    const result = await createTaller({
      ...validInput,
      tipo: 'individual',
      link_type: 'matrimonio',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('invalid-input')
      expect(result.message).toMatch(/individual/i)
    }
  })

  it('rejects sesiones <= 0', async () => {
    const result = await createTaller({ ...validInput, sesiones_estimadas: 0 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects duracion <= 0', async () => {
    const result = await createTaller({ ...validInput, duracion_estimada_minutos: 0 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects missing cohorte_label', async () => {
    const result = await createTaller({ ...validInput, cohorte_edicion_label: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects when neither equipo_id nor equipo_label is provided', async () => {
    const result = await createTaller({
      ...validInput,
      equipo_id: null,
      equipo_label: null,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })
})

// ─── happy path ─────────────────────────────────────────────────────

describe('createTaller — happy path', () => {
  it('invokes the RPC with all expected parameters and returns the ids', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
    const result = await createTaller(validInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.tallerId).toBe('t-1')
      expect(result.cohorteId).toBe('c-1')
      expect(result.equipoId).toBe('e-1')
    }
    expect(rpcCalls.length).toBe(1)
    const call = rpcCalls[0]
    expect(call?.fn).toBe('create_taller_with_initial_state')
    expect(call?.args['p_nombre']).toBe('Matrimonio 101')
    expect(call?.args['p_tipo']).toBe('pareja')
    expect(call?.args['p_modalidad_inscripcion']).toBe('periodo_general')
    expect(call?.args['p_equipo_id']).toBe('eq-existing-1')
    expect(call?.args['p_equipo_label']).toBe(null)
  })

  it('serializes firmantes as a JSONB array of {nombre, rol}', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
    await createTaller(validInput)
    const firmantes = JSON.parse(rpcCalls[0]?.args['p_firmantes'] as string) as unknown[]
    expect(Array.isArray(firmantes)).toBe(true)
    expect(firmantes).toEqual([
      { nombre: 'Juan Pérez', rol: 'Director Pastoral' },
    ])
  })

  it('passes equipo_label when creating a new equipo (id is null)', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
    const result = await createTaller({
      ...validInput,
      equipo_id: null,
      equipo_label: 'Equipo Matrimonio 101',
    })
    expect(result.ok).toBe(true)
    expect(rpcCalls[0]?.args['p_equipo_id']).toBe(null)
    expect(rpcCalls[0]?.args['p_equipo_label']).toBe('Equipo Matrimonio 101')
  })

  it('strips empty firmantes from the JSONB array', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
    await createTaller({
      ...validInput,
      firmantes: [
        { nombre: 'Juan', rol: 'Director' },
        { nombre: '   ', rol: '' },
        { nombre: 'Maria', rol: '   ' },
        { nombre: 'Pedro', rol: 'Líder' },
      ],
    })
    const firmantes = JSON.parse(rpcCalls[0]?.args['p_firmantes'] as string) as unknown[]
    expect(firmantes).toEqual([
      { nombre: 'Juan', rol: 'Director' },
      { nombre: 'Pedro', rol: 'Líder' },
    ])
  })
})

// ─── RPC error ──────────────────────────────────────────────────────

describe('createTaller — RPC error', () => {
  it('returns internal with message when the RPC errors', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
      rpcResponse: {
        data: null,
        error: { message: 'INVALID_TIPO: foo' },
      },
    })
    const result = await createTaller(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('internal')
      expect(result.message).toBe('INVALID_TIPO: foo')
    }
  })

  it('returns internal when the RPC returns null data', async () => {
    setupSupabaseMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
      rpcResponse: { data: null, error: null },
    })
    const result = await createTaller(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('internal')
  })
})
