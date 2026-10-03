import { geocodificarDireccionesMasivo } from '@/lib/actions/geocodificar.actions'

const createSupabaseServerClient = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))

const authId = '11111111-1111-1111-1111-111111111111'
const internalUserId = '22222222-2222-2222-2222-222222222222'

function createClient(options: { esAdmin: boolean; internalId?: string | null }) {
  const rpc = jest.fn(async (name: string, args?: { p_auth_uid?: string }) => {
    if (name === 'get_my_internal_id') return { data: options.internalId === undefined ? internalUserId : options.internalId, error: null }
    if (name === 'es_superadmin') return { data: options.esAdmin && args?.p_auth_uid === internalUserId, error: null }
    return { data: null, error: null }
  })
  const query: Record<string, unknown> = {}
  for (const method of ['select', 'or', 'limit']) query[method] = jest.fn(() => query)
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
  return {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: authId } }, error: null })) },
    rpc,
    from: jest.fn(() => query),
  }
}

describe('geocodificarDireccionesMasivo permission check', () => {
  it('asks es_superadmin about the internal person id, not the session id', async () => {
    const client = createClient({ esAdmin: true })
    createSupabaseServerClient.mockResolvedValue(client)

    const result = await geocodificarDireccionesMasivo(10)

    expect(client.rpc).toHaveBeenCalledWith('es_superadmin', { p_auth_uid: internalUserId })
    expect(client.rpc).not.toHaveBeenCalledWith('es_superadmin', { p_auth_uid: authId })
    expect(result.success).toBe(true)
  })

  it('denies a person who is not admin or pastor', async () => {
    const client = createClient({ esAdmin: false })
    createSupabaseServerClient.mockResolvedValue(client)

    const result = await geocodificarDireccionesMasivo(10)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Solo administradores pueden ejecutar la geocodificación masiva')
    expect(client.from).not.toHaveBeenCalled()
  })

  it('denies a session without a usuarios row', async () => {
    const client = createClient({ esAdmin: true, internalId: null })
    createSupabaseServerClient.mockResolvedValue(client)

    const result = await geocodificarDireccionesMasivo(10)

    expect(result.success).toBe(false)
    expect(client.rpc).not.toHaveBeenCalledWith('es_superadmin', expect.anything())
  })
})
