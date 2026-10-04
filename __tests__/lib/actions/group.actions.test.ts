import { updateGroup } from '@/lib/actions/group.actions'

const createSupabaseServerClient = jest.fn()
const revalidatePath = jest.fn()
const upsertDireccion = jest.fn()
const adminClient = { admin: true }

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => adminClient }))
jest.mock('@/lib/helpers/direccion.helper', () => ({ upsertDireccion: (...args: unknown[]) => upsertDireccion(...args) }))

const authId = '11111111-1111-1111-1111-111111111111'
const groupId = '22222222-2222-2222-2222-222222222222'
const temporadaId = '33333333-3333-3333-3333-333333333333'
const segmentoId = '44444444-4444-4444-4444-444444444444'
const casaId = '55555555-5555-5555-5555-555555555555'

describe('updateGroup Casa assignment safety', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    upsertDireccion.mockResolvedValue('direccion-id')
  })

  it('rejects tampered Casa assignment through the generic group edit action before any write', async () => {
    const result = await updateGroup(groupId, {
      ...createValidInput(),
      casa_anfitriona_id: casaId,
    })

    expect(result).toEqual({ success: false, error: 'La Casa Anfitriona se asigna desde el flujo guiado' })
    expect(createSupabaseServerClient).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('updates regular group fields without writing casa_anfitriona_id', async () => {
    const client = createServerClient()
    createSupabaseServerClient.mockResolvedValue(client)

    await expect(updateGroup(groupId, createValidInput())).resolves.toEqual({ success: true })

    expect(client.rpc).toHaveBeenCalledWith('puede_editar_grupo', { p_auth_id: authId, p_grupo_id: groupId })
    const updatePayload = client.updateGrupos.mock.calls[0][0]
    expect(updatePayload).not.toHaveProperty('casa_anfitriona_id')
    expect(revalidatePath).toHaveBeenCalledWith(`/grupos-vida/${groupId}`)
  })

  it('writes the address with the service client, after the permission check', async () => {
    const client = createServerClient()
    createSupabaseServerClient.mockResolvedValue(client)

    await expect(
      updateGroup(groupId, { ...createValidInput(), direccion: { calle: 'Av. 1', barrio: 'Centro' } }),
    ).resolves.toEqual({ success: true })

    expect(upsertDireccion).toHaveBeenCalledWith(adminClient, 'dir-actual', expect.objectContaining({ calle: 'Av. 1' }))
    expect(client.updateGrupos.mock.calls[0][0]).toHaveProperty('direccion_anfitrion_id', 'direccion-id')
  })

  it('does not touch the address when the caller may not edit the group', async () => {
    const client = createServerClient(false)
    createSupabaseServerClient.mockResolvedValue(client)

    const result = await updateGroup(groupId, { ...createValidInput(), direccion: { calle: 'Av. 1' } })

    expect(result).toEqual({ success: false, error: 'No tienes permisos para editar este grupo' })
    expect(upsertDireccion).not.toHaveBeenCalled()
  })
})

function createValidInput() {
  return {
    nombre: 'Grupo Norte',
    temporada_id: temporadaId,
    segmento_id: segmentoId,
    dia_reunion: 'Lunes',
    hora_reunion: '07:00 PM',
    activo: true,
    notas_privadas: 'Referencia interna',
  }
}

function createServerClient(permitido = true) {
  const updateEq = jest.fn().mockResolvedValue({ error: null })
  const updateGrupos = jest.fn().mockReturnValue({ eq: updateEq })
  const single = jest.fn().mockResolvedValue({ data: { direccion_anfitrion_id: 'dir-actual' }, error: null })
  const selectGrupos = jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single }) })
  const from = jest.fn((table: string) => {
    if (table === 'grupos') return { update: updateGrupos, select: selectGrupos }
    throw new Error(`Unexpected table ${table}`)
  })
  const rpc = jest.fn((rpcName: string) => {
    if (rpcName === 'puede_editar_grupo') return Promise.resolve({ data: permitido, error: null })
    return Promise.resolve({ data: null, error: { message: `Unexpected RPC ${rpcName}` } })
  })

  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: authId } }, error: null }) },
    from,
    rpc,
    updateGrupos,
  }
}
