const createSupabaseServerClient = jest.fn()
const redirect = jest.fn((path: string) => {
  throw new Error(`redirect:${path}`)
})

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }))
jest.mock('@/app/(auth)/configuracion/grupos-vida/geocodificacion-panel', () => ({ GeocodificacionPanel: () => null }))

import ConfiguracionGruposPage from '@/app/(auth)/configuracion/grupos-vida/page'

const authId = '11111111-1111-1111-1111-111111111111'
const internalUserId = '22222222-2222-2222-2222-222222222222'

function createClient(options: { esAdmin: boolean; internalId?: string | null }) {
  const rpc = jest.fn(async (name: string, args?: { p_auth_uid?: string }) => {
    if (name === 'get_my_internal_id') return { data: options.internalId === undefined ? internalUserId : options.internalId, error: null }
    if (name === 'es_superadmin') return { data: options.esAdmin && args?.p_auth_uid === internalUserId, error: null }
    return { data: null, error: null }
  })
  const query: Record<string, unknown> = {}
  for (const method of ['select', 'or']) query[method] = jest.fn(() => query)
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ count: 0, error: null }).then(resolve)
  return {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: authId } } })) },
    rpc,
    from: jest.fn(() => query),
  }
}

describe('ConfiguracionGruposPage admin check', () => {
  beforeEach(() => redirect.mockClear())

  it('asks es_superadmin about the internal person id and renders for an admin', async () => {
    const client = createClient({ esAdmin: true })
    createSupabaseServerClient.mockResolvedValue(client)

    await expect(ConfiguracionGruposPage()).resolves.toBeTruthy()
    expect(client.rpc).toHaveBeenCalledWith('es_superadmin', { p_auth_uid: internalUserId })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('redirects a person who is not admin or pastor', async () => {
    createSupabaseServerClient.mockResolvedValue(createClient({ esAdmin: false }))

    await expect(ConfiguracionGruposPage()).rejects.toThrow('redirect:/grupos-vida')
  })

  it('redirects a session without a usuarios row without asking es_superadmin', async () => {
    const client = createClient({ esAdmin: true, internalId: null })
    createSupabaseServerClient.mockResolvedValue(client)

    await expect(ConfiguracionGruposPage()).rejects.toThrow('redirect:/grupos-vida')
    expect(client.rpc).not.toHaveBeenCalledWith('es_superadmin', expect.anything())
  })
})
