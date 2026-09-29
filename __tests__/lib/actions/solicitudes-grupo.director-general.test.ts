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
const visibleInactiveGroupId = '44444444-4444-4444-4444-444444444444'

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

function createAdminClient(logs: QueryLog[], options: { visibleGroupIds: string[]; activeGroupIds: string[] }) {
  return {
    rpc: jest.fn(async (name: string) => (
      name === 'gdv_dg_grupos_visibles' ? { data: options.visibleGroupIds, error: null } : { data: null, error: null }
    )),
    from: jest.fn((table: string) => {
      if (table === 'director_general_segmentos' || table === 'dg_directores_etapa') {
        throw new Error(`${table} must not be read to decide which groups a director general sees`)
      }
      const log: QueryLog = { table, calls: [] }
      logs.push(log)
      if (table === 'usuarios') return createQuery(log, { data: { id: internalUserId }, error: null })
      if (table === 'grupos') return createQuery(log, { data: options.activeGroupIds.map((id) => ({ id })), error: null })
      return createQuery(log)
    }),
  }
}

const listers = [
  { name: 'listarSolicitudesPendientes', run: listarSolicitudesPendientes, groupsTable: 'v_solicitudes_pendientes', onAdmin: false },
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

  it('asks the single database rule for the groups and keeps only the active ones', async () => {
    const adminDb = createAdminClient(adminLogs, {
      visibleGroupIds: [visibleActiveGroupId, visibleInactiveGroupId],
      activeGroupIds: [visibleActiveGroupId],
    })
    createSupabaseAdminClient.mockReturnValue(adminDb)
    getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: ['director-general'] })

    const result = await run()

    expect(result.success).toBe(true)
    expect(adminDb.rpc).toHaveBeenCalledWith('gdv_dg_grupos_visibles', { p_usuario_id: internalUserId })
    const activeLookup = adminLogs.find((log) => log.table === 'grupos')
    expect(activeLookup?.calls).toEqual(expect.arrayContaining([
      ['in', ['id', [visibleActiveGroupId, visibleInactiveGroupId]]],
      ['eq', ['activo', true]],
    ]))
    const [request] = requestLogs()
    expect(request.calls).toEqual(expect.arrayContaining([['in', ['grupo_id', [visibleActiveGroupId]]]]))
  })

  it('returns nothing, without querying requests, when the rule returns no groups', async () => {
    const adminDb = createAdminClient(adminLogs, { visibleGroupIds: [], activeGroupIds: [] })
    createSupabaseAdminClient.mockReturnValue(adminDb)
    getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: ['director-general'] })

    const result = await run()

    expect(result).toEqual({ success: true, data: [] })
    expect(requestLogs()).toHaveLength(0)
  })

  it('returns nothing when the rule returns groups but none of them is active', async () => {
    const adminDb = createAdminClient(adminLogs, { visibleGroupIds: [visibleInactiveGroupId], activeGroupIds: [] })
    createSupabaseAdminClient.mockReturnValue(adminDb)
    getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: ['director-general'] })

    const result = await run()

    expect(result).toEqual({ success: true, data: [] })
    expect(requestLogs()).toHaveLength(0)
  })

  it.each(['admin', 'pastor'])('does not scope %s and never asks the director general rule', async (role) => {
    const adminDb = createAdminClient(adminLogs, { visibleGroupIds: [visibleActiveGroupId], activeGroupIds: [visibleActiveGroupId] })
    createSupabaseAdminClient.mockReturnValue(adminDb)
    getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: [role] })

    const result = await run()

    expect(result.success).toBe(true)
    expect(adminDb.rpc).not.toHaveBeenCalledWith('gdv_dg_grupos_visibles', expect.anything())
    const [request] = requestLogs()
    expect(request.calls.some(([method, args]) => method === 'in' && args[0] === 'grupo_id')).toBe(false)
  })
})
