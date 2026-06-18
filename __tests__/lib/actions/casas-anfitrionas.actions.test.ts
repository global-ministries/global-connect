import { actualizarCasaAnfitriona, cambiarEstadoCasaAnfitriona, crearCasaAnfitriona, listarCasasAnfitrionas, obtenerDireccionUsuario, obtenerRelacionesFamiliares, procesarAprobacionCasa } from '@/lib/actions/casas-anfitrionas.actions'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))

const [authId, actorUserId, targetUserId, coHostUserId, casaId] = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555']

describe('casas anfitrionas server actions permissions', () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset()
    createSupabaseAdminClient.mockReset()
    revalidatePath.mockReset()
  })

  it('denies create-for-another before any admin write when the granular RPC rejects the target owner', async () => {
    const rpc = createPermissionRpcMock({ createFor: false })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))

    const result = await crearCasaAnfitriona(createCasaInput({ usuario_id: targetUserId }))

    expect(result).toEqual({ success: false, error: 'No tienes permisos para crear una casa para este usuario' })
    expect(rpc).toHaveBeenCalledWith('puede_crear_casa_anfitriona_para', { p_auth_id: authId, p_usuario_id: targetUserId })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('validates co-host scope before creating a house', async () => {
    const rpc = createPermissionRpcMock({ createFor: true, coHost: false })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))

    const result = await crearCasaAnfitriona(createCasaInput({ co_anfitrion_id: coHostUserId }))

    expect(result).toEqual({ success: false, error: 'No tienes permisos para asignar este co-anfitrión' })
    expect(rpc).toHaveBeenCalledWith('puede_crear_casa_anfitriona_para', { p_auth_id: authId, p_usuario_id: actorUserId })
    expect(rpc).toHaveBeenCalledWith('puede_crear_casa_anfitriona_para', { p_auth_id: authId, p_usuario_id: coHostUserId })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('denies approval before invoking the approval mutation RPC', async () => {
    const rpc = createPermissionRpcMock({ approve: false })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))

    const result = await procesarAprobacionCasa(casaId, 'aprobar')

    expect(result).toEqual({ success: false, error: 'No tienes permisos para aprobar o rechazar esta casa' })
    expect(rpc).toHaveBeenCalledWith('puede_aprobar_casa_anfitriona', { p_auth_id: authId, p_casa_id: casaId })
    expect(rpc).not.toHaveBeenCalledWith('procesar_aprobacion_casa_anfitriona', expect.anything())
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('denies edits before reading or writing with the admin client', async () => {
    const rpc = createPermissionRpcMock({ edit: false })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))

    const result = await actualizarCasaAnfitriona(casaId, { nombre_lugar: 'Casa nueva' })

    expect(result).toEqual({ success: false, error: 'No tienes permisos para editar esta casa' })
    expect(rpc).toHaveBeenCalledWith('puede_editar_casa_anfitriona', { p_auth_id: authId, p_casa_id: casaId })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('returns approved sensitive edits to pending review when saving', async () => {
    const rpc = createPermissionRpcMock({ edit: true })
    const adminDb = createAdminClient({ existingCasa: { usuario_id: targetUserId, direccion_id: null, aprobada: true } })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(adminDb)

    const result = await actualizarCasaAnfitriona(casaId, { capacidad_maxima: 20 })

    expect(result).toEqual({ success: true })
    expect(adminDb.updateCasasAnfitrionas).toHaveBeenCalledWith(expect.objectContaining({
      capacidad_maxima: 20,
      aprobada: false,
      aprobada_en: null,
      aprobada_por: null,
    }))
    expect(revalidatePath).toHaveBeenCalledWith(`/grupos-vida/casas-anfitrionas/${casaId}`)
  })

  it('filters the list by RPC-visible house ids before returning enriched rows', async () => {
    const visibleCasaIds = [casaId]
    const rpc = createPermissionRpcMock({ visibleCasaIds })
    const listQuery = createListQuery([{ id: casaId, nombre_lugar: 'Casa visible' }])
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc, casasQuery: listQuery }))

    const result = await listarCasasAnfitrionas()

    expect(result).toEqual({ success: true, data: [{ id: casaId, nombre_lugar: 'Casa visible' }] })
    expect(rpc).toHaveBeenCalledWith('obtener_casas_visibles_ids', { p_auth_id: authId })
    expect(listQuery.in).toHaveBeenCalledWith('id', visibleCasaIds)
  })

  it('denies active-state changes before writing when the granular RPC rejects the house', async () => {
    const rpc = createPermissionRpcMock({ changeState: false })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))

    const result = await cambiarEstadoCasaAnfitriona(casaId, false)

    expect(result).toEqual({ success: false, error: 'No tienes permisos para cambiar el estado de esta casa' })
    expect(rpc).toHaveBeenCalledWith('puede_cambiar_estado_casa_anfitriona', { p_auth_id: authId, p_casa_id: casaId })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('denies family relationship reads before using the admin client when the target user is out of scope', async () => {
    const rpc = createPermissionRpcMock({ createFor: false })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))

    const result = await obtenerRelacionesFamiliares(targetUserId)

    expect(result).toEqual({ success: false, error: 'No tienes permisos para consultar este usuario' })
    expect(rpc).toHaveBeenCalledWith('puede_crear_casa_anfitriona_para', { p_auth_id: authId, p_usuario_id: targetUserId })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('denies user address reads before using the admin client when the target user is out of scope', async () => {
    const rpc = createPermissionRpcMock({ createFor: false })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))

    const result = await obtenerDireccionUsuario(targetUserId)

    expect(result).toEqual({ success: false, error: 'No tienes permisos para consultar este usuario' })
    expect(rpc).toHaveBeenCalledWith('puede_crear_casa_anfitriona_para', { p_auth_id: authId, p_usuario_id: targetUserId })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })
})

function createCasaInput(overrides: Record<string, unknown> = {}) {
  return { nombre_lugar: 'Casa de Ana', calle: 'Calle 1', capacidad_maxima: 12, ...overrides }
}

function createPermissionRpcMock(input: {
  approve?: boolean
  changeState?: boolean
  coHost?: boolean
  createFor?: boolean
  edit?: boolean
  visibleCasaIds?: string[]
}) {
  return jest.fn((rpcName: string, args: Record<string, unknown>) => {
    if (rpcName === 'puede_crear_casa_anfitriona_para') {
      return Promise.resolve({ data: args.p_usuario_id === coHostUserId ? input.coHost : input.createFor, error: null })
    }
    if (rpcName === 'puede_aprobar_casa_anfitriona') return Promise.resolve({ data: input.approve, error: null })
    if (rpcName === 'puede_editar_casa_anfitriona') return Promise.resolve({ data: input.edit, error: null })
    if (rpcName === 'puede_cambiar_estado_casa_anfitriona') return Promise.resolve({ data: input.changeState, error: null })
    if (rpcName === 'obtener_casas_visibles_ids') return Promise.resolve({ data: input.visibleCasaIds ?? [], error: null })
    if (rpcName === 'procesar_aprobacion_casa_anfitriona') return Promise.resolve({ data: { ok: true, estado: 'aprobada' }, error: null })
    return Promise.resolve({ data: false, error: null })
  })
}

function createServerClient(input: { rpc: jest.Mock; casasQuery?: unknown }) {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: authId } }, error: null }) },
    from: jest.fn((table: string) => {
      if (table === 'usuarios') return createUsuarioQuery()
      if (table === 'casas_anfitrionas' && input.casasQuery) return input.casasQuery
      throw new Error(`Unexpected server table ${table}`)
    }),
    rpc: input.rpc,
  }
}

function createUsuarioQuery() {
  return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { id: actorUserId }, error: null }) }) }) }
}

function createListQuery(rows: unknown[]) {
  return {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: rows, error: null }),
  }
}

function createAdminClient(input: { existingCasa: { usuario_id: string; direccion_id: string | null; aprobada: boolean } }) {
  const updateCasasAnfitrionas = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) })
  return {
    updateCasasAnfitrionas,
    from: jest.fn((table: string) => {
      if (table === 'casas_anfitrionas') {
        return {
          update: updateCasasAnfitrionas,
          select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: input.existingCasa, error: null }) }) }),
        }
      }
      throw new Error(`Unexpected admin table ${table}`)
    }),
  }
}
