/**
 * @jest-environment node
 *
 * Cimiento 4 — HTTP tests for GET /api/talleres/admin/usuarios/buscar
 *
 * User search for the "assign servicio" admin card. Auth mirrors the
 * openEdicion server action: talleres flag → readonly platform session →
 * capability gate (director.write OR admin.manage).
 *
 * Covers:
 *   - 404 when the talleres flag is off
 *   - 401 when there is no signed-in user
 *   - 403 when the caller lacks director.write and admin.manage
 *   - 200 with the matching usuarios when authorized
 *   - [] when the query is shorter than 2 characters (no DB hit)
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
  queryError?: { message: string } | null
}

let capturedFilter: string | null = null

function setup(opts: SetupOpts): void {
  capturedFilter = null
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

  const usuariosChain: {
    select: jest.Mock
    or: jest.Mock
    limit: jest.Mock
  } = {
    select: jest.fn().mockReturnThis(),
    or: jest.fn((filter: string) => {
      capturedFilter = filter
      return usuariosChain
    }),
    limit: jest.fn().mockResolvedValue({ data: opts.rows ?? [], error: opts.queryError ?? null }),
  }

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
    from: jest.fn(() => usuariosChain),
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

  it('200 with matching usuarios for a director.write caller', async () => {
    setup({
      capabilities: ['talleres_crecimiento.director.write'],
      rows: [
        { id: 'u-1', email: 'ana@test.com', nombre: 'Ana', apellido: 'Pérez', auth_id: 'auth-9' },
      ],
    })
    const res = await GET(request('ana'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].email).toBe('ana@test.com')
    expect(capturedFilter).toContain('nombre.ilike.%ana%')
    expect(capturedFilter).toContain('apellido.ilike.%ana%')
    expect(capturedFilter).toContain('email.ilike.%ana%')
  })

  it('returns [] without querying when q is shorter than 2 characters', async () => {
    setup({ capabilities: ['talleres_crecimiento.admin.manage'] })
    const res = await GET(request('a'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
    expect(capturedFilter).toBeNull()
  })
})
