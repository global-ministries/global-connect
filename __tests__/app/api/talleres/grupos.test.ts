/**
 * @jest-environment node
 *
 * PR F (restructure §7) — /api/talleres/grupos.
 *
 * POST creates a grupo inside a cohorte and, under the "1 semana = 1 sesión"
 * model, immediately materialises its weekly sessions by calling the PR47
 * SECURITY DEFINER RPC generate_taller_sesiones(p_grupo_id). Session
 * generation is BEST-EFFORT: an RPC failure never fails the grupo create
 * (the RPC is idempotent, so it can be retried). The 201 response carries
 * both the created grupo and the generation outcome: { grupo, sesiones }.
 *
 * GET lists grupos for a cohorte (unchanged): { grupos, count }.
 *
 * Deny-by-default matrix mirrors pr16.test.ts:
 *   - 401 when no authed user
 *   - 403 when capability missing (director.write on POST, director.read on GET)
 *   - 400 when body invalid / fields missing / capacidad <= 0 / cohorte_id missing
 */

import { NextRequest } from 'next/server'

import { POST as crearGrupo, GET as listGrupos } from '@/app/api/talleres/grupos/route'

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
  /** last insert payload on taller_grupos */
  lastInsert: Record<string, unknown> | null
  /** id assigned to the freshly-inserted grupo row */
  newGrupoId: string
  /** rows returned by the GET list query */
  listRows: unknown[]
  /** recorded rpc invocations (capability gate + generate_taller_sesiones) */
  rpcCalls: RpcCall[]
  /** result the generate_taller_sesiones rpc resolves to */
  sesionesResult: { data: unknown; error: { message: string } | null }
}

const state: MockState = {
  user: { id: 'user-1' },
  capabilities: new Map(),
  lastInsert: null,
  newGrupoId: 'grupo-new',
  listRows: [],
  rpcCalls: [],
  sesionesResult: {
    data: { ok: true, grupo_id: 'grupo-new', total: 8, created: 8 },
    error: null,
  },
}

function reset(): void {
  state.user = { id: 'user-1' }
  state.capabilities = new Map()
  state.lastInsert = null
  state.newGrupoId = 'grupo-new'
  state.listRows = []
  state.rpcCalls = []
  state.sesionesResult = {
    data: { ok: true, grupo_id: 'grupo-new', total: 8, created: 8 },
    error: null,
  }
}

beforeEach(() => {
  reset()
  flagsMock.mockReset().mockReturnValue(true)

  function builder(_table: string): Record<string, jest.Mock> {
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>
    // GET path: .select(...).eq(...).order(...) resolves to the list.
    chain['select'] = jest.fn(() => chain)
    chain['eq'] = jest.fn(() => chain)
    chain['order'] = jest.fn(() =>
      Promise.resolve({ data: state.listRows, error: null }),
    )
    // POST path: .insert(payload).select(...).single()
    chain['insert'] = jest.fn((payload: Record<string, unknown>) => {
      state.lastInsert = payload
      const row = { id: state.newGrupoId, ...payload }
      return {
        select: () => ({
          single: () => Promise.resolve({ data: row, error: null }),
        }),
      }
    })
    return chain
  }

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn(() =>
        Promise.resolve({ data: { user: state.user }, error: null }),
      ),
    },
    rpc: jest.fn((name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args })
      if (name === 'generate_taller_sesiones') {
        return Promise.resolve(state.sesionesResult)
      }
      // capability gate: auth_has_talleres_capability({ p_capability_key })
      const cap = (args?.['p_capability_key'] ?? args?.['p_capability']) as string
      return Promise.resolve({ data: state.capabilities.get(cap) === true })
    }),
    from: jest.fn((table: string) => builder(table)),
  })
})

function makeReq(body?: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/test'), {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  })
}

function makeGet(url: string): NextRequest {
  return new NextRequest(new URL(url), { method: 'GET' })
}

// ─── POST — deny-by-default ────────────────────────────────────────────────

describe('PR F — POST /api/talleres/grupos deny-by-default', () => {
  it('returns 401 when there is no authed user', async () => {
    state.user = null
    const res = await crearGrupo(makeReq({ cohorte_id: 'c-1', nombre: 'A', capacidad: 10 }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when director.write is missing', async () => {
    const res = await crearGrupo(makeReq({ cohorte_id: 'c-1', nombre: 'A', capacidad: 10 }))
    expect(res.status).toBe(403)
  })

  it('returns 400 on non-JSON body', async () => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
    const res = await crearGrupo(makeReq())
    expect(res.status).toBe(400)
  })

  it('returns 400 when required fields are missing', async () => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
    const res = await crearGrupo(makeReq({ cohorte_id: 'c-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('missing-fields')
  })

  it('returns 400 when capacidad <= 0', async () => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
    // Negative (not 0): 0 is falsy and trips the missing-fields guard first;
    // the invalid-capacidad branch only fires for a present-but-non-positive value.
    const res = await crearGrupo(makeReq({ cohorte_id: 'c-1', nombre: 'A', capacidad: -5 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid-capacidad')
  })
})

// ─── POST — success + session generation ───────────────────────────────────

describe('PR F — POST /api/talleres/grupos creates grupo + generates sessions', () => {
  beforeEach(() => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
  })

  it('inserts the grupo with estado=activo and returns 201 { grupo, sesiones }', async () => {
    const res = await crearGrupo(
      makeReq({ cohorte_id: 'c-1', nombre: 'Grupo Alfa', capacidad: 12 }),
    )
    expect(res.status).toBe(201)
    expect(state.lastInsert).toMatchObject({
      cohorte_id: 'c-1',
      nombre: 'Grupo Alfa',
      capacidad: 12,
      estado: 'activo',
    })
    const body = await res.json()
    expect(body.grupo).toMatchObject({ id: 'grupo-new', nombre: 'Grupo Alfa' })
    expect(body.sesiones).toMatchObject({ ok: true, total: 8, created: 8 })
  })

  it('calls generate_taller_sesiones with the new grupo id after insert', async () => {
    await crearGrupo(makeReq({ cohorte_id: 'c-1', nombre: 'Grupo Alfa', capacidad: 12 }))
    const gen = state.rpcCalls.find((c) => c.name === 'generate_taller_sesiones')
    expect(gen).toBeDefined()
    expect(gen?.args['p_grupo_id']).toBe('grupo-new')
  })

  it('is best-effort — a failing generate_taller_sesiones still returns 201', async () => {
    state.sesionesResult = { data: null, error: { message: 'boom' } }
    const res = await crearGrupo(
      makeReq({ cohorte_id: 'c-1', nombre: 'Grupo Alfa', capacidad: 12 }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.grupo).toMatchObject({ id: 'grupo-new' })
    // sesiones is null on failure — the caller can retry (RPC is idempotent).
    expect(body.sesiones).toBeNull()
  })
})

// ─── GET — list (unchanged contract) ───────────────────────────────────────

describe('PR F — GET /api/talleres/grupos', () => {
  it('returns 403 when director.read is missing', async () => {
    const res = await listGrupos(makeGet('http://localhost/api/talleres/grupos?cohorte_id=c-1'))
    expect(res.status).toBe(403)
  })

  it('returns 400 when cohorte_id is missing', async () => {
    state.capabilities.set('talleres_crecimiento.director.read', true)
    const res = await listGrupos(makeGet('http://localhost/api/talleres/grupos'))
    expect(res.status).toBe(400)
  })

  it('returns 200 { grupos, count } for a cohorte', async () => {
    state.capabilities.set('talleres_crecimiento.director.read', true)
    state.listRows = [
      { id: 'g-1', cohorte_id: 'c-1', nombre: 'Alfa', capacidad: 12, estado: 'activo', completed_at: null },
      { id: 'g-2', cohorte_id: 'c-1', nombre: 'Beta', capacidad: 10, estado: 'activo', completed_at: null },
    ]
    const res = await listGrupos(makeGet('http://localhost/api/talleres/grupos?cohorte_id=c-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(2)
    expect(body.grupos).toHaveLength(2)
  })
})
