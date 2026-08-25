/**
 * @jest-environment node
 *
 * DELETE /api/talleres/grupos/[id]/asignaciones/[asignacionId] — soft-remove.
 *
 * "Quitar líder" is soft/reversible: this route never physically deletes a
 * asignación. It writes activo=false, ended_at=now(), motivo_retiro=<motivo>,
 * preserving the row as history. The schema requires motivo_retiro whenever
 * activo=false, so motivo is a required field (400 if absent).
 *
 * director.write is the primary gate; a scoped coordinator (coordinator.write)
 * and a global admin (admin.manage) may also remove — RLS confines the
 * coordinator's UPDATE to their own equipo. `version` is deliberately left
 * untouched (ZERO-migration contract). maybeSingle()-404 for RLS-invisible rows.
 */

import { NextRequest } from 'next/server'

import { DELETE as quitarLider } from '@/app/api/talleres/grupos/[id]/asignaciones/[asignacionId]/route'

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
    chain['update'] = jest.fn((payload: Record<string, unknown>) => {
      state.lastUpdate = payload
      const row = state.rowMissing
        ? null
        : {
            id: 'a-1',
            grupo_id: 'g-1',
            persona_id: 'p-1',
            rol: 'lider',
            activo: false,
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
    method: 'DELETE',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  })
}

function ctx(id: string, asignacionId: string): {
  params: Promise<{ id: string; asignacionId: string }>
} {
  return { params: Promise.resolve({ id, asignacionId }) }
}

describe('DELETE /api/talleres/grupos/[id]/asignaciones/[asignacionId] — deny-by-default', () => {
  it('returns 401 when there is no authed user', async () => {
    state.user = null
    const res = await quitarLider(makeReq({ motivo: 'rotación' }), ctx('g-1', 'a-1'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when neither director.write nor coordinator.write is held', async () => {
    const res = await quitarLider(makeReq({ motivo: 'rotación' }), ctx('g-1', 'a-1'))
    expect(res.status).toBe(403)
  })

  it('returns 400 when motivo is missing (schema requires motivo_retiro)', async () => {
    state.capabilities.set('talleres_crecimiento.coordinator.write', true)
    const res = await quitarLider(makeReq({}), ctx('g-1', 'a-1'))
    expect(res.status).toBe(400)
  })

  it('returns 400 on a non-JSON body', async () => {
    state.capabilities.set('talleres_crecimiento.coordinator.write', true)
    const res = await quitarLider(makeReq(), ctx('g-1', 'a-1'))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/talleres/grupos/[id]/asignaciones/[asignacionId] — soft-remove', () => {
  it('soft-removes with activo=false + motivo_retiro + ended_at and returns 200', async () => {
    state.capabilities.set('talleres_crecimiento.coordinator.write', true)
    const res = await quitarLider(makeReq({ motivo: 'rotación de líderes' }), ctx('g-1', 'a-1'))
    expect(res.status).toBe(200)
    expect(state.lastUpdate).toMatchObject({
      activo: false,
      motivo_retiro: 'rotación de líderes',
    })
    expect(state.lastUpdate).toHaveProperty('ended_at')
    expect(state.lastUpdate?.ended_at).toBeTruthy()
  })

  it('does not include version in the patch (ZERO-migration contract)', async () => {
    state.capabilities.set('talleres_crecimiento.director.write', true)
    await quitarLider(makeReq({ motivo: 'x' }), ctx('g-1', 'a-1'))
    expect(state.lastUpdate).not.toHaveProperty('version')
  })

  it('returns 404 when the asignación is RLS-invisible / does not exist', async () => {
    state.capabilities.set('talleres_crecimiento.coordinator.write', true)
    state.rowMissing = true
    const res = await quitarLider(makeReq({ motivo: 'x' }), ctx('g-1', 'a-out'))
    expect(res.status).toBe(404)
  })
})
