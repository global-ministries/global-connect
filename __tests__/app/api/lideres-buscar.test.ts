/**
 * @jest-environment node
 *
 * HTTP tests for GET /api/lideres/buscar (leader picker of Grupos de Vida and
 * Talleres).
 *
 * The route reads with the service role, so it must scope by itself: everyone
 * sees only the leaders of their own campus (usuario_campus) and only the
 * system admin role sees every campus. A caller without campus sees none.
 * The search text is reduced to safe characters before it reaches the
 * PostgREST `or` filter, so commas or parentheses cannot add conditions.
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: jest.fn() }))

import { GET } from '@/app/api/lideres/buscar/route'

const serverMock = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const adminMock = jest.requireMock('@/lib/supabase/admin').createSupabaseAdminClient as jest.Mock

type Row = Record<string, unknown>

const ROL_LIDER = 'rol-lider'
const ROL_ADMIN = 'rol-admin'
const CAMPUS_A = 'campus-a'
const CAMPUS_B = 'campus-b'

const usuarios: Row[] = [
  { id: 'yo', auth_id: 'auth-yo', nombre: 'Yo', apellido: 'Mismo', email: 'yo@x.test', foto_perfil_url: null },
  { id: 'jefe', auth_id: 'auth-jefe', nombre: 'Jefe', apellido: 'Admin', email: 'jefe@x.test', foto_perfil_url: null },
  { id: 'sin', auth_id: 'auth-sin', nombre: 'Sin', apellido: 'Campus', email: 'sin@x.test', foto_perfil_url: null },
  { id: 'la', nombre: 'Ana', apellido: 'Campus A', email: 'ana@x.test', foto_perfil_url: null },
  { id: 'lb', nombre: 'Beto', apellido: 'Campus B', email: 'beto@x.test', foto_perfil_url: null },
]

function tables(): Record<string, Row[]> {
  return {
    roles_sistema: [
      { id: ROL_LIDER, nombre_interno: 'lider' },
      { id: ROL_ADMIN, nombre_interno: 'admin' },
    ],
    usuario_roles: [
      { usuario_id: 'la', rol_id: ROL_LIDER },
      { usuario_id: 'lb', rol_id: ROL_LIDER },
      { usuario_id: 'jefe', rol_id: ROL_ADMIN },
    ],
    usuarios,
    usuario_campus: [
      { usuario_id: 'yo', campus_id: CAMPUS_A },
      { usuario_id: 'la', campus_id: CAMPUS_A },
      { usuario_id: 'lb', campus_id: CAMPUS_B },
    ],
    grupo_miembros: [],
  }
}

let orFilters: string[]

/** Minimal in-memory PostgREST builder: eq / in filter rows; nested keys (a.b) and or() are recorded, not applied. */
function fakeAdmin(data: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(data[table] ?? [])]
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        eq(col: string, val: unknown) {
          if (!col.includes('.')) rows = rows.filter((r) => r[col] === val)
          return builder
        },
        in(col: string, vals: unknown[]) {
          rows = rows.filter((r) => vals.includes(r[col]))
          return builder
        },
        or(filter: string) {
          orFilters.push(filter)
          return builder
        },
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
      }
      return builder
    },
  }
}

function setup(authId: string | null): void {
  orFilters = []
  serverMock.mockReset().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: authId ? { id: authId } : null }, error: null }) },
  })
  adminMock.mockReset().mockReturnValue(fakeAdmin(tables()))
}

async function buscar(q = ''): Promise<{ status: number; body: { lideres?: { id: string }[]; total?: number; error?: string } }> {
  const res = await GET(new NextRequest(new URL(`http://localhost/api/lideres/buscar?q=${encodeURIComponent(q)}`)))
  return { status: res.status, body: await res.json() }
}

describe('GET /api/lideres/buscar', () => {
  it('401 without a signed-in user', async () => {
    setup(null)
    const { status, body } = await buscar()
    expect(status).toBe(401)
    expect(body).toEqual({ error: 'No autenticado' })
  })

  it('returns only the leaders of the caller\'s own campus', async () => {
    setup('auth-yo')
    const { status, body } = await buscar()
    expect(status).toBe(200)
    expect(body.lideres?.map((l) => l.id)).toEqual(['la'])
    expect(body.total).toBe(1)
  })

  it('the system admin sees the leaders of every campus', async () => {
    setup('auth-jefe')
    const { status, body } = await buscar()
    expect(status).toBe(200)
    expect(body.lideres?.map((l) => l.id).sort()).toEqual(['la', 'lb'])
  })

  it('a caller without campus sees no leader', async () => {
    setup('auth-sin')
    const { status, body } = await buscar()
    expect(status).toBe(200)
    expect(body).toEqual({ lideres: [], total: 0 })
  })

  it('a signed-in user with no persona sees no leader', async () => {
    setup('auth-nadie')
    const { status, body } = await buscar()
    expect(status).toBe(200)
    expect(body).toEqual({ lideres: [], total: 0 })
  })

  it('strips characters that would add conditions to the or filter', async () => {
    setup('auth-yo')
    await buscar('ana,id.neq.0),(email')
    expect(orFilters).toEqual(['nombre.ilike.%ana id.neq.0 email%,apellido.ilike.%ana id.neq.0 email%,email.ilike.%ana id.neq.0 email%'])
  })

  it('keeps letters with accents, digits, @, dots and hyphens in the search', async () => {
    setup('auth-yo')
    await buscar('  José-María ana@x.test 2 ')
    expect(orFilters).toEqual([
      'nombre.ilike.%José-María ana@x.test 2%,apellido.ilike.%José-María ana@x.test 2%,email.ilike.%José-María ana@x.test 2%',
    ])
  })
})
