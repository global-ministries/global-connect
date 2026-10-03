import { listarSolicitudesPendientes } from '@/lib/actions/solicitudes-grupo.actions'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()
const getUserWithRoles = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (client: unknown) => getUserWithRoles(client) }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const authId = '11111111-1111-1111-1111-111111111111'
const pendingRequest = { id: 's1', tipo: 'ingreso', estado: 'pendiente', creado_en: '2026-01-01' }

type RpcResult = { data: unknown; error: null | { message: string } }

/** A client whose queries all resolve to `rows` and whose rpc answers `rpcResult`. */
function createClient(rows: unknown[], rpcResult: RpcResult = { data: 0, error: null }) {
  const query: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'neq', 'in', 'order', 'limit']) query[method] = jest.fn(() => query)
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve)
  return {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: authId } } })) },
    rpc: jest.fn(async () => rpcResult),
    from: jest.fn(() => query),
  }
}

// expirar_solicitudes_vencidas expires overdue requests in every group, so only
// the service client may run it (20261003110000 took it away from signed-in
// sessions).
describe('listarSolicitudesPendientes expiring overdue requests', () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset()
    createSupabaseAdminClient.mockReset()
    getUserWithRoles.mockReset()
    getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: ['lider'] })
  })

  it('expires them with the service client, never with the session client', async () => {
    const session = createClient([pendingRequest])
    const service = createClient([])
    createSupabaseServerClient.mockResolvedValue(session)
    createSupabaseAdminClient.mockReturnValue(service)

    const result = await listarSolicitudesPendientes()

    expect(result.success).toBe(true)
    expect(service.rpc).toHaveBeenCalledWith('expirar_solicitudes_vencidas')
    expect(session.rpc).not.toHaveBeenCalledWith('expirar_solicitudes_vencidas')
  })

  it('still lists the pending requests, and logs the error, when expiring fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    createSupabaseServerClient.mockResolvedValue(createClient([pendingRequest]))
    createSupabaseAdminClient.mockReturnValue(createClient([], { data: null, error: { message: 'connection reset' } }))

    const result = await listarSolicitudesPendientes()

    expect(result.success).toBe(true)
    expect(result.data).toEqual([expect.objectContaining({ id: 's1' })])
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('expirar_solicitudes_vencidas'), 'connection reset')
    errorSpy.mockRestore()
  })
})
