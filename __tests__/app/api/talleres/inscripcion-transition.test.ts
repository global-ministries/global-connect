/**
 * @jest-environment node
 *
 * PR48 (restructure PR E) — POST /api/talleres/inscripciones/[id]/transition.
 *
 * The completion transition was BROKEN: it wrote estado='completado' (rejected
 * by the estado CHECK, which only allows pendiente|aprobado|no_aprobado) and a
 * ghost `fecha_completitud` column that does not exist on taller_inscripciones.
 *
 * This suite pins the fix:
 *   - completado sets unit_estado='completado' (NOT estado) and NO fecha_completitud;
 *   - the estado approval transitions (aprobado/no_aprobado/pendiente) still write estado;
 *   - on completion the route emits the certificate via emit_taller_certificado;
 *   - certificate emission is best-effort — an RPC failure never fails the transition.
 */

import { NextRequest } from 'next/server'

import { POST as transition } from '@/app/api/talleres/inscripciones/[id]/transition/route'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(() => true),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock

interface RpcCall {
  readonly name: string
  readonly args: Record<string, unknown>
}

interface MockState {
  user: { id: string } | null
  capabilities: Map<string, boolean>
  /** pre-read row returned by .select().eq().maybeSingle() */
  currentRow: Record<string, unknown> | null
  /** last update patch on taller_inscripciones */
  lastUpdate: Record<string, unknown> | null
  /** columns requested in the write-back .select(...) */
  lastUpdateSelect: string | null
  /** recorded rpc invocations (capability + emit) */
  rpcCalls: RpcCall[]
  /** result the emit_taller_certificado rpc resolves to */
  emitResult: { data: unknown; error: { message: string } | null }
}

const state: MockState = {
  user: { id: 'user-1' },
  capabilities: new Map(),
  currentRow: null,
  lastUpdate: null,
  lastUpdateSelect: null,
  rpcCalls: [],
  emitResult: { data: { ok: true, created: true, certificado_id: 'cert-1' }, error: null },
}

function reset(): void {
  state.user = { id: 'user-1' }
  state.capabilities = new Map()
  state.currentRow = null
  state.lastUpdate = null
  state.lastUpdateSelect = null
  state.rpcCalls = []
  state.emitResult = { data: { ok: true, created: true, certificado_id: 'cert-1' }, error: null }
}

beforeEach(() => {
  reset()
  flagsMock.mockReset().mockReturnValue(true)

  function builder(_table: string): Record<string, jest.Mock> {
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>
    chain['select'] = jest.fn((cols?: string) => {
      // Only the write-back select carries an explicit column list we assert on.
      if (typeof cols === 'string' && cols.includes('estado')) state.lastUpdateSelect = cols
      return chain
    })
    chain['eq'] = jest.fn(() => chain)
    chain['maybeSingle'] = jest.fn(() =>
      Promise.resolve({ data: state.currentRow, error: null }),
    )
    chain['single'] = jest.fn(() =>
      Promise.resolve({ data: { id: 'row-id', ...(state.lastUpdate ?? {}) }, error: null }),
    )
    chain['update'] = jest.fn((patch: Record<string, unknown>) => {
      state.lastUpdate = patch
      return chain
    })
    return chain
  }

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: state.user }, error: null })),
    },
    rpc: jest.fn((name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args })
      if (name === 'emit_taller_certificado') return Promise.resolve(state.emitResult)
      // capability gate: auth_has_talleres_capability({ p_capability_key })
      const cap = (args?.['p_capability_key'] ?? args?.['p_capability']) as string
      return Promise.resolve({ data: state.capabilities.get(cap) === true })
    }),
    from: jest.fn((table: string) => builder(table)),
  })
})

function makeReq(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/test'), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe('PR48 — transition to completado writes unit_estado, not estado', () => {
  beforeEach(() => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
  })

  it('sets unit_estado=completado and never estado, never fecha_completitud', async () => {
    state.currentRow = { estado: 'aprobado' }
    const res = await transition(makeReq({ target: 'completado' }), params('insc-1'))
    expect(res.status).toBe(200)
    expect(state.lastUpdate?.['unit_estado']).toBe('completado')
    expect(state.lastUpdate).not.toHaveProperty('estado')
    expect(state.lastUpdate).not.toHaveProperty('fecha_completitud')
  })

  it('includes unit_estado in the write-back select', async () => {
    state.currentRow = { estado: 'aprobado' }
    await transition(makeReq({ target: 'completado' }), params('insc-1'))
    expect(state.lastUpdateSelect).toMatch(/unit_estado/)
  })

  it('emits the certificate via emit_taller_certificado after completion', async () => {
    state.currentRow = { estado: 'aprobado' }
    await transition(makeReq({ target: 'completado' }), params('insc-1'))
    const emit = state.rpcCalls.find((c) => c.name === 'emit_taller_certificado')
    expect(emit).toBeDefined()
    expect(emit?.args['p_inscripcion_id']).toBe('insc-1')
    expect(emit?.args['p_codigo_verificacion']).toMatch(
      /^[abcdefghijkmnpqrstuvwxyz23456789]{16}$/,
    )
  })

  it('is best-effort — a failing certificate RPC still returns 200', async () => {
    state.currentRow = { estado: 'aprobado' }
    state.emitResult = { data: null, error: { message: 'boom' } }
    const res = await transition(makeReq({ target: 'completado' }), params('insc-1'))
    expect(res.status).toBe(200)
  })

  it('rejects completado from a non-aprobado state (FSM guard) and emits no certificate', async () => {
    state.currentRow = { estado: 'pendiente' }
    const res = await transition(makeReq({ target: 'completado' }), params('insc-1'))
    expect(res.status).toBe(400)
    expect(state.rpcCalls.some((c) => c.name === 'emit_taller_certificado')).toBe(false)
  })
})

describe('PR48 — approval transitions still write estado (unchanged)', () => {
  beforeEach(() => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
  })

  it('pendiente -> aprobado writes estado=aprobado and emits no certificate', async () => {
    state.currentRow = { estado: 'pendiente' }
    const res = await transition(makeReq({ target: 'aprobado' }), params('insc-1'))
    expect(res.status).toBe(200)
    expect(state.lastUpdate?.['estado']).toBe('aprobado')
    expect(state.lastUpdate).not.toHaveProperty('unit_estado')
    expect(state.rpcCalls.some((c) => c.name === 'emit_taller_certificado')).toBe(false)
  })

  it('pendiente -> no_aprobado requires a motivo', async () => {
    state.currentRow = { estado: 'pendiente' }
    const res = await transition(makeReq({ target: 'no_aprobado' }), params('insc-1'))
    expect(res.status).toBe(400)
  })
})
