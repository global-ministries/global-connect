import type { NextRequest } from 'next/server'
import { GET } from '@/app/api/casas-anfitrionas/propietarios/buscar/route'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()
const obtenerUsuariosAsignablesCasaAnfitriona = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('@/lib/casas-anfitrionas/assignable-users', () => ({
  obtenerUsuariosAsignablesCasaAnfitriona: (...args: unknown[]) => obtenerUsuariosAsignablesCasaAnfitriona(...args),
}))
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: () => Promise.resolve(body),
    }),
  },
}))

const authId = '11111111-1111-1111-1111-111111111111'
const casaId = '22222222-2222-2222-2222-222222222222'

describe('GET /api/casas-anfitrionas/propietarios/buscar', () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    createSupabaseAdminClient.mockReturnValue({ admin: true })
    obtenerUsuariosAsignablesCasaAnfitriona.mockResolvedValue([{ value: 'user-1', label: 'Ana Pérez' }])
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('searches by the provided field term and normalizes invalid limits', async () => {
    const supabase = createServerClient()
    createSupabaseServerClient.mockResolvedValue(supabase)

    const response = await GET(request('/api/casas-anfitrionas/propietarios/buscar?q=ana%40example.com&limit=abc'))

    await expect(response.json()).resolves.toEqual({ usuarios: [{ value: 'user-1', label: 'Ana Pérez' }] })
    expect(response.status).toBe(200)
    expect(obtenerUsuariosAsignablesCasaAnfitriona).toHaveBeenCalledWith(expect.objectContaining({
      authId,
      busqueda: 'ana@example.com',
      limit: 30,
    }))
  })

  it('passes quotes and SQL metacharacters as search text without rejecting the request', async () => {
    const supabase = createServerClient()
    createSupabaseServerClient.mockResolvedValue(supabase)

    const response = await GET(request("/api/casas-anfitrionas/propietarios/buscar?q=O%27Connor%25_%3B--&limit=10"))

    await expect(response.json()).resolves.toEqual({ usuarios: [{ value: 'user-1', label: 'Ana Pérez' }] })
    expect(response.status).toBe(200)
    expect(obtenerUsuariosAsignablesCasaAnfitriona).toHaveBeenCalledWith(expect.objectContaining({
      authId,
      busqueda: "O'Connor%_;--",
      limit: 10,
    }))
  })

  it('rejects unauthenticated requests before searching', async () => {
    createSupabaseServerClient.mockResolvedValue(createServerClient({ user: null }))

    const response = await GET(request('/api/casas-anfitrionas/propietarios/buscar?q=Ana'))

    await expect(response.json()).resolves.toEqual({ error: 'No autenticado' })
    expect(response.status).toBe(401)
    expect(obtenerUsuariosAsignablesCasaAnfitriona).not.toHaveBeenCalled()
  })

  it('rejects current house searches when the requester cannot edit that house', async () => {
    const supabase = createServerClient({ canEdit: false })
    createSupabaseServerClient.mockResolvedValue(supabase)

    const response = await GET(request(`/api/casas-anfitrionas/propietarios/buscar?q=Ana&casaId=${casaId}`))

    await expect(response.json()).resolves.toEqual({ error: 'No tienes permisos para editar esta casa' })
    expect(response.status).toBe(403)
    expect(supabase.rpc).toHaveBeenCalledWith('puede_editar_casa_anfitriona', { p_auth_id: authId, p_casa_id: casaId })
    expect(obtenerUsuariosAsignablesCasaAnfitriona).not.toHaveBeenCalled()
  })

  it('rejects search when server-side owner assignment permissions are missing', async () => {
    createSupabaseServerClient.mockResolvedValue(createServerClient({ canAssignOwners: false }))

    const response = await GET(request('/api/casas-anfitrionas/propietarios/buscar?q=Ana'))

    await expect(response.json()).resolves.toEqual({ error: 'No tienes permisos para asignar propietarios' })
    expect(response.status).toBe(403)
    expect(obtenerUsuariosAsignablesCasaAnfitriona).not.toHaveBeenCalled()
  })

  it('logs internal failures and returns a generic client error', async () => {
    createSupabaseServerClient.mockResolvedValue(createServerClient())
    obtenerUsuariosAsignablesCasaAnfitriona.mockRejectedValue(new Error('raw database failure with PII'))

    const response = await GET(request('/api/casas-anfitrionas/propietarios/buscar?q=Ana'))

    await expect(response.json()).resolves.toEqual({ error: 'Error al buscar propietarios' })
    expect(response.status).toBe(500)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[casas-anfitrionas/propietarios/buscar] Error:',
      expect.any(Error),
    )
  })
})

function request(path: string): NextRequest {
  return { url: `http://localhost${path}` } as NextRequest
}

function createServerClient({
  canAssignOwners = true,
  canEdit = true,
  user = { id: authId },
}: {
  canAssignOwners?: boolean
  canEdit?: boolean
  user?: { id: string } | null
} = {}) {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) },
    rpc: jest.fn((name: string) => {
      if (name === 'puede_editar_casa_anfitriona') return Promise.resolve({ data: canEdit, error: null })
      if (name === 'obtener_permisos_casa_anfitriona') {
        return Promise.resolve({ data: { puede_crear_para_otros: canAssignOwners }, error: null })
      }

      throw new Error(`Unexpected RPC ${name}`)
    }),
  }
}
