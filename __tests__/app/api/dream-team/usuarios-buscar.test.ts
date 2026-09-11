/**
 * @jest-environment node
 *
 * Dream Team — HTTP tests for GET /api/dream-team/usuarios/buscar
 *
 * Own persona search for Dream Team, gated by Dream Team's own flag/session/
 * capability chain (NOT the talleres one — a scoped area director has
 * dream_team.direct but never a talleres capability).
 *
 * Covers:
 *   - 404 when the Dream Team flag is off
 *   - 401 when there is no signed-in user
 *   - 403 when the caller lacks any Dream Team write capability
 *   - 200 with the matching usuarios when authorized
 *   - [] when the query is shorter than 2 characters (no DB hit)
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({ resolveReadOnlyPlatformSession: jest.fn() }))

import { GET } from '@/app/api/dream-team/usuarios/buscar/route'

const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock

const authId = '11111111-1111-1111-1111-111111111111'
const actorPersonaId = '22222222-2222-2222-2222-222222222222'

const writeCap = { key: 'dream_team.director.coordinate', experience: 'dream_team', scopeType: 'experience', source: 'test' }
const readOnlyCap = { key: 'dream_team.metrics.read', experience: 'dream_team', scopeType: 'experience', source: 'test' }
const scopedDirectorCap = { key: 'dream_team.direct', experience: 'dream_team', scopeType: 'equipo', scopeId: 'equipo-dps', source: 'test' }

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  capabilities?: Record<string, unknown>[]
  rows?: unknown[]
  queryError?: { message: string } | null
}

let capturedFilter: string | null = null

function setup(opts: SetupOpts): void {
  capturedFilter = null
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = opts.isEnabled === false ? 'off' : 'on'

  const usuariosChain: { select: jest.Mock; or: jest.Mock; limit: jest.Mock } = {
    select: jest.fn().mockReturnThis(),
    or: jest.fn((filter: string) => {
      capturedFilter = filter
      return usuariosChain
    }),
    limit: jest.fn().mockResolvedValue({ data: opts.rows ?? [], error: opts.queryError ?? null }),
  }

  const user = opts.user === undefined ? { id: authId } : opts.user

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: jest.fn(() => usuariosChain),
  })

  resolveSessionMock.mockReset().mockResolvedValue(
    user
      ? { personaId: actorPersonaId, subjectAuthId: authId, globalRoles: [], contexts: [], capabilities: opts.capabilities ?? [] }
      : null,
  )
}

function request(q: string): NextRequest {
  return new NextRequest(new URL(`http://localhost/api/dream-team/usuarios/buscar?q=${encodeURIComponent(q)}`))
}

describe('GET /api/dream-team/usuarios/buscar', () => {
  it('404 when the Dream Team flag is off', async () => {
    setup({ isEnabled: false })
    const res = await GET(request('ana'))
    expect(res.status).toBe(404)
  })

  it('401 when there is no signed-in user', async () => {
    setup({ user: null })
    const res = await GET(request('ana'))
    expect(res.status).toBe(401)
  })

  it('403 without any Dream Team write capability', async () => {
    setup({ capabilities: [readOnlyCap] })
    const res = await GET(request('ana'))
    expect(res.status).toBe(403)
  })

  it('200 with matching usuarios for a global write-capable caller', async () => {
    setup({
      capabilities: [writeCap],
      rows: [{ id: 'u-1', email: 'ana@test.com', nombre: 'Ana', apellido: 'Pérez', auth_id: 'auth-9' }],
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

  it('200 for a scoped area director (dream_team.direct only)', async () => {
    setup({ capabilities: [scopedDirectorCap], rows: [] })
    const res = await GET(request('ana'))
    expect(res.status).toBe(200)
  })

  it('returns [] without querying when q is shorter than 2 characters', async () => {
    setup({ capabilities: [writeCap] })
    const res = await GET(request('a'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
    expect(capturedFilter).toBeNull()
  })
})
