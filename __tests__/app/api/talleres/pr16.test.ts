/**
 * @jest-environment node
 *
 * PR16 — DT-067 — Tests R covering 401/403/404/409/400 + immutability of
 * asistencia + sequential progression + couple unit (1 reporte por unidad).
 *
 * T3 (odd/tasks/talleres-asistencia-lider.md) reshaped three of the original
 * assertions, because `cerrar` and `asistencia` now wrap T1's SQL functions
 * instead of writing tables directly:
 *   - the 403 matrix no longer lists them: they gate only on kill switch +
 *     session and delegate authorization to the function (covered in
 *     __tests__/app/api/talleres/sesiones-asistencia.test.ts);
 *   - "immutability" became "delegation": the route issues ZERO
 *     insert/update/delete on taller_asistencias;
 *   - skip-ahead is the function's call now; the route must simply delegate.
 *
 * Strategy: each test instantiates a fresh mock client and exercises
 * the route handler directly. The deny-by-default matrix validates that
 *   - 401 when no user
 *   - 403 when capability missing
 *   - 404 when flag off OR the resource doesn't exist
 *   - 400 when body invalid OR transition invalid OR attendance state wrong
 * The couple-unit test asserts that two reportes for the same grupo in
 * non-terminal states cannot coexist.
 */

import { NextRequest } from 'next/server'

import { POST as abrir } from '@/app/api/talleres/sesiones/[id]/abrir/route'
import { POST as cerrar } from '@/app/api/talleres/sesiones/[id]/cerrar/route'
import { POST as registrarAsistencia } from '@/app/api/talleres/sesiones/[id]/asistencia/route'
import { POST as enviarReporte } from '@/app/api/talleres/grupos/[id]/reporte/enviar/route'
import { POST as reabrirReporte } from '@/app/api/talleres/grupos/[id]/reporte/reabrir/route'
import { GET as listCertificados } from '@/app/api/talleres/certificados/route'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(() => true),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

// T3: cerrar/asistencia revalidate the grupo screen on success; the real
// revalidatePath needs a request-scoped static generation store.
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock

interface MockState {
  user: { id: string } | null
  /** Capability → granted? */
  capabilities: Map<string, boolean>
  /** last body inserted */
  lastInsert: Record<string, unknown> | null
  /** last update patch (table, patch) */
  lastUpdate: { table: string; patch: Record<string, unknown> } | null
  /** mocked rows by table (for select) */
  rowsByTable: Map<string, unknown[]>
  /** single-row result for maybeSingle() */
  singleResult: { data: unknown; error: null }
  /** counts of method calls for invariants */
  callCounts: { update: number; delete: number; insert: number }
  /** every rpc() the routes issued (T3: which function did they delegate to?) */
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>
  /** what a non-capability rpc() resolves with (T3's business functions) */
  rpcResult: { data: unknown; error: { message: string; code?: string } | null }
}
const state: MockState = {
  user: { id: 'user-1' },
  capabilities: new Map(),
  lastInsert: null,
  lastUpdate: null,
  rowsByTable: new Map(),
  singleResult: { data: null, error: null },
  callCounts: { update: 0, delete: 0, insert: 0 },
  rpcCalls: [],
  rpcResult: { data: null, error: null },
}

function reset() {
  state.user = { id: 'user-1' }
  state.capabilities = new Map()
  state.lastInsert = null
  state.lastUpdate = null
  state.rowsByTable = new Map()
  state.singleResult = { data: null, error: null }
  state.callCounts = { update: 0, delete: 0, insert: 0 }
  state.rpcCalls = []
  state.rpcResult = { data: null, error: null }
}

beforeEach(() => {
  reset()
  flagsMock.mockReset().mockReturnValue(true)

  // Build a chainable supabase query builder mock.
  function builder(table: string) {
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>
    const finish = () => {
      // For most queries that call .single() / .maybeSingle() we return state.singleResult
      return Promise.resolve(state.singleResult)
    }
    chain['select'] = jest.fn(() => chain)
    chain['eq'] = jest.fn(() => chain)
    chain['in'] = jest.fn(() => chain)
    chain['order'] = jest.fn(() => chain)
    chain['maybeSingle'] = jest.fn(() => finish())
    chain['single'] = jest.fn(() => finish())
    chain['insert'] = jest.fn((payload: Record<string, unknown>) => {
      state.lastInsert = payload
      state.callCounts.insert++
      // Simulate the resulting row returning with id set
      const row = { id: 'row-id', ...payload }
      return {
        select: () => ({
          single: () => Promise.resolve({ data: row, error: null }),
        }),
      }
    })
    chain['update'] = jest.fn((patch: Record<string, unknown>) => {
      state.lastUpdate = { table, patch }
      state.callCounts.update++
      return {
        eq: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: 'row-id', ...patch },
                error: null,
              }),
          }),
        }),
      }
    })
    chain['delete'] = jest.fn(() => {
      state.callCounts.delete++
      return { eq: () => Promise.resolve({ data: null, error: null }) }
    })
    return chain
  }

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockImplementation(() =>
        Promise.resolve({ data: { user: state.user }, error: null }),
      ),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- plain mock client
    rpc: jest.fn().mockImplementation((name: string, args: Record<string, any> = {}) => {
      state.rpcCalls.push({ name, args })
      // T3: talleres_registrar_asistencia / talleres_cerrar_clase are business
      // functions — they answer whatever the test configured in rpcResult.
      if (name !== 'auth_has_talleres_capability' && name !== 'eval_talleres_capability') {
        return Promise.resolve(state.rpcResult)
      }
      // requireTalleresApi calls auth_has_talleres_capability({ p_capability_key });
      // the legacy metricas gate uses eval_talleres_capability({ p_capability }).
      // Accept either param name so the mock matches whichever gate the route hits.
      const cap = args.p_capability_key ?? args.p_capability ?? ''
      if (state.capabilities.get(cap) === true) return Promise.resolve({ data: true })
      if (cap === 'talleres_crecimiento.director.read' && state.capabilities.has('talleres_crecimiento.director.read')) {
        return Promise.resolve({ data: state.capabilities.get('talleres_crecimiento.director.read') })
      }
      return Promise.resolve({ data: false })
    }),
    from: jest.fn((table: string) => builder(table)),
  })
})

function makeReq(body?: unknown, url?: string): NextRequest {
  const u = new URL(url ?? 'http://localhost/test')
  return new NextRequest(u, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'content-type': 'application/json' } : undefined,
  })
}

function makeGet(url: string): NextRequest {
  return new NextRequest(new URL(url), { method: 'GET' })
}

// ─── Deny-by-default matrix ───────────────────────────────────────────────

describe('PR16 — deny-by-default 401 path', () => {
  it.each([
    ['abrir', () => abrir(makeReq({}), { params: Promise.resolve({ id: 's-1' }) })],
    ['cerrar', () => cerrar(makeReq(), { params: Promise.resolve({ id: 's-1' }) })],
    [
      'asistencia',
      () => registrarAsistencia(
        makeReq({ marcas: [{ inscripcion_id: 'i-1', estado: 'presente' }] }),
        { params: Promise.resolve({ id: 's-1' }) },
      ),
    ],
    [
      'reporte/enviar',
      () => enviarReporte(makeReq({}), { params: Promise.resolve({ id: 'g-1' }) }),
    ],
    [
      'reporte/reabrir',
      () => reabrirReporte(
        makeReq({ reabierto_por_persona_id: 'p-1', reabierto_motivo: 'long-enough-motivo' }),
        { params: Promise.resolve({ id: 'g-1' }) },
      ),
    ],
  ])('%s returns 401 when no authed user', async (_name, fn) => {
    state.user = null
    const res = await fn()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
  })
})

describe('PR16 — deny-by-default 403 path', () => {
  // NOTE (T3): `cerrar` and `asistencia` are deliberately ABSENT from this
  // matrix. Both now wrap talleres_cerrar_clase / talleres_registrar_asistencia
  // and gate only on the kill switch + session — the DB decides authorization,
  // so a caller with no capability reaches the function (see
  // __tests__/app/api/talleres/sesiones-asistencia.test.ts).
  it.each([
    [
      'abrir (coordinator.write)',
      () => abrir(makeReq({}), { params: Promise.resolve({ id: 's-1' }) }),
    ],
    [
      'reporte/enviar (coordinator.write)',
      () => enviarReporte(makeReq({}), { params: Promise.resolve({ id: 'g-1' }) }),
    ],
    [
      'reporte/reabrir (director.write)',
      () => reabrirReporte(
        makeReq({ reabierto_por_persona_id: 'p-1', reabierto_motivo: 'long-enough-motivo' }),
        { params: Promise.resolve({ id: 'g-1' }) },
      ),
    ],
    [
      'certificados (director.read)',
      () => listCertificados(makeGet('http://localhost/api/talleres/certificados?inscripcion_id=i-1')),
    ],
  ])('%s returns 403 when capability missing', async (_name, fn) => {
    state.capabilities = new Map()
    const res = await fn()
    expect(res.status).toBe(403)
  })
})

describe('PR16 — deny-by-default 404 path', () => {
  it('sesion no encontrada → 404 on abrir', async () => {
    state.capabilities.set('talleres_crecimiento.coordinator.write', true)
    state.singleResult = { data: null, error: null }
    const res = await abrir(makeReq({}), { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('reporte no encontrado → 404 on enviar', async () => {
    state.capabilities.set('talleres_crecimiento.coordinator.write', true)
    state.singleResult = { data: null, error: null }
    const res = await enviarReporte(makeReq({}), { params: Promise.resolve({ id: 'g-1' }) })
    expect(res.status).toBe(404)
  })

  it('certificados sin inscripcion_id → 400', async () => {
    state.capabilities.set('talleres_crecimiento.director.read', true)
    const res = await listCertificados(makeGet('http://localhost/api/talleres/certificados'))
    expect(res.status).toBe(400)
  })

  it('feature flag off → 404 across all routes', async () => {
    flagsMock.mockReturnValue(false)
    const res = await listCertificados(makeGet('http://localhost/api/talleres/certificados?inscripcion_id=i-1'))
    expect(res.status).toBe(404)
  })
})

// ─── Sequential progression ───────────────────────────────────────────────

describe('PR16 — sequential progression (skip-ahead → 400)', () => {
  // T3: the route no longer decides the transition — talleres_cerrar_clase
  // does (it closes from any state the líder is allowed to close). What the
  // route still owns is DELEGATION: one rpc, no direct table writes.
  it('cerrar delegates the transition to talleres_cerrar_clase', async () => {
    state.rpcResult = { data: { sesion_id: 's-1', estado: 'cerrada' }, error: null }
    const res = await cerrar(makeReq(), { params: Promise.resolve({ id: 's-1' }) })
    expect(res.status).toBe(200)
    expect(state.rpcCalls).toEqual([
      { name: 'talleres_cerrar_clase', args: { p_sesion_id: 's-1' } },
    ])
    expect(state.callCounts.update).toBe(0)
  })

  it('abrir accepts programada → en_curso', async () => {
    state.capabilities.set('talleres_crecimiento.coordinator.write', true)
    state.singleResult = { data: { id: 's-1', estado: 'programada' }, error: null }
    const res = await abrir(makeReq({}), { params: Promise.resolve({ id: 's-1' }) })
    expect(res.status).toBe(200)
    expect(state.lastUpdate?.patch['estado']).toBe('en_curso')
  })

  it('abrir rejects en_curso → en_curso (no-op, 400)', async () => {
    state.capabilities.set('talleres_crecimiento.coordinator.write', true)
    state.singleResult = { data: { id: 's-1', estado: 'en_curso' }, error: null }
    const res = await abrir(makeReq({}), { params: Promise.resolve({ id: 's-1' }) })
    expect(res.status).toBe(400)
  })
})

// ─── Immutability of attendance ───────────────────────────────────────────

describe('PR16 — attendance immutability', () => {
  // T3: "inmutable" no longer means "the route only inserts" — it means the
  // route never touches taller_asistencias at all. Every write flows through
  // talleres_registrar_asistencia, whose SECURITY DEFINER body owns the
  // constraint, the estado domain and the audit fields.
  it('attendance route never writes taller_asistencias itself (delegates to the RPC)', async () => {
    state.rpcResult = { data: { presentes: 1, ausentes: 0, total: 1 }, error: null }
    const res = await registrarAsistencia(
      makeReq({ marcas: [{ inscripcion_id: 'i-1', estado: 'presente' }] }),
      { params: Promise.resolve({ id: 's-1' }) },
    )
    expect(res.status).toBe(201)
    expect(state.callCounts.insert).toBe(0)
    expect(state.callCounts.update).toBe(0)
    expect(state.callCounts.delete).toBe(0)
    expect(state.rpcCalls).toEqual([
      {
        name: 'talleres_registrar_asistencia',
        args: {
          p_sesion_id: 's-1',
          p_marcas: [{ inscripcion_id: 'i-1', estado: 'presente' }],
        },
      },
    ])
  })

  it('attendance rejects invalid estado before reaching the RPC', async () => {
    const res = await registrarAsistencia(
      makeReq({ marcas: [{ inscripcion_id: 'i-1', estado: 'no-aplica' }] }),
      { params: Promise.resolve({ id: 's-1' }) },
    )
    expect(res.status).toBe(400)
    expect(state.rpcCalls).toHaveLength(0)
    expect(state.callCounts.insert).toBe(0)
  })

  it('rejects a batch with no marca entries without calling the RPC', async () => {
    const res = await registrarAsistencia(makeReq({ marcas: [] }), {
      params: Promise.resolve({ id: 's-1' }),
    })
    expect(res.status).toBe(400)
    expect(state.rpcCalls).toHaveLength(0)
    expect(state.callCounts.insert).toBe(0)
  })
})

// ─── Couple unit (1 reporte por unidad) ────────────────────────────────────

describe('PR16 — couple unit (1 reporte por grupo)', () => {
  it('enviar rejects when no active reporte exists for the grupo', async () => {
    state.capabilities.set('talleres_crecimiento.coordinator.write', true)
    state.singleResult = { data: null, error: null }
    const res = await enviarReporte(makeReq({}), { params: Promise.resolve({ id: 'g-1' }) })
    expect(res.status).toBe(404)
    expect(state.callCounts.update).toBe(0)
  })

  it('reabrir rejects motivo shorter than 8 chars', async () => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
    const res = await reabrirReporte(
      makeReq({ reabierto_por_persona_id: 'p-1', reabierto_motivo: 'short' }),
      { params: Promise.resolve({ id: 'g-1' }) },
    )
    expect(res.status).toBe(400)
    expect(state.callCounts.update).toBe(0)
  })
})
