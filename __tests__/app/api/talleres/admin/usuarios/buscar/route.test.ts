/**
 * @jest-environment node
 *
 * Cimiento 4 — HTTP tests for GET /api/talleres/admin/usuarios/buscar
 *
 * User search for the "assign servicio" admin card. Auth mirrors the
 * openEdicion server action: talleres flag → readonly platform session →
 * capability gate (director.write OR admin.manage).
 *
 * BUGFIX — this route used to query `usuarios` directly through the caller's
 * own server client, which hit `usuarios`' own RLS: only admin/pastor/
 * Grupos-de-Vida leaders can see other people's rows there, so every
 * director/coordinator got a silent "Sin resultados". It now calls the
 * talleres_buscar_personas RPC (SECURITY DEFINER, its own capability gate),
 * mapped back to this route's existing response shape.
 *
 * Covers:
 *   - 404 when the talleres flag is off
 *   - 401 when there is no signed-in user
 *   - 403 when the caller lacks director.write and admin.manage
 *   - 200 with the matching usuarios when authorized, calling the RPC with
 *     the trimmed query and the route's fixed limit
 *   - [] when the query is shorter than 2 characters (no RPC call)
 *   - CORRECTION (post-review): a 42501 from the RPC used to degrade to []
 *     (200) — that reintroduces the exact bug this change exists to kill:
 *     an authorization problem rendered as "no results", indistinguishable
 *     from "nobody matched". It now surfaces as a visible 403 with a fixed
 *     error/message body. Any OTHER RPC error stays 500 with a generic
 *     Spanish message and never leaks the SQLSTATE/detail in the response.
 */
import { NextRequest } from 'next/server'

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

import { GET } from '@/app/api/talleres/admin/usuarios/buscar/route'

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  capabilities?: string[]
  hasSession?: boolean
  rows?: unknown[]
  rpcError?: { code?: string; message: string } | null
}

let rpcMock: jest.Mock

function setup(opts: SetupOpts): void {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)

  const hasSession = opts.hasSession ?? true
  resolveSessionMock.mockReset().mockResolvedValue(
    hasSession
      ? {
          personaId: 'p-1',
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

  rpcMock = jest.fn().mockResolvedValue({ data: opts.rows ?? [], error: opts.rpcError ?? null })

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
    rpc: rpcMock,
  })
}

function request(q: string): NextRequest {
  return new NextRequest(new URL(`http://localhost/api/talleres/admin/usuarios/buscar?q=${encodeURIComponent(q)}`))
}

describe('GET /api/talleres/admin/usuarios/buscar', () => {
  it('404 when the talleres flag is off', async () => {
    setup({ isEnabled: false })
    const res = await GET(request('ana'))
    expect(res.status).toBe(404)
  })

  it('401 when there is no signed-in user', async () => {
    setup({ user: null })
    const res = await GET(request('ana'))
    expect(res.status).toBe(401)
  })

  it('403 when the caller lacks director.write and admin.manage', async () => {
    setup({ capabilities: ['talleres_crecimiento.participation.read'] })
    const res = await GET(request('ana'))
    expect(res.status).toBe(403)
  })

  it('200 with matching usuarios for a director.write caller, calling the RPC', async () => {
    setup({
      capabilities: ['talleres_crecimiento.director.write'],
      rows: [
        { id: 'u-1', email: 'ana@test.com', nombre: 'Ana', apellido: 'Pérez' },
      ],
    })
    const res = await GET(request('ana'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([
      { id: 'u-1', email: 'ana@test.com', nombre: 'Ana', apellido: 'Pérez', auth_id: null },
    ])
    expect(rpcMock).toHaveBeenCalledWith('talleres_buscar_personas', { p_q: 'ana', p_limit: 20 })
  })

  it('returns [] without querying the RPC when q is shorter than 2 characters', async () => {
    setup({ capabilities: ['talleres_crecimiento.admin.manage'] })
    const res = await GET(request('a'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('403 with a visible authority error when the RPC denies with 42501', async () => {
    setup({
      capabilities: ['talleres_crecimiento.director.write'],
      rpcError: { code: '42501', message: 'sin_autoridad_para_buscar' },
    })
    const res = await GET(request('ana'))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: 'sin_autoridad_para_buscar',
      message: 'No tenés autoridad para buscar personas.',
    })
  })

  it('500 with a generic message (no leaked SQLSTATE) when the RPC fails for any other reason', async () => {
    setup({
      capabilities: ['talleres_crecimiento.director.write'],
      rpcError: { code: '22023', message: 'boom' },
    })
    const res = await GET(request('ana'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Error interno' })
    expect(JSON.stringify(body)).not.toContain('22023')
    expect(JSON.stringify(body)).not.toContain('boom')
  })
})
