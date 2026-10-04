import { listarSolicitudesCompletadas, listarSolicitudesPendientes } from '@/lib/actions/solicitudes-grupo.actions'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()
const getUserWithRoles = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (client: unknown) => getUserWithRoles(client) }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const authId = '11111111-1111-1111-1111-111111111111'
const internalUserId = '22222222-2222-2222-2222-222222222222'
const visibleActiveGroupId = '33333333-3333-3333-3333-333333333333'

type QueryLog = { table: string; calls: Array<[string, unknown[]]> }

/** A chainable, awaitable query builder that records every call made on it. */
function createQuery(log: QueryLog, result: { data: unknown; error: null | { message: string } } = { data: [], error: null }) {
  const query: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'neq', 'in', 'order', 'limit']) {
    query[method] = jest.fn((...args: unknown[]) => {
      log.calls.push([method, args])
      return query
    })
  }
  query.single = jest.fn(async () => result)
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return query
}

function createServerClient(logs: QueryLog[]) {
  return {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: authId } } })) },
    rpc: jest.fn(async () => ({ data: null, error: null })),
    from: jest.fn((table: string) => {
      const log: QueryLog = { table, calls: [] }
      logs.push(log)
      return createQuery(log)
    }),
  }
}

function createAdminClient(
  logs: QueryLog[],
  options: { activeVisibleGroupIds: string[]; userFound?: boolean; rpcError?: { message: string } },
) {
  return {
    rpc: jest.fn(async (name: string) => {
      if (name !== 'gdv_dg_grupos_activos_visibles') return { data: null, error: null }
      if (options.rpcError) return { data: null, error: options.rpcError }
      return { data: options.activeVisibleGroupIds, error: null }
    }),
    from: jest.fn((table: string) => {
      if (table === 'director_general_segmentos' || table === 'dg_directores_etapa' || table === 'grupos') {
        throw new Error(`${table} must not be read to decide which groups a director general sees`)
      }
      const log: QueryLog = { table, calls: [] }
      logs.push(log)
      if (table === 'usuarios') return createQuery(log, { data: options.userFound === false ? null : { id: internalUserId }, error: null })
      return createQuery(log)
    }),
  }
}

const listers = [
  { name: 'listarSolicitudesPendientes', run: listarSolicitudesPendientes, groupsTable: 'v_solicitudes_pendientes', onAdmin: true },
  { name: 'listarSolicitudesCompletadas', run: listarSolicitudesCompletadas, groupsTable: 'solicitudes_grupo', onAdmin: true },
] as const

describe.each(listers)('$name scoping of the director general', ({ run, groupsTable, onAdmin }) => {
  let serverLogs: QueryLog[]
  let adminLogs: QueryLog[]

  beforeEach(() => {
    serverLogs = []
    adminLogs = []
    createSupabaseServerClient.mockReset()
    createSupabaseAdminClient.mockReset()
    getUserWithRoles.mockReset()
    createSupabaseServerClient.mockResolvedValue(createServerClient(serverLogs))
  })

  const requestLogs = () => (onAdmin ? adminLogs : serverLogs).filter((log) => log.table === groupsTable)

  it('asks the single database rule once for the active groups and filters requests by them', async () => {
    const adminDb = createAdminClient(adminLogs, { activeVisibleGroupIds: [visibleActiveGroupId] })
    createSupabaseAdminClient.mockReturnValue(adminDb)
    getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: ['director-general'] })

    const result = await run()

    expect(result.success).toBe(true)
    expect(adminDb.rpc.mock.calls.filter(([name]) => name === 'gdv_dg_grupos_activos_visibles')).toHaveLength(1)
    expect(adminDb.rpc).toHaveBeenCalledWith('gdv_dg_grupos_activos_visibles', { p_usuario_id: internalUserId })
    const [request] = requestLogs()
    expect(request.calls).toEqual(expect.arrayContaining([['in', ['grupo_id', [visibleActiveGroupId]]]]))
  })

  it('returns nothing, without querying requests, when the rule returns no active groups', async () => {
    const adminDb = createAdminClient(adminLogs, { activeVisibleGroupIds: [] })
    createSupabaseAdminClient.mockReturnValue(adminDb)
    getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: ['director-general'] })

    const result = await run()

    expect(result).toEqual({ success: true, data: [] })
    expect(requestLogs()).toHaveLength(0)
  })

  it('fails closed with an empty list when the internal user is not found', async () => {
    const adminDb = createAdminClient(adminLogs, { activeVisibleGroupIds: [visibleActiveGroupId], userFound: false })
    createSupabaseAdminClient.mockReturnValue(adminDb)
    getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: ['director-general'] })

    const result = await run()

    expect(result).toEqual({ success: true, data: [] })
    expect(adminDb.rpc).not.toHaveBeenCalledWith('gdv_dg_grupos_activos_visibles', expect.anything())
    expect(requestLogs()).toHaveLength(0)
  })

  it('reports a failure, and logs it, when the rule cannot be evaluated', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const adminDb = createAdminClient(adminLogs, { activeVisibleGroupIds: [], rpcError: { message: 'connection reset' } })
    createSupabaseAdminClient.mockReturnValue(adminDb)
    getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: ['director-general'] })

    const result = await run()

    expect(result).toEqual({ success: false, error: 'No se pudieron obtener los grupos del director general' })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('gdv_dg_grupos_activos_visibles'), 'connection reset')
    expect(requestLogs()).toHaveLength(0)
    errorSpy.mockRestore()
  })

  it.each(['admin', 'pastor'])('does not scope %s and never asks the director general rule', async (role) => {
    const adminDb = createAdminClient(adminLogs, { activeVisibleGroupIds: [visibleActiveGroupId] })
    createSupabaseAdminClient.mockReturnValue(adminDb)
    getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: [role] })

    const result = await run()

    expect(result.success).toBe(true)
    expect(adminDb.rpc).not.toHaveBeenCalledWith('gdv_dg_grupos_activos_visibles', expect.anything())
    const [request] = requestLogs()
    expect(request.calls.some(([method, args]) => method === 'in' && args[0] === 'grupo_id')).toBe(false)
  })
})
