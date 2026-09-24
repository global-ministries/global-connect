/**
 * @jest-environment node
 *
 * T2 (odd/tasks/talleres-inscripcion-a-grupo.md) — POST
 * /api/talleres/inscripciones/asignar-grupo.
 *
 * Thin wrapper around talleres_asignar_inscripciones_a_grupo. The gate
 * is authenticated-only (the RPC itself is the security wall — see the
 * route's own header), so these tests cover: 401 with no session, body
 * validation, the RPC error → Spanish message mapping (including the
 * fail-soft default for an RPC that doesn't exist yet), the happy path
 * response shape, and revalidation of both the edición and grupo routes.
 */

import { NextRequest } from 'next/server'

import { POST as asignarGrupo } from '@/app/api/talleres/inscripciones/asignar-grupo/route'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(() => true),
}))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const revalidatePathMock = jest.requireMock('next/cache').revalidatePath as jest.Mock

interface MockState {
  user: { id: string } | null
  rpcResult: { data: unknown; error: { code?: string; message?: string } | null }
  rpcArgs: unknown
  grupoRow: { cohorte_id: string } | null
  cohorteRow: { taller_id: string } | null
  edicionRow: { taller_id: string } | null
  tallerRow: { slug: string } | null
}

const state: MockState = {
  user: { id: 'user-1' },
  rpcResult: { data: { asignadas: 2, ocupacion: 2, capacidad: 10 }, error: null },
  rpcArgs: null,
  grupoRow: { cohorte_id: 'coh-1' },
  cohorteRow: { taller_id: 'ed-1' },
  edicionRow: { taller_id: 't-1' },
  tallerRow: { slug: 'matrimonio-sobre-la-roca' },
}

function reset(): void {
  state.user = { id: 'user-1' }
  state.rpcResult = { data: { asignadas: 2, ocupacion: 2, capacidad: 10 }, error: null }
  state.rpcArgs = null
  state.grupoRow = { cohorte_id: 'coh-1' }
  state.cohorteRow = { taller_id: 'ed-1' }
  state.edicionRow = { taller_id: 't-1' }
  state.tallerRow = { slug: 'matrimonio-sobre-la-roca' }
}

beforeEach(() => {
  reset()
  flagsMock.mockReset().mockReturnValue(true)
  revalidatePathMock.mockReset()

  const rowByTable: Record<string, unknown> = {
    taller_grupos: state.grupoRow,
    talleres_crecimiento_cohortes: state.cohorteRow,
    taller_ediciones: state.edicionRow,
    talleres: state.tallerRow,
  }

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: state.user }, error: null })),
    },
    rpc: jest.fn((name: string, args: unknown) => {
      state.rpcArgs = args
      return Promise.resolve(state.rpcResult)
    }),
    from: jest.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data:
                table === 'taller_grupos'
                  ? state.grupoRow
                  : table === 'talleres_crecimiento_cohortes'
                    ? state.cohorteRow
                    : table === 'taller_ediciones'
                      ? state.edicionRow
                      : state.tallerRow,
              error: null,
            }),
        }),
      }),
    })),
  })
  void rowByTable
})

function makeReq(body?: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/test'), {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  })
}

describe('POST /api/talleres/inscripciones/asignar-grupo — gate', () => {
  it('returns 401 with no session', async () => {
    state.user = null
    const res = await asignarGrupo(makeReq({ inscripcion_ids: ['i-1'], grupo_id: 'g-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 on non-JSON body', async () => {
    const res = await asignarGrupo(makeReq())
    expect(res.status).toBe(400)
  })

  it('returns 400 when inscripcion_ids is missing or empty', async () => {
    const res = await asignarGrupo(makeReq({ inscripcion_ids: [], grupo_id: 'g-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('missing-fields')
  })
})

describe('POST /api/talleres/inscripciones/asignar-grupo — happy path', () => {
  it('calls the RPC with the inscripcion ids and grupo_id, returns the response shape', async () => {
    const res = await asignarGrupo(
      makeReq({ inscripcion_ids: ['i-1', 'i-2'], grupo_id: 'g-1' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ asignadas: 2, ocupacion: 2, capacidad: 10 })
    expect(state.rpcArgs).toEqual({ p_inscripcion_ids: ['i-1', 'i-2'], p_grupo_id: 'g-1' })
  })

  it('accepts grupo_id: null to unassign', async () => {
    const res = await asignarGrupo(makeReq({ inscripcion_ids: ['i-1'], grupo_id: null }))
    expect(res.status).toBe(200)
    expect(state.rpcArgs).toEqual({ p_inscripcion_ids: ['i-1'], p_grupo_id: null })
  })

  it('revalidates both the edición and grupo routes when assigning', async () => {
    await asignarGrupo(makeReq({ inscripcion_ids: ['i-1'], grupo_id: 'g-1' }))
    expect(revalidatePathMock).toHaveBeenCalledWith(
      '/talleres/matrimonio-sobre-la-roca/ed-1',
    )
    expect(revalidatePathMock).toHaveBeenCalledWith(
      '/talleres/matrimonio-sobre-la-roca/ed-1/g-1',
    )
  })

  it('does not revalidate the grupo route when unassigning (no single grupo target)', async () => {
    await asignarGrupo(makeReq({ inscripcion_ids: ['i-1'], grupo_id: null }))
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/talleres/inscripciones/asignar-grupo — error mapping', () => {
  it('maps 42501 to FORBIDDEN with a Spanish message', async () => {
    state.rpcResult = {
      data: null,
      error: { code: '42501', message: 'sin_permisos_para_este_grupo' },
    }
    const res = await asignarGrupo(makeReq({ inscripcion_ids: ['i-1'], grupo_id: 'g-1' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('FORBIDDEN')
    expect(body.message).toMatch(/permiso/i)
  })

  it('maps P0001 GRUPO_DE_OTRA_COHORTE to INVALID_GRUPO', async () => {
    state.rpcResult = {
      data: null,
      error: { code: 'P0001', message: 'GRUPO_DE_OTRA_COHORTE' },
    }
    const res = await asignarGrupo(makeReq({ inscripcion_ids: ['i-1'], grupo_id: 'g-1' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('INVALID_GRUPO')
  })

  it('maps P0001 INSCRIPCION_NO_APROBADA to NOT_APROBADA', async () => {
    state.rpcResult = {
      data: null,
      error: { code: 'P0001', message: 'INSCRIPCION_NO_APROBADA' },
    }
    const res = await asignarGrupo(makeReq({ inscripcion_ids: ['i-1'], grupo_id: 'g-1' }))
    const body = await res.json()
    expect(body.error).toBe('NOT_APROBADA')
  })

  it('maps P0002 to NOT_FOUND', async () => {
    state.rpcResult = { data: null, error: { code: 'P0002' } }
    const res = await asignarGrupo(makeReq({ inscripcion_ids: ['i-1'], grupo_id: 'g-1' }))
    const body = await res.json()
    expect(body.error).toBe('NOT_FOUND')
  })

  it('fails soft (FAILED, readable Spanish message, no crash) when the RPC does not exist (42883)', async () => {
    state.rpcResult = {
      data: null,
      error: { code: '42883', message: 'function does not exist' },
    }
    const res = await asignarGrupo(makeReq({ inscripcion_ids: ['i-1'], grupo_id: 'g-1' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('FAILED')
    expect(typeof body.message).toBe('string')
    expect(body.message.length).toBeGreaterThan(0)
  })
})
