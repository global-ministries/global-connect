import { REVIEW_DECISION_NOTES_MAX_LENGTH } from '@/lib/casas-anfitrionas/review-constants'
import { actualizarCasaAnfitriona, asignarCasaAnfitrionaAGrupo, cambiarEstadoCasaAnfitriona, crearCasaAnfitriona, listarCasasAnfitrionas, obtenerCasasRevisionPendiente, obtenerDatosMapaGruposHostHomes, obtenerDireccionUsuario, obtenerGruposSinCasaAnfitriona, obtenerMapaMiembros, obtenerRelacionesFamiliares, procesarAprobacionCasa, procesarRevisionUbicacionCasa } from '@/lib/actions/casas-anfitrionas.actions'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))

const [authId, actorUserId, targetUserId, coHostUserId, casaId, groupId, reviewId, otherGroupId] = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888']

describe('casas anfitrionas server actions permissions', () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset()
    createSupabaseAdminClient.mockReset()
    revalidatePath.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
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

  it('rejects owners who only have inactive or deleted group membership', async () => {
    const rpc = createPermissionRpcMock({ createFor: true })
    const adminDb = createAdminClient({ activeGroupMemberIds: [] })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(adminDb)

    const result = await crearCasaAnfitriona(createCasaInput({ usuario_id: targetUserId }))

    expect(result).toEqual({ success: false, error: 'El propietario debe pertenecer actualmente a un grupo de vida' })
    expect(adminDb.grupoMiembrosQuery.eq).toHaveBeenCalledWith('usuario_id', targetUserId)
    expect(adminDb.grupoMiembrosQuery.eq).toHaveBeenCalledWith('grupos.activo', true)
    expect(adminDb.grupoMiembrosQuery.eq).toHaveBeenCalledWith('grupos.eliminado', false)
    expect(adminDb.insertDireccion).not.toHaveBeenCalled()
  })

  it('rejects co-hosts who only have inactive or deleted group membership', async () => {
    const rpc = createPermissionRpcMock({ createFor: true, coHost: true })
    const adminDb = createAdminClient({ activeGroupMemberIds: [actorUserId] })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(adminDb)

    const result = await crearCasaAnfitriona(createCasaInput({ co_anfitrion_id: coHostUserId }))

    expect(result).toEqual({ success: false, error: 'El co-anfitrión debe pertenecer actualmente a un grupo de vida' })
    expect(adminDb.grupoMiembrosQuery.eq).toHaveBeenCalledWith('usuario_id', actorUserId)
    expect(adminDb.grupoMiembrosQuery.eq).toHaveBeenCalledWith('usuario_id', coHostUserId)
    expect(adminDb.grupoMiembrosQuery.eq).toHaveBeenCalledWith('grupos.activo', true)
    expect(adminDb.grupoMiembrosQuery.eq).toHaveBeenCalledWith('grupos.eliminado', false)
    expect(adminDb.insertDireccion).not.toHaveBeenCalled()
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

  it('rejects invalid map scope before calling an RPC or admin client', async () => {
    const rpc = createPermissionRpcMock({ roles: ['admin'] })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))

    const result = await obtenerDatosMapaGruposHostHomes({ scope: 'historical' })

    expect(result).toEqual({ success: false, error: 'Scope inválido' })
    expect(rpc).not.toHaveBeenCalled()
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('wraps read-only casas map RPCs with actor auth through the service-role read client', async () => {
    const serverRpc = createPermissionRpcMock({
      roles: ['admin'],
    })
    const adminRpc = createPermissionRpcMock({
      hostHomeMapRows: [createHostHomeMapRow()],
      missingHostHomeRows: [createMissingHostHomeRow()],
      pendingReviewRows: [createPendingReviewRow()],
      memberMapRows: [createMemberMapRow()],
    })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc: serverRpc }))
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc: adminRpc }))

    await expect(obtenerDatosMapaGruposHostHomes({ scope: 'planned' })).resolves.toEqual({ success: true, data: [createHostHomeMapRow()] })
    await expect(obtenerGruposSinCasaAnfitriona({ scope: 'active' })).resolves.toEqual({ success: true, data: [createMissingHostHomeRow()] })
    await expect(obtenerCasasRevisionPendiente()).resolves.toEqual({ success: true, data: [createPendingReviewRow()] })
    await expect(obtenerMapaMiembros({ scope: 'planned' })).resolves.toEqual({ success: true, data: [createMemberMapRow()] })
    expect(createSupabaseServerClient).toHaveBeenCalledTimes(4)
    expect(serverRpc).toHaveBeenCalledWith('obtener_roles_usuario', { p_auth_id: authId })
    expect(serverRpc).toHaveBeenCalledTimes(3)
    expect(serverRpc).not.toHaveBeenCalledWith('obtener_mapa_grupos_vida_host_homes', expect.anything())
    expect(serverRpc).not.toHaveBeenCalledWith('obtener_grupos_sin_casa_anfitriona', expect.anything())
    expect(serverRpc).not.toHaveBeenCalledWith('obtener_casas_revision_pendiente', expect.anything())
    expect(serverRpc).not.toHaveBeenCalledWith('obtener_mapa_miembros', expect.anything())
    expect(adminRpc).toHaveBeenCalledWith('obtener_mapa_grupos_vida_host_homes', { p_auth_id: authId, p_scope: 'planned' })
    expect(adminRpc).toHaveBeenCalledWith('obtener_grupos_sin_casa_anfitriona', { p_auth_id: authId, p_scope: 'active' })
    expect(adminRpc).toHaveBeenCalledWith('obtener_casas_revision_pendiente', { p_auth_id: authId })
    expect(adminRpc).toHaveBeenCalledWith('obtener_mapa_miembros', { p_auth_id: authId, p_scope: 'planned' })
    expect(adminRpc).toHaveBeenCalledTimes(4)
    expect(adminRpc).not.toHaveBeenCalledWith('obtener_roles_usuario', expect.anything())
    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(4)
  })

  it('falls back to the authenticated server RPC for read-only casas map actions when the service-role client is unavailable', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const rpc = createPermissionRpcMock({
      roles: ['admin'],
      hostHomeMapRows: [createHostHomeMapRow()],
      missingHostHomeRows: [createMissingHostHomeRow()],
      pendingReviewRows: [createPendingReviewRow()],
      memberMapRows: [createMemberMapRow()],
    })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockImplementation(() => { throw new Error('service role secret missing') })

    await expect(obtenerDatosMapaGruposHostHomes({ scope: 'active' })).resolves.toEqual({ success: true, data: [createHostHomeMapRow()] })
    await expect(obtenerGruposSinCasaAnfitriona({ scope: 'active' })).resolves.toEqual({ success: true, data: [createMissingHostHomeRow()] })
    await expect(obtenerCasasRevisionPendiente()).resolves.toEqual({ success: true, data: [createPendingReviewRow()] })
    await expect(obtenerMapaMiembros({ scope: 'active' })).resolves.toEqual({ success: true, data: [createMemberMapRow()] })

    expect(rpc).toHaveBeenCalledWith('obtener_mapa_grupos_vida_host_homes', { p_auth_id: authId, p_scope: 'active' })
    expect(rpc).toHaveBeenCalledWith('obtener_grupos_sin_casa_anfitriona', { p_auth_id: authId, p_scope: 'active' })
    expect(rpc).toHaveBeenCalledWith('obtener_casas_revision_pendiente', { p_auth_id: authId })
    expect(rpc).toHaveBeenCalledWith('obtener_mapa_miembros', { p_auth_id: authId, p_scope: 'active' })
    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(4)
    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.actions]', expect.objectContaining({ phase: 'admin_client_setup' }))
  })

  it('falls back to the authenticated server RPC for read-only casas map actions when service-role RPC execution fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const serverRpc = createPermissionRpcMock({
      roles: ['admin'],
      hostHomeMapRows: [createHostHomeMapRow()],
      missingHostHomeRows: [createMissingHostHomeRow()],
      pendingReviewRows: [createPendingReviewRow()],
      memberMapRows: [createMemberMapRow()],
    })
    const adminRpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'Invalid API key' } })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc: serverRpc }))
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc: adminRpc }))

    await expect(obtenerDatosMapaGruposHostHomes({ scope: 'active' })).resolves.toEqual({ success: true, data: [createHostHomeMapRow()] })
    await expect(obtenerGruposSinCasaAnfitriona({ scope: 'active' })).resolves.toEqual({ success: true, data: [createMissingHostHomeRow()] })
    await expect(obtenerCasasRevisionPendiente()).resolves.toEqual({ success: true, data: [createPendingReviewRow()] })
    await expect(obtenerMapaMiembros({ scope: 'active' })).resolves.toEqual({ success: true, data: [createMemberMapRow()] })

    expect(adminRpc).toHaveBeenCalledWith('obtener_mapa_grupos_vida_host_homes', { p_auth_id: authId, p_scope: 'active' })
    expect(adminRpc).toHaveBeenCalledWith('obtener_grupos_sin_casa_anfitriona', { p_auth_id: authId, p_scope: 'active' })
    expect(adminRpc).toHaveBeenCalledWith('obtener_casas_revision_pendiente', { p_auth_id: authId })
    expect(adminRpc).toHaveBeenCalledWith('obtener_mapa_miembros', { p_auth_id: authId, p_scope: 'active' })
    expect(serverRpc).toHaveBeenCalledWith('obtener_mapa_grupos_vida_host_homes', { p_auth_id: authId, p_scope: 'active' })
    expect(serverRpc).toHaveBeenCalledWith('obtener_grupos_sin_casa_anfitriona', { p_auth_id: authId, p_scope: 'active' })
    expect(serverRpc).toHaveBeenCalledWith('obtener_casas_revision_pendiente', { p_auth_id: authId })
    expect(serverRpc).toHaveBeenCalledWith('obtener_mapa_miembros', { p_auth_id: authId, p_scope: 'active' })
    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(4)
    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.actions]', expect.objectContaining({ phase: 'rpc_error' }))
  })

  it('rejects authenticated auth users without an internal usuario on read-only casas map actions', async () => {
    const rpc = createPermissionRpcMock({
      roles: ['admin'],
      hostHomeMapRows: [createHostHomeMapRow()],
      missingHostHomeRows: [createMissingHostHomeRow()],
      pendingReviewRows: [createPendingReviewRow()],
      memberMapRows: [createMemberMapRow()],
    })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc, internalUserId: null }))

    await expect(obtenerDatosMapaGruposHostHomes({ scope: 'planned' })).resolves.toEqual({ success: false, error: 'Usuario no encontrado' })
    await expect(obtenerGruposSinCasaAnfitriona({ scope: 'active' })).resolves.toEqual({ success: false, error: 'Usuario no encontrado' })
    await expect(obtenerCasasRevisionPendiente()).resolves.toEqual({ success: false, error: 'Usuario no encontrado' })
    await expect(obtenerMapaMiembros({ scope: 'planned' })).resolves.toEqual({ success: false, error: 'Usuario no encontrado' })

    expect(rpc).not.toHaveBeenCalledWith('obtener_roles_usuario', expect.anything())
    expect(rpc).not.toHaveBeenCalledWith('obtener_mapa_grupos_vida_host_homes', expect.anything())
    expect(rpc).not.toHaveBeenCalledWith('obtener_grupos_sin_casa_anfitriona', expect.anything())
    expect(rpc).not.toHaveBeenCalledWith('obtener_casas_revision_pendiente', expect.anything())
    expect(rpc).not.toHaveBeenCalledWith('obtener_mapa_miembros', expect.anything())
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('returns an empty missing-host-home dashboard queue for ordinary members without invoking the queue RPC', async () => {
    const rpc = createPermissionRpcMock({ roles: ['miembro'], missingHostHomeRows: [createMissingHostHomeRow()] })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))

    await expect(obtenerGruposSinCasaAnfitriona({ scope: 'active' })).resolves.toEqual({ success: true, data: [] })

    expect(rpc).toHaveBeenCalledWith('obtener_roles_usuario', { p_auth_id: authId })
    expect(rpc).not.toHaveBeenCalledWith('obtener_grupos_sin_casa_anfitriona', expect.anything())
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('loads missing-host-home dashboard rows when role RPC returns nested role arrays', async () => {
    const rpc = createPermissionRpcMock({ roles: [['admin']], missingHostHomeRows: [createMissingHostHomeRow()] })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc }))

    await expect(obtenerGruposSinCasaAnfitriona({ scope: 'active' })).resolves.toEqual({ success: true, data: [createMissingHostHomeRow()] })

    expect(rpc).toHaveBeenCalledWith('obtener_roles_usuario', { p_auth_id: authId })
    expect(rpc).toHaveBeenCalledWith('obtener_grupos_sin_casa_anfitriona', { p_auth_id: authId, p_scope: 'active' })
    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['scalar', 'admin'],
    ['object', { nombre_interno: 'admin' }],
  ])('does not authorize missing-host-home dashboard rows when role RPC returns a root %s payload', async (_shape, rolePayload) => {
    const rpc = createPermissionRpcMock({ missingHostHomeRows: [createMissingHostHomeRow()] })
    rpc.mockImplementation((rpcName: string, args: Record<string, unknown>) => {
      if (rpcName === 'obtener_roles_usuario') return Promise.resolve({ data: rolePayload, error: null })
      return createPermissionRpcMock({ missingHostHomeRows: [createMissingHostHomeRow()] })(rpcName, args)
    })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))

    await expect(obtenerGruposSinCasaAnfitriona({ scope: 'active' })).resolves.toEqual({ success: true, data: [] })

    expect(rpc).toHaveBeenCalledWith('obtener_roles_usuario', { p_auth_id: authId })
    expect(rpc).not.toHaveBeenCalledWith('obtener_grupos_sin_casa_anfitriona', expect.anything())
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it.each(['pastor', 'lider', 'miembro'])('returns no member map payload for %s without invoking the sensitive member RPC', async (role) => {
    const rpc = createPermissionRpcMock({ roles: [role], memberMapRows: [createMemberMapRow()] })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))

    await expect(obtenerMapaMiembros({ scope: 'active' })).resolves.toEqual({ success: true, data: [] })

    expect(rpc).toHaveBeenCalledWith('obtener_roles_usuario', { p_auth_id: authId })
    expect(rpc).not.toHaveBeenCalledWith('obtener_mapa_miembros', expect.anything())
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('keeps director-general missing-host-home rows authorized by the service-role RPC', async () => {
    const rpc = createPermissionRpcMock({
      roles: ['director-general'],
      missingHostHomeRows: [createMissingHostHomeRow()],
      directorGeneralCanViewGroups: { [groupId]: false },
    })
    const serverClient = createServerClient({ rpc })
    createSupabaseServerClient.mockResolvedValue(serverClient)
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc }))

    await expect(obtenerGruposSinCasaAnfitriona({ scope: 'active' })).resolves.toEqual({ success: true, data: [createMissingHostHomeRow()] })

    expect(rpc).toHaveBeenCalledWith('obtener_roles_usuario', { p_auth_id: authId })
    expect(rpc).toHaveBeenCalledWith('obtener_grupos_sin_casa_anfitriona', { p_auth_id: authId, p_scope: 'active' })
    expect(rpc).not.toHaveBeenCalledWith('casas_map_director_general_can_view_group', expect.anything())
    expect(serverClient.from).not.toHaveBeenCalledWith('grupo_miembros')
    expect(serverClient.from).not.toHaveBeenCalledWith('segmento_lideres')
    expect(serverClient.from).not.toHaveBeenCalledWith('director_etapa_grupos')
    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(1)
  })

  it.each(['admin', 'pastor', 'director-general'])('allows %s to request the pending-review dashboard queue', async (role) => {
    const rpc = createPermissionRpcMock({ roles: [role], pendingReviewRows: [createPendingReviewRow()] })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc }))

    await expect(obtenerCasasRevisionPendiente()).resolves.toEqual({ success: true, data: [createPendingReviewRow()] })

    expect(rpc).toHaveBeenCalledWith('obtener_roles_usuario', { p_auth_id: authId })
    expect(rpc).toHaveBeenCalledWith('obtener_casas_revision_pendiente', { p_auth_id: authId })
    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(1)
  })

  it.each(['miembro', 'lider', 'director-etapa'])('returns an empty pending-review dashboard queue for %s without invoking the queue RPC', async (role) => {
    const rpc = createPermissionRpcMock({ roles: [role], pendingReviewRows: [createPendingReviewRow()] })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))

    await expect(obtenerCasasRevisionPendiente()).resolves.toEqual({ success: true, data: [] })

    expect(rpc).toHaveBeenCalledWith('obtener_roles_usuario', { p_auth_id: authId })
    expect(rpc).not.toHaveBeenCalledWith('obtener_casas_revision_pendiente', expect.anything())
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('filters missing-host-home dashboard queue rows outside the leader led/related groups', async () => {
    const rpc = createPermissionRpcMock({ roles: ['lider'], missingHostHomeRows: [createMissingHostHomeRow()] })
    const serverClient = createServerClient({ rpc, leaderDashboardGroupIds: [] })
    createSupabaseServerClient.mockResolvedValue(serverClient)
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc }))

    await expect(obtenerGruposSinCasaAnfitriona({ scope: 'active' })).resolves.toEqual({ success: true, data: [] })

    expect(rpc).toHaveBeenCalledWith('obtener_roles_usuario', { p_auth_id: authId })
    expect(rpc).toHaveBeenCalledWith('obtener_grupos_sin_casa_anfitriona', { p_auth_id: authId, p_scope: 'active' })
    expect(serverClient.from).toHaveBeenCalledWith('grupo_miembros')
    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(1)
  })

  it('filters missing-host-home dashboard queue rows outside the director assigned scope', async () => {
    const rpc = createPermissionRpcMock({ roles: ['director-etapa'], missingHostHomeRows: [createMissingHostHomeRow()] })
    const serverClient = createServerClient({ rpc, directorDashboardGroupIds: [] })
    createSupabaseServerClient.mockResolvedValue(serverClient)
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc }))

    await expect(obtenerGruposSinCasaAnfitriona({ scope: 'active' })).resolves.toEqual({ success: true, data: [] })

    expect(rpc).toHaveBeenCalledWith('obtener_roles_usuario', { p_auth_id: authId })
    expect(rpc).toHaveBeenCalledWith('obtener_grupos_sin_casa_anfitriona', { p_auth_id: authId, p_scope: 'active' })
    expect(serverClient.from).toHaveBeenCalledWith('segmento_lideres')
    expect(serverClient.from).toHaveBeenCalledWith('director_etapa_grupos')
    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid assignment input before creating the service-role client', async () => {
    const rpc = createPermissionRpcMock({ roles: ['admin'] })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))

    const result = await asignarCasaAnfitrionaAGrupo({ groupId: 'not-a-uuid', casaId })

    expect(result).toEqual({ success: false, error: 'Grupo inválido' })
    expect(rpc).not.toHaveBeenCalled()
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('denies unauthenticated assignment and review mutations before creating the service-role client', async () => {
    const serverClient = createUnauthenticatedServerClient()
    createSupabaseServerClient.mockResolvedValue(serverClient)

    await expect(asignarCasaAnfitrionaAGrupo({ groupId, casaId })).resolves.toEqual({ success: false, error: 'Usuario no autenticado' })
    await expect(procesarRevisionUbicacionCasa({ reviewId, accion: 'aprobar' })).resolves.toEqual({ success: false, error: 'Usuario no autenticado' })
    expect(serverClient.rpc).not.toHaveBeenCalled()
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('rejects invalid review decisions before creating the service-role client', async () => {
    await expect(procesarRevisionUbicacionCasa({ reviewId: 'not-a-uuid', accion: 'aprobar' })).resolves.toEqual({ success: false, error: 'Revisión inválida' })
    await expect(procesarRevisionUbicacionCasa({ reviewId, accion: 'invalid-action' })).resolves.toEqual({ success: false, error: 'Acción inválida' })
    await expect(procesarRevisionUbicacionCasa({ reviewId, accion: 'rechazar', notas: 'x'.repeat(REVIEW_DECISION_NOTES_MAX_LENGTH + 1) })).resolves.toEqual({ success: false, error: 'Notas demasiado largas' })
    expect(createSupabaseServerClient).not.toHaveBeenCalled()
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('rejects non-finite and negative RPC count payloads as unexpected server responses', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const rpc = createPermissionRpcMock({ hostHomeMapRows: [{ ...createHostHomeMapRow(), total_miembros: 'not-a-number' }] })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc }))

    await expect(obtenerDatosMapaGruposHostHomes()).resolves.toEqual({ success: false, error: 'Respuesta inesperada del servidor' })

    rpc.mockImplementation((rpcName: string, args: Record<string, unknown>) => {
      if (rpcName === 'obtener_mapa_grupos_vida_host_homes') return Promise.resolve({ data: [{ ...createHostHomeMapRow(), total_miembros: -1 }], error: null })
      return createPermissionRpcMock({})(rpcName, args)
    })

    await expect(obtenerDatosMapaGruposHostHomes()).resolves.toEqual({ success: false, error: 'Respuesta inesperada del servidor' })
    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.actions]', expect.objectContaining({ rpcName: 'obtener_mapa_grupos_vida_host_homes', phase: 'parse_response' }))
  })

  it('rejects null and non-array RPC array payloads as unexpected server responses', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const rpc = createPermissionRpcMock({ roles: ['admin'] })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc }))

    rpc.mockImplementation((rpcName: string, args: Record<string, unknown>) => {
      if (rpcName === 'obtener_mapa_grupos_vida_host_homes') return Promise.resolve({ data: null, error: null })
      if (rpcName === 'obtener_roles_usuario') return Promise.resolve({ data: ['admin'], error: null })
      return createPermissionRpcMock({})(rpcName, args)
    })

    await expect(obtenerDatosMapaGruposHostHomes()).resolves.toEqual({ success: false, error: 'Respuesta inesperada del servidor' })

    rpc.mockImplementation((rpcName: string, args: Record<string, unknown>) => {
      if (rpcName === 'obtener_grupos_sin_casa_anfitriona') return Promise.resolve({ data: { grupo_id: groupId }, error: null })
      if (rpcName === 'obtener_roles_usuario') return Promise.resolve({ data: ['admin'], error: null })
      return createPermissionRpcMock({})(rpcName, args)
    })

    await expect(obtenerGruposSinCasaAnfitriona()).resolves.toEqual({ success: false, error: 'Respuesta inesperada del servidor' })
    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.actions]', expect.objectContaining({ rpcName: 'obtener_mapa_grupos_vida_host_homes', phase: 'parse_response' }))
    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.actions]', expect.objectContaining({ rpcName: 'obtener_grupos_sin_casa_anfitriona', phase: 'parse_response' }))
  })

  it('rejects undefined RPC array payloads as unexpected server responses with sanitized parse metadata', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const rpc = createPermissionRpcMock({ roles: ['admin'] })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc }))

    rpc.mockImplementation((rpcName: string, args: Record<string, unknown>) => {
      if (rpcName === 'obtener_casas_revision_pendiente') return Promise.resolve({ data: undefined, error: null })
      if (rpcName === 'obtener_roles_usuario') return Promise.resolve({ data: ['admin'], error: null })
      return createPermissionRpcMock({})(rpcName, args)
    })

    await expect(obtenerCasasRevisionPendiente()).resolves.toEqual({ success: false, error: 'Respuesta inesperada del servidor' })
    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.actions]', expect.objectContaining({
      rpcName: 'obtener_casas_revision_pendiente',
      phase: 'parse_response',
      error: { name: 'Error', message: 'Server action failure details redacted' },
    }))
  })

  it('uses service-role RPCs for authorized assignment and review mutations without admin table reads', async () => {
    const rpc = createPermissionRpcMock({ missingHostHomeRows: [createMissingHostHomeRow()], roles: ['admin'] })
    const adminRpc = jest.fn((rpcName: string, args: Record<string, unknown>) => {
      if (rpcName === 'asignar_casa_anfitriona_a_grupo') return Promise.resolve({ data: { ok: true, grupo_id: groupId, casa_id: casaId }, error: null })
      if (rpcName === 'procesar_revision_ubicacion_casa') return Promise.resolve({ data: { ok: true, accion: args.p_accion, review_id: args.p_review_id }, error: null })
      return Promise.resolve({ data: null, error: { message: `Unexpected admin RPC ${rpcName}` } })
    })
    const adminDb = createAdminClient({ rpc: adminRpc })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(adminDb)

    await expect(asignarCasaAnfitrionaAGrupo({ groupId, casaId })).resolves.toEqual({ success: true, data: { ok: true, grupo_id: groupId, casa_id: casaId } })
    await expect(procesarRevisionUbicacionCasa({ reviewId, accion: 'aprobar', notas: 'Coordenadas verificadas' })).resolves.toEqual({ success: true, data: { ok: true, accion: 'aprobar', review_id: reviewId } })
    await expect(procesarRevisionUbicacionCasa({ reviewId, accion: 'rechazar' })).resolves.toEqual({ success: true, data: { ok: true, accion: 'rechazar', review_id: reviewId } })
    expect(adminRpc).toHaveBeenCalledWith('asignar_casa_anfitriona_a_grupo', { p_auth_id: authId, p_grupo_id: groupId, p_casa_id: casaId })
    expect(adminRpc).toHaveBeenCalledWith('procesar_revision_ubicacion_casa', { p_auth_id: authId, p_review_id: reviewId, p_accion: 'aprobar', p_notas: 'Coordenadas verificadas' })
    expect(adminRpc).toHaveBeenCalledWith('procesar_revision_ubicacion_casa', { p_auth_id: authId, p_review_id: reviewId, p_accion: 'rechazar', p_notas: null })
    expect(adminDb.from).not.toHaveBeenCalled()
  })

  it('rejects assignment for a group that is no longer in the active missing-host-home queue before service-role mutation', async () => {
    const rpc = createPermissionRpcMock({ missingHostHomeRows: [], roles: ['admin'] })
    const adminRpc = jest.fn().mockResolvedValue({ data: { ok: true, grupo_id: groupId, casa_id: casaId }, error: null })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc: adminRpc }))

    const result = await asignarCasaAnfitrionaAGrupo({ groupId, casaId })

    expect(result).toEqual({ success: false, error: 'El grupo ya no está en la cola de asignación. Actualiza la página e inténtalo nuevamente.' })
    expect(rpc).toHaveBeenCalledWith('obtener_grupos_sin_casa_anfitriona', { p_auth_id: authId, p_scope: 'active' })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(adminRpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects assignment for an already-assigned or otherwise out-of-queue group id before service-role mutation', async () => {
    const rpc = createPermissionRpcMock({ missingHostHomeRows: [createMissingHostHomeRow({ grupo_id: otherGroupId })], roles: ['admin'] })
    const adminRpc = jest.fn().mockResolvedValue({ data: { ok: true, grupo_id: groupId, casa_id: casaId }, error: null })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc: adminRpc }))

    const result = await asignarCasaAnfitrionaAGrupo({ groupId, casaId })

    expect(result).toEqual({ success: false, error: 'El grupo ya no está en la cola de asignación. Actualiza la página e inténtalo nuevamente.' })
    expect(rpc).toHaveBeenCalledWith('obtener_grupos_sin_casa_anfitriona', { p_auth_id: authId, p_scope: 'active' })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(adminRpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns unauthorized service-role mutation failures without revalidating paths', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const rpc = createPermissionRpcMock({ missingHostHomeRows: [createMissingHostHomeRow()], roles: ['admin'] })
    const adminRpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'sin_permisos' } })
    const adminDb = createAdminClient({ rpc: adminRpc })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(adminDb)

    const result = await asignarCasaAnfitrionaAGrupo({ groupId, casaId })

    expect(result).toEqual({ success: false, error: 'No tienes permisos para realizar esta acción' })
    expect(adminRpc).toHaveBeenCalledWith('asignar_casa_anfitriona_a_grupo', { p_auth_id: authId, p_grupo_id: groupId, p_casa_id: casaId })
    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.actions]', expect.objectContaining({ rpcName: 'asignar_casa_anfitriona_a_grupo', phase: 'rpc_error' }))
    expect(adminDb.from).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('sanitizes unexpected RPC errors while logging the internal failure server-side', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const rpc = createPermissionRpcMock({ missingHostHomeRows: [createMissingHostHomeRow()], roles: ['admin'] })
    const adminRpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'database leaked internal table name casas_secretas' } })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc: adminRpc }))

    const result = await procesarRevisionUbicacionCasa({ reviewId, accion: 'rechazar' })

    expect(result).toEqual({ success: false, error: 'No pudimos completar la solicitud. Intenta nuevamente.' })
    expect(result.error).not.toContain('casas_secretas')
    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.actions]', expect.objectContaining({ rpcName: 'procesar_revision_ubicacion_casa', phase: 'rpc_error' }))
    expectConsoleErrorNotToContain(consoleError, 'casas_secretas')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns allowlisted domain messages for expected service-role RPC failures', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const rpc = createPermissionRpcMock({ missingHostHomeRows: [createMissingHostHomeRow()], roles: ['admin'] })
    const adminRpc = jest.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'casa_en_uso' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'estado_invalido' } })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc: adminRpc }))

    await expect(asignarCasaAnfitrionaAGrupo({ groupId, casaId })).resolves.toEqual({ success: false, error: 'La casa anfitriona ya está en uso' })
    await expect(procesarRevisionUbicacionCasa({ reviewId, accion: 'aprobar' })).resolves.toEqual({ success: false, error: 'El estado solicitado no es válido' })
    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.actions]', expect.objectContaining({ phase: 'rpc_error' }))
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('handles thrown service-role client setup failures without revalidating paths', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const rpc = createPermissionRpcMock({ missingHostHomeRows: [createMissingHostHomeRow()], roles: ['admin'] })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockImplementation(() => { throw new Error('service role secret missing') })

    const result = await asignarCasaAnfitrionaAGrupo({ groupId, casaId })

    expect(result).toEqual({ success: false, error: 'No pudimos completar la solicitud. Intenta nuevamente.' })
    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.actions]', expect.objectContaining({ rpcName: 'asignar_casa_anfitriona_a_grupo', phase: 'admin_client_setup' }))
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('handles thrown service-role RPC failures without leaking details or revalidating paths', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const rpc = createPermissionRpcMock({ missingHostHomeRows: [createMissingHostHomeRow()], roles: ['admin'] })
    const adminRpc = jest.fn().mockRejectedValue(new Error('network failure with internal token'))
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc: adminRpc }))

    const result = await procesarRevisionUbicacionCasa({ reviewId, accion: 'aprobar' })

    expect(result).toEqual({ success: false, error: 'No pudimos completar la solicitud. Intenta nuevamente.' })
    expect(result.error).not.toContain('internal token')
    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.actions]', expect.objectContaining({ rpcName: 'procesar_revision_ubicacion_casa', phase: 'rpc_exception' }))
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('logs unexpected successful RPC payloads without returning payload details to the client', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const rpc = createPermissionRpcMock({ missingHostHomeRows: [createMissingHostHomeRow()], roles: ['admin'] })
    const adminRpc = jest.fn().mockResolvedValue({ data: { ok: false, secret: 'do-not-return' }, error: null })
    createSupabaseServerClient.mockResolvedValue(createServerClient({ rpc }))
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ rpc: adminRpc }))

    const result = await asignarCasaAnfitrionaAGrupo({ groupId, casaId })

    expect(result).toEqual({ success: false, error: 'Respuesta inesperada del servidor' })
    expect(result.error).not.toContain('do-not-return')
    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.actions]', expect.objectContaining({ rpcName: 'asignar_casa_anfitriona_a_grupo', phase: 'parse_response' }))
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

function createCasaInput(overrides: Record<string, unknown> = {}) {
  return { nombre_lugar: 'Casa de Ana', calle: 'Calle 1', capacidad_maxima: 12, ...overrides }
}

function expectConsoleErrorNotToContain(consoleError: jest.SpyInstance, text: string) {
  expect(JSON.stringify(consoleError.mock.calls)).not.toContain(text)
}

function createHostHomeMapRow() {
  return {
    grupo_id: groupId,
    grupo_nombre: 'Grupo Norte',
    dia_reunion: 'martes',
    hora_reunion: '19:00',
    capacidad_maxima: 12,
    estado_ciclo: 'proximo',
    segmento: 'Jóvenes',
    temporada: '2026',
    casa_id: casaId,
    casa_nombre: 'Casa de Ana',
    latitud: 10.5,
    longitud: -66.9,
    barrio: 'Centro',
    notas_publicas: 'Entrada principal',
    total_miembros: 8,
  }
}

function createMissingHostHomeRow(overrides: Partial<ReturnType<typeof createMissingHostHomeRowBase>> = {}) {
  return { ...createMissingHostHomeRowBase(), ...overrides }
}

function createMissingHostHomeRowBase() {
  return {
    grupo_id: groupId,
    grupo_nombre: 'Grupo Norte',
    estado_ciclo: 'activo',
    segmento: 'Jóvenes',
    temporada: '2026',
  }
}

function createPendingReviewRow() {
  return {
    review_id: reviewId,
    casa_id: casaId,
    casa_nombre: 'Casa de Ana',
    review_type: 'location_change',
    created_at: '2026-06-21T12:00:00.000Z',
    requested_by: 'Ana Pérez',
  }
}

function createMemberMapRow() {
  return {
    usuario_id: targetUserId,
    nombre: 'Juan Pérez',
    grupo_id: groupId,
    grupo_nombre: 'Grupo Norte',
    latitud: 10.6,
    longitud: -66.8,
  }
}

type RpcMockResponse = { data: unknown; error: null }
type RpcMock = jest.Mock<Promise<RpcMockResponse>, [string, Record<string, unknown>]>

function createPermissionRpcMock(input: {
  approve?: boolean
  changeState?: boolean
  coHost?: boolean
  createFor?: boolean
  directorGeneralCanViewGroups?: Record<string, boolean>
  edit?: boolean
  hostHomeMapRows?: unknown[]
  memberMapRows?: unknown[]
  missingHostHomeRows?: unknown[]
  pendingReviewRows?: unknown[]
  roles?: unknown[]
  visibleCasaIds?: string[]
}): RpcMock {
  return jest.fn<Promise<RpcMockResponse>, [string, Record<string, unknown>]>((rpcName: string, args: Record<string, unknown>) => {
    if (rpcName === 'puede_crear_casa_anfitriona_para') {
      return Promise.resolve({ data: args.p_usuario_id === coHostUserId ? input.coHost : input.createFor, error: null })
    }
    if (rpcName === 'puede_aprobar_casa_anfitriona') return Promise.resolve({ data: input.approve, error: null })
    if (rpcName === 'puede_editar_casa_anfitriona') return Promise.resolve({ data: input.edit, error: null })
    if (rpcName === 'puede_cambiar_estado_casa_anfitriona') return Promise.resolve({ data: input.changeState, error: null })
    if (rpcName === 'obtener_roles_usuario') return Promise.resolve({ data: input.roles ?? [], error: null })
    if (rpcName === 'casas_map_director_general_can_view_group') {
      return Promise.resolve({ data: input.directorGeneralCanViewGroups?.[String(args.p_grupo_id)] ?? false, error: null })
    }
    if (rpcName === 'obtener_casas_visibles_ids') return Promise.resolve({ data: input.visibleCasaIds ?? [], error: null })
    if (rpcName === 'obtener_mapa_grupos_vida_host_homes') return Promise.resolve({ data: input.hostHomeMapRows ?? [], error: null })
    if (rpcName === 'obtener_grupos_sin_casa_anfitriona') return Promise.resolve({ data: input.missingHostHomeRows ?? [], error: null })
    if (rpcName === 'obtener_casas_revision_pendiente') return Promise.resolve({ data: input.pendingReviewRows ?? [], error: null })
    if (rpcName === 'obtener_mapa_miembros') return Promise.resolve({ data: input.memberMapRows ?? [], error: null })
    if (rpcName === 'procesar_aprobacion_casa_anfitriona') return Promise.resolve({ data: { ok: true, estado: 'aprobada' }, error: null })
    return Promise.resolve({ data: false, error: null })
  })
}

function createServerClient(input: {
  rpc: jest.Mock
  casasQuery?: unknown
  directorDashboardGroupIds?: string[]
  internalUserId?: string | null
  leaderDashboardGroupIds?: string[]
}) {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: authId } }, error: null }) },
    from: jest.fn((table: string) => {
      if (table === 'usuarios') return createUsuarioQuery(input.internalUserId === undefined ? actorUserId : input.internalUserId)
      if (table === 'casas_anfitrionas' && input.casasQuery) return input.casasQuery
      if (table === 'grupo_miembros') return createDashboardGroupMembershipQuery(input.leaderDashboardGroupIds ?? [])
      if (table === 'segmento_lideres') return createDirectorEtapaIdsQuery(['director-etapa-id'])
      if (table === 'director_etapa_grupos') return createDirectorEtapaGroupsQuery(input.directorDashboardGroupIds ?? [])
      throw new Error(`Unexpected server table ${table}`)
    }),
    rpc: input.rpc,
  }
}

function createUnauthenticatedServerClient() {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: { message: 'Auth session missing' } }) },
    from: jest.fn(),
    rpc: jest.fn(),
  }
}

function createUsuarioQuery(internalUserId: string | null) {
  return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: internalUserId ? { id: internalUserId } : null, error: null }) }) }) }
}

function createListQuery(rows: unknown[]) {
  return {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: rows, error: null }),
  }
}

function createDashboardGroupMembershipQuery(groupIds: string[]) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: groupIds.map((grupo_id) => ({ grupo_id })), error: null }),
  }
}

type DirectorEtapaIdsQuery = {
  select: jest.Mock<DirectorEtapaIdsQuery, []>
  eq: jest.Mock<DirectorEtapaIdsQuery | Promise<{ data: { id: string }[]; error: null }>, []>
}

function createDirectorEtapaIdsQuery(directorEtapaIds: string[]) {
  let eqCalls = 0
  let query: DirectorEtapaIdsQuery
  const select: DirectorEtapaIdsQuery['select'] = jest.fn(() => query)
  const eq: DirectorEtapaIdsQuery['eq'] = jest.fn((): DirectorEtapaIdsQuery | Promise<{ data: { id: string }[]; error: null }> => {
    eqCalls += 1
    if (eqCalls >= 2) return Promise.resolve({ data: directorEtapaIds.map((id) => ({ id })), error: null })
    return query
  })

  query = { select, eq }

  return query
}

function createDirectorEtapaGroupsQuery(groupIds: string[]) {
  return {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: groupIds.map((grupo_id) => ({ grupo_id })), error: null }),
  }
}

function createAdminClient(input: {
  activeGroupMemberIds?: string[]
  existingCasa?: { usuario_id: string; direccion_id: string | null; aprobada: boolean }
  rpc?: jest.Mock
} = {}) {
  const updateCasasAnfitrionas = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) })
  const insertDireccion = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { id: 'direccion-id' }, error: null }) }),
  })
  const grupoMiembrosQuery = createGrupoMiembrosQuery(input.activeGroupMemberIds ?? [actorUserId, targetUserId, coHostUserId])
  const casasOcupadasQuery = createCasasOcupadasQuery([])
  const from = jest.fn((table: string) => {
    if (table === 'grupo_miembros') return grupoMiembrosQuery
    if (table === 'direcciones') return { insert: insertDireccion }
    if (table === 'casas_anfitrionas') {
      return {
        update: updateCasasAnfitrionas,
        select: jest.fn(() => ({
          eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: input.existingCasa, error: null }) }),
          or: jest.fn().mockReturnValue(casasOcupadasQuery),
        })),
      }
    }
    throw new Error(`Unexpected admin table ${table}`)
  })

  return {
    casasOcupadasQuery,
    from,
    grupoMiembrosQuery,
    insertDireccion,
    rpc: input.rpc ?? jest.fn(),
    updateCasasAnfitrionas,
  }
}

function createCasasOcupadasQuery(rows: Array<{ id: string }>) {
  const query = {
    neq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: rows, error: null }),
  }

  return query
}

function createGrupoMiembrosQuery(activeGroupMemberIds: string[]) {
  let selectedUsuarioId = ''
  const query: {
    select: jest.Mock
    eq: jest.Mock
    is: jest.Mock
    limit: jest.Mock
  } = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn((column: string, value: string) => {
      if (column === 'usuario_id') selectedUsuarioId = value
      return query
    }),
    is: jest.fn().mockReturnThis(),
    limit: jest.fn(() => Promise.resolve({
      data: activeGroupMemberIds.includes(selectedUsuarioId) ? [{ id: 'membership-id' }] : [],
      error: null,
    })),
  }

  return query
}
