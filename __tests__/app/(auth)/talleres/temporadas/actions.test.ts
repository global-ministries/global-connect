/**
 * @jest-environment node
 *
 * T3 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — RED->GREEN
 * for the RPC-routed rewrite of these server actions. Ported from the old
 * flat-capability/raw-insert version (T8, odd/tasks/talleres-consolidar-
 * pantallas.md): createTemporada and toggleTallerInTemporada now call the
 * scoped SECURITY DEFINER RPCs (talleres_crear_temporada,
 * talleres_agregar_taller_a_temporada, talleres_quitar_taller_de_temporada
 * — supabase/migrations/20260928120000_talleres_temporadas_por_direccion.sql)
 * instead of writing the tables directly; transitionTemporada is
 * unchanged (a plain guarded UPDATE, now under the new scoped RLS).
 *
 * Covers the three co-located actions:
 *   - createTemporada          (rpc: talleres_crear_temporada)
 *   - toggleTallerInTemporada  (rpc: talleres_agregar_taller_a_temporada /
 *                                    talleres_quitar_taller_de_temporada)
 *   - transitionTemporada      (guarded update on talleres_temporadas.estado)
 *
 * For each: kill switch → not-found, no user → unauthorized, RPC 42501 →
 * forbidden, happy path → ok. Plus action-specific validation (equipoId
 * required / nombre length / fecha ordering), the EDICION_YA_EXISTE
 * idempotent-toggle case, and the guarded-transition state machine.
 *
 * The Supabase client is a capturing stub (no live DB): `rpc` calls are
 * recorded so assertions can inspect the RPC name + args; `from(...)
 * .update(...)` is a small fluent stub for transitionTemporada only.
 */

import {
  createTemporada,
  agregarTallerATemporada,
  quitarTallerDeTemporada,
  transitionTemporada,
} from '@/app/(auth)/talleres/temporadas/actions'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(() => true),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock

// ─── Capturing stub ─────────────────────────────────────────────────────

interface RpcCall {
  name: string
  args: unknown
}

const rpcCalls: RpcCall[] = []
let rpcResponse: { data: unknown; error: unknown } = { data: null, error: null }
let updateResponse: { data: unknown; error: unknown } = { data: null, error: null }
const updateFilters: Record<string, unknown> = {}

function setupMock(opts: {
  isEnabled?: boolean
  user?: { id: string } | null
  rpc?: { data: unknown; error: unknown }
  update?: { data: unknown; error: unknown }
}) {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  rpcResponse = opts.rpc ?? { data: null, error: null }
  updateResponse = opts.update ?? { data: null, error: null }

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
    rpc: (name: string, args: unknown) => {
      rpcCalls.push({ name, args })
      return Promise.resolve(rpcResponse)
    },
    from: (table: string) => ({
      update: (payload: unknown) => ({
        eq: (col: string, val: unknown) => {
          updateFilters[col] = val
          return {
            in: (col2: string, vals: unknown) => {
              updateFilters[`${col2}__in`] = vals
              return {
                select: () => ({
                  maybeSingle: () => Promise.resolve(updateResponse),
                }),
              }
            },
          }
        },
        __table: table,
        __payload: payload,
      }),
    }),
  })
}

const validCreate = {
  equipoId: 'equipo-1',
  nombre: 'Temporada Otoño 2026',
  fecha_apertura: '2026-09-01T00:00:00.000Z',
  fecha_cierre: '2026-12-15T00:00:00.000Z',
}

beforeEach(() => {
  rpcCalls.length = 0
  for (const k of Object.keys(updateFilters)) delete updateFilters[k]
})

// ─── createTemporada ────────────────────────────────────────────────────────

describe('createTemporada — gates', () => {
  it('returns not-found when the feature flag is off', async () => {
    setupMock({ isEnabled: false })
    const result = await createTemporada(validCreate)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  it('returns unauthorized when no user is signed in', async () => {
    setupMock({ user: null })
    const result = await createTemporada(validCreate)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })
})

describe('createTemporada — validation', () => {
  beforeEach(() => {
    setupMock({ rpc: { data: { temporada_id: 'temp-99' }, error: null } })
  })

  it('rejects a missing equipoId (node picker is T5)', async () => {
    const { equipoId: _equipoId, ...rest } = validCreate
    const result = await createTemporada(rest)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
    expect(rpcCalls).toHaveLength(0)
  })

  it('rejects a too-short nombre', async () => {
    const result = await createTemporada({ ...validCreate, nombre: 'x' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects fecha_cierre before fecha_apertura', async () => {
    const result = await createTemporada({
      ...validCreate,
      fecha_apertura: '2026-12-15T00:00:00.000Z',
      fecha_cierre: '2026-09-01T00:00:00.000Z',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })
})

describe('createTemporada — RPC outcomes', () => {
  it('calls talleres_crear_temporada with the right args and returns the new id', async () => {
    setupMock({ rpc: { data: { temporada_id: 'temp-99' }, error: null } })
    const result = await createTemporada({ ...validCreate, tallerIds: ['t-1', 't-2'] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.temporadaId).toBe('temp-99')
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe('talleres_crear_temporada')
    expect(rpcCalls[0].args).toMatchObject({
      p_equipo_id: 'equipo-1',
      p_nombre: 'Temporada Otoño 2026',
      p_taller_ids: ['t-1', 't-2'],
    })
  })

  it('defaults p_taller_ids to [] when tallerIds is omitted', async () => {
    setupMock({ rpc: { data: { temporada_id: 'temp-99' }, error: null } })
    await createTemporada(validCreate)
    expect(rpcCalls[0].args).toMatchObject({ p_taller_ids: [] })
  })

  it('maps a 42501 RPC error to forbidden', async () => {
    setupMock({ rpc: { data: null, error: { code: '42501', message: 'sin_permisos_para_esta_direccion' } } })
    const result = await createTemporada(validCreate)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })

  it('maps a P0001 domain error to invalid-input with a neutral Spanish message (not the raw RAISE text)', async () => {
    setupMock({ rpc: { data: null, error: { code: 'P0001', message: 'TALLER_NO_ES_POR_TEMPORADA' } } })
    const result = await createTemporada(validCreate)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('invalid-input')
      expect(result.message).toBe('Ese taller no abre por temporada.')
    }
  })

  it('returns internal when the RPC succeeds without a temporada_id', async () => {
    setupMock({ rpc: { data: {}, error: null } })
    const result = await createTemporada(validCreate)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('internal')
  })

  it('returns edicionesCreadas from the RPC ediciones array length', async () => {
    setupMock({
      rpc: {
        data: { temporada_id: 'temp-99', ediciones: [{ edicion_id: 'e-1' }, { edicion_id: 'e-2' }] },
        error: null,
      },
    })
    const result = await createTemporada({ ...validCreate, tallerIds: ['t-1', 't-2'] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.edicionesCreadas).toBe(2)
  })

  it('defaults edicionesCreadas to 0 when the RPC omits ediciones', async () => {
    setupMock({ rpc: { data: { temporada_id: 'temp-99' }, error: null } })
    const result = await createTemporada(validCreate)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.edicionesCreadas).toBe(0)
  })
})

// ─── agregarTallerATemporada ────────────────────────────────────────────────

describe('agregarTallerATemporada', () => {
  it('returns invalid-input when either id is missing', async () => {
    setupMock({ rpc: { data: {}, error: null } })
    const result = await agregarTallerATemporada({ temporadaId: '', tallerId: 't-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
    expect(rpcCalls).toHaveLength(0)
  })

  it('calls talleres_agregar_taller_a_temporada with both ids', async () => {
    setupMock({ rpc: { data: { edicion_id: 'ed-1' }, error: null } })
    const result = await agregarTallerATemporada({ temporadaId: 'temp-1', tallerId: 't-1' })
    expect(result.ok).toBe(true)
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe('talleres_agregar_taller_a_temporada')
    expect(rpcCalls[0].args).toEqual({ p_temporada_id: 'temp-1', p_taller_id: 't-1' })
  })

  it('tolerates EDICION_YA_EXISTE as idempotent success', async () => {
    setupMock({ rpc: { data: null, error: { code: 'P0001', message: 'EDICION_YA_EXISTE' } } })
    const result = await agregarTallerATemporada({ temporadaId: 'temp-1', tallerId: 't-1' })
    expect(result.ok).toBe(true)
  })

  it('surfaces a different P0001 as invalid-input with a neutral Spanish message', async () => {
    setupMock({ rpc: { data: null, error: { code: 'P0001', message: 'TALLER_FUERA_DE_LA_DIRECCION' } } })
    const result = await agregarTallerATemporada({ temporadaId: 'temp-1', tallerId: 't-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('invalid-input')
      expect(result.message).toBe('Ese taller no pertenece a esta dirección.')
    }
  })

  it('maps a 42501 RPC error to forbidden', async () => {
    setupMock({ rpc: { data: null, error: { code: '42501', message: 'sin_permisos_para_esta_temporada' } } })
    const result = await agregarTallerATemporada({ temporadaId: 'temp-1', tallerId: 't-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })
})

// ─── quitarTallerDeTemporada ────────────────────────────────────────────────

describe('quitarTallerDeTemporada', () => {
  it('returns invalid-input when either id is missing', async () => {
    setupMock({ rpc: { data: {}, error: null } })
    const result = await quitarTallerDeTemporada({ temporadaId: 'temp-1', tallerId: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
    expect(rpcCalls).toHaveLength(0)
  })

  it('calls talleres_quitar_taller_de_temporada with both ids', async () => {
    setupMock({ rpc: { data: { edicion_id: 'ed-1', cancelada: true }, error: null } })
    const result = await quitarTallerDeTemporada({ temporadaId: 'temp-1', tallerId: 't-1' })
    expect(result.ok).toBe(true)
    expect(rpcCalls[0].name).toBe('talleres_quitar_taller_de_temporada')
    expect(rpcCalls[0].args).toEqual({ p_temporada_id: 'temp-1', p_taller_id: 't-1' })
  })

  it('surfaces EDICION_CON_INSCRITOS as invalid-input with its exact confirm-dialog message (not tolerated)', async () => {
    setupMock({ rpc: { data: null, error: { code: 'P0001', message: 'EDICION_CON_INSCRITOS' } } })
    const result = await quitarTallerDeTemporada({ temporadaId: 'temp-1', tallerId: 't-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('invalid-input')
      expect(result.message).toBe(
        'No se puede quitar: la edición ya tiene inscritos. Cancela la edición desde su pantalla.',
      )
    }
  })

  it('maps a 42501 RPC error to forbidden', async () => {
    setupMock({ rpc: { data: null, error: { code: '42501', message: 'sin_permisos_para_esta_temporada' } } })
    const result = await quitarTallerDeTemporada({ temporadaId: 'temp-1', tallerId: 't-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })
})

// ─── transitionTemporada ─────────────────────────────────────────────────────

describe('transitionTemporada', () => {
  it('abierto: guarded update filters estado IN [borrador], returns ok on a matched row', async () => {
    setupMock({ update: { data: { id: 'temp-1' }, error: null } })
    const result = await transitionTemporada({ temporadaId: 'temp-1', next: 'abierto' })
    expect(result.ok).toBe(true)
    expect(updateFilters['id']).toBe('temp-1')
    expect(updateFilters['estado__in']).toEqual(['borrador'])
  })

  it('returns invalid-input when the guarded update matches no row (bad state or no scoped authority)', async () => {
    setupMock({ update: { data: null, error: null } })
    const result = await transitionTemporada({ temporadaId: 'temp-1', next: 'cerrado' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('cancelado allows both borrador and abierto as source states', async () => {
    setupMock({ update: { data: { id: 'temp-1' }, error: null } })
    const result = await transitionTemporada({ temporadaId: 'temp-1', next: 'cancelado' })
    expect(result.ok).toBe(true)
    expect(updateFilters['estado__in']).toEqual(['borrador', 'abierto'])
  })

  it('rejects an unknown target estado', async () => {
    setupMock({ update: { data: { id: 'temp-1' }, error: null } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately invalid input
    const result = await transitionTemporada({ temporadaId: 'temp-1', next: 'borrador' as any })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })
})
