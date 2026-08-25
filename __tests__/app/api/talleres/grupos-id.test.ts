/**
 * @jest-environment node
 *
 * PATCH /api/talleres/grupos/[id] — edit a grupo's nombre / capacidad.
 *
 * The endpoint is gated on director.write, widened (alsoAccept) so a scoped
 * coordinator (coordinator.write, scope_id = equipo) can adjust grupos in their
 * own taller. RLS confines the UPDATE to the coordinator's equipo — this app
 * gate only lets the request through.
 *
 * Soft/reversible by design: this route never physically deletes. It writes a
 * partial patch of the editable fields only (nombre, capacidad). `version` is
 * intentionally NOT touched — PostgREST cannot do `version = version + 1`
 * without an RPC (migration), and the ZERO-migration contract forbids that;
 * the updated_at trigger records the change.
 *
 * Deny-by-default matrix (mirrors grupos.test.ts / grupos-asignaciones.test.ts):
 *   - 401 when no authed user
 *   - 403 when neither director.write nor coordinator.write is held
 *   - 400 on invalid body / no updatable fields / capacidad <= 0
 *   - 404 when the row is invisible (RLS) / does not exist
 *   - 200 on success (director.write OR coordinator.write)
 */

import { NextRequest } from 'next/server'

import { PATCH as editarGrupo, DELETE as cancelarGrupo } from '@/app/api/talleres/grupos/[id]/route'

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
  lastUpdate: Record<string, unknown> | null
  /** when true the UPDATE resolves to null (RLS-invisible / not found) */
  rowMissing: boolean
}

const state: MockState = {
  user: { id: 'user-1' },
  capabilities: new Map(),
  lastUpdate: null,
  rowMissing: false,
}

function reset(): void {
  state.user = { id: 'user-1' }
  state.capabilities = new Map()
  state.lastUpdate = null
  state.rowMissing = false
}

beforeEach(() => {
  reset()
  flagsMock.mockReset().mockReturnValue(true)

  function builder(_table: string): Record<string, jest.Mock> {
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>
    // PATCH path: .update(payload).eq('id', ...).select(...).maybeSingle()
    chain['update'] = jest.fn((payload: Record<string, unknown>) => {
      state.lastUpdate = payload
      const row = state.rowMissing
        ? null
        : {
            id: 'g-1',
            cohorte_id: 'c-1',
            nombre: 'Grupo Base',
            capacidad: 10,
            estado: 'activo',
            completed_at: null,
            ...payload,
          }
      return {
        eq: () => ({
          select: () => ({
            maybeSingle: () => Promise.resolve({ data: row, error: null }),
          }),
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
    rpc: jest.fn((_name: string, args: Record<string, unknown>) => {
      const cap = (args?.['p_capability_key'] ?? args?.['p_capability']) as string
      return Promise.resolve({ data: state.capabilities.get(cap) === true })
    }),
    from: jest.fn((table: string) => builder(table)),
  })
})

function makeReq(body?: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/test'), {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  })
}

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

function makeDeleteReq(): NextRequest {
  return new NextRequest(new URL('http://localhost/test'), { method: 'DELETE' })
}

describe('PATCH /api/talleres/grupos/[id] — deny-by-default', () => {
  it('returns 401 when there is no authed user', async () => {
    state.user = null
    const res = await editarGrupo(makeReq({ nombre: 'Nuevo' }), ctx('g-1'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when neither director.write nor coordinator.write is held', async () => {
    const res = await editarGrupo(makeReq({ nombre: 'Nuevo' }), ctx('g-1'))
    expect(res.status).toBe(403)
  })

  it('returns 400 on a non-JSON body', async () => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
    const res = await editarGrupo(makeReq(), ctx('g-1'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when no updatable fields are provided', async () => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
    const res = await editarGrupo(makeReq({}), ctx('g-1'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when capacidad <= 0', async () => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
    const res = await editarGrupo(makeReq({ capacidad: 0 }), ctx('g-1'))
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/talleres/grupos/[id] — success', () => {
  it('updates nombre + capacidad and returns 200 { grupo } for a director.write caller', async () => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
    const res = await editarGrupo(
      makeReq({ nombre: 'Grupo Alfa', capacidad: 15 }),
      ctx('g-1'),
    )
    expect(res.status).toBe(200)
    expect(state.lastUpdate).toEqual({ nombre: 'Grupo Alfa', capacidad: 15 })
    const body = await res.json()
    expect(body.grupo).toMatchObject({ id: 'g-1', nombre: 'Grupo Alfa', capacidad: 15 })
  })

  it('updates for a scoped coordinator.write caller (no director.*)', async () => {
    state.capabilities.set('talleres_crecimiento.coordinator.write', true)
    const res = await editarGrupo(makeReq({ nombre: 'Grupo Coord' }), ctx('g-9'))
    expect(res.status).toBe(200)
    expect(state.lastUpdate).toEqual({ nombre: 'Grupo Coord' })
  })

  it('does not include version in the patch (ZERO-migration contract)', async () => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
    await editarGrupo(makeReq({ capacidad: 12 }), ctx('g-1'))
    expect(state.lastUpdate).not.toHaveProperty('version')
  })

  it('returns 404 when the grupo is RLS-invisible / does not exist', async () => {
    state.capabilities.set('talleres_crecimiento.coordinator.write', true)
    state.rowMissing = true
    const res = await editarGrupo(makeReq({ nombre: 'X' }), ctx('g-out-of-scope'))
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/talleres/grupos/[id] — soft-cancel', () => {
  it('returns 401 when there is no authed user', async () => {
    state.user = null
    const res = await cancelarGrupo(makeDeleteReq(), ctx('g-1'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when neither director.write nor coordinator.write is held', async () => {
    const res = await cancelarGrupo(makeDeleteReq(), ctx('g-1'))
    expect(res.status).toBe(403)
  })

  it('soft-cancels via estado=cancelado (never a physical delete) and returns 200', async () => {
    state.capabilities.set('talleres_crecimiento.coordinator.write', true)
    const res = await cancelarGrupo(makeDeleteReq(), ctx('g-1'))
    expect(res.status).toBe(200)
    expect(state.lastUpdate).toEqual({ estado: 'cancelado' })
    const body = await res.json()
    expect(body.grupo).toMatchObject({ id: 'g-1', estado: 'cancelado' })
  })

  it('does not include version in the cancel patch (ZERO-migration contract)', async () => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
    await cancelarGrupo(makeDeleteReq(), ctx('g-1'))
    expect(state.lastUpdate).not.toHaveProperty('version')
  })

  it('returns 404 when the grupo is RLS-invisible / does not exist', async () => {
    state.capabilities.set('talleres_crecimiento.coordinator.write', true)
    state.rowMissing = true
    const res = await cancelarGrupo(makeDeleteReq(), ctx('g-out-of-scope'))
    expect(res.status).toBe(404)
  })
})
