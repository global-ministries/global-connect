/**
 * @jest-environment node
 *
 * POST /api/talleres/grupos/[id]/asignaciones — assign a persona to a grupo.
 *
 * The endpoint is gated on director.write, widened (alsoAccept) so a scoped
 * coordinator (coordinator.write, scope_id = equipo) can assign líderes in
 * their own grupo. RLS confines the write to the coordinator's equipo — this
 * app gate only lets the request through.
 *
 * Deny-by-default matrix:
 *   - 401 when no authed user
 *   - 403 when neither director.write nor coordinator.write is held
 *   - 400 on invalid body / missing fields / invalid rol
 *   - 201 on success (director.write OR coordinator.write)
 */

import { NextRequest } from 'next/server'

import { POST as asignar, GET as listar } from '@/app/api/talleres/grupos/[id]/asignaciones/route'

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

interface MockState {
  user: { id: string } | null
  capabilities: Map<string, boolean>
  lastInsert: Record<string, unknown> | null
  newId: string
  listRows: Array<Record<string, unknown>>
}

const state: MockState = {
  user: { id: 'user-1' },
  capabilities: new Map(),
  lastInsert: null,
  newId: 'asig-new',
  listRows: [],
}

function reset(): void {
  state.user = { id: 'user-1' }
  state.capabilities = new Map()
  state.lastInsert = null
  state.newId = 'asig-new'
  state.listRows = []
}

beforeEach(() => {
  reset()
  flagsMock.mockReset().mockReturnValue(true)

  function builder(_table: string): Record<string, jest.Mock> {
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>
    chain['insert'] = jest.fn((payload: Record<string, unknown>) => {
      state.lastInsert = payload
      const row = { id: state.newId, started_at: '2026-01-01T00:00:00Z', ...payload }
      return {
        select: () => ({
          single: () => Promise.resolve({ data: row, error: null }),
        }),
      }
    })
    // GET path: .select(...).eq('grupo_id', id).eq('activo', true).order(...)
    chain['select'] = jest.fn(() => {
      const terminal = {
        order: () => Promise.resolve({ data: state.listRows, error: null }),
      }
      const afterFirstEq = { eq: () => terminal, order: terminal.order }
      return { eq: () => afterFirstEq }
    })
    return chain
  }

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn(() =>
        Promise.resolve({ data: { user: state.user }, error: null }),
      ),
    },
    rpc: jest.fn((_name: string, args: Record<string, unknown>) => {
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

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

function makeGetReq(): NextRequest {
  return new NextRequest(new URL('http://localhost/test'), { method: 'GET' })
}

describe('POST /api/talleres/grupos/[id]/asignaciones — deny-by-default', () => {
  it('returns 401 when there is no authed user', async () => {
    state.user = null
    const res = await asignar(makeReq({ persona_id: 'p-1', rol: 'lider' }), ctx('g-1'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when neither director.write nor coordinator.write is held', async () => {
    const res = await asignar(makeReq({ persona_id: 'p-1', rol: 'lider' }), ctx('g-1'))
    expect(res.status).toBe(403)
  })

  it('returns 400 when required fields are missing', async () => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
    const res = await asignar(makeReq({ persona_id: 'p-1' }), ctx('g-1'))
    expect(res.status).toBe(400)
  })

  it('returns 400 on an invalid rol', async () => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
    const res = await asignar(makeReq({ persona_id: 'p-1', rol: 'jefe' }), ctx('g-1'))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/talleres/grupos/[id]/asignaciones — success', () => {
  it('assigns a líder and returns 201 for a director.write caller', async () => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
    const res = await asignar(makeReq({ persona_id: 'p-1', rol: 'lider' }), ctx('g-1'))
    expect(res.status).toBe(201)
    expect(state.lastInsert).toMatchObject({
      grupo_id: 'g-1',
      persona_id: 'p-1',
      rol: 'lider',
      activo: true,
    })
  })

  it('assigns a líder and returns 201 for a scoped coordinator.write caller (no director.*)', async () => {
    state.capabilities.set('talleres_crecimiento.coordinator.write', true)
    const res = await asignar(makeReq({ persona_id: 'p-2', rol: 'lider' }), ctx('g-9'))
    expect(res.status).toBe(201)
    expect(state.lastInsert).toMatchObject({ grupo_id: 'g-9', persona_id: 'p-2', rol: 'lider' })
  })
})

describe('GET /api/talleres/grupos/[id]/asignaciones — list active', () => {
  it('returns 401 when there is no authed user', async () => {
    state.user = null
    const res = await listar(makeGetReq(), ctx('g-1'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when no read/write capability is held', async () => {
    const res = await listar(makeGetReq(), ctx('g-1'))
    expect(res.status).toBe(403)
  })

  it('lists active asignaciones for a scoped coordinator.read caller', async () => {
    state.capabilities.set('talleres_crecimiento.coordinator.read', true)
    state.listRows = [
      { id: 'a-1', grupo_id: 'g-1', persona_id: 'p-1', rol: 'lider', activo: true },
      { id: 'a-2', grupo_id: 'g-1', persona_id: 'p-2', rol: 'voluntario', activo: true },
    ]
    const res = await listar(makeGetReq(), ctx('g-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.asignaciones).toHaveLength(2)
    expect(body.count).toBe(2)
    expect(body.asignaciones[0]).toMatchObject({ id: 'a-1', rol: 'lider' })
  })

  it('returns an empty list (not 404) when the grupo has no active asignaciones', async () => {
    state.capabilities.set('talleres_crecimiento.director.read', true)
    state.listRows = []
    const res = await listar(makeGetReq(), ctx('g-empty'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.asignaciones).toEqual([])
    expect(body.count).toBe(0)
  })
})
