import { createGroup } from '@/lib/actions/group.actions'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()
const getUserWithRoles = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (...args: unknown[]) => getUserWithRoles(...args) }))
jest.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
jest.mock('@/lib/helpers/direccion.helper', () => ({ upsertDireccion: jest.fn() }))

const authId = '11111111-1111-1111-1111-111111111111'
const temporadaId = '33333333-3333-3333-3333-333333333333'
const segmentoId = '44444444-4444-4444-4444-444444444444'
const directorId = '55555555-5555-5555-5555-555555555555'
const newGroupId = '66666666-6666-6666-6666-666666666666'
const liderId = '77777777-7777-7777-7777-777777777777'

describe('createGroup requires a director de etapa and creates it atomically', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects a missing director before touching the database', async () => {
    const result = await createGroup({ ...validInput(), director_etapa_segmento_lider_id: null })

    expect(result).toEqual({ success: false, error: 'Elige el director de etapa del grupo' })
    expect(createSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('rejects an undefined or malformed director', async () => {
    const missing = await createGroup({ ...validInput(), director_etapa_segmento_lider_id: undefined })
    const malformed = await createGroup({ ...validInput(), director_etapa_segmento_lider_id: 'not-a-uuid' })

    expect(missing).toEqual({ success: false, error: 'Elige el director de etapa del grupo' })
    expect(malformed.success).toBe(false)
    expect(createSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('creates the group with one call to crear_grupo_con_director and never links the director itself', async () => {
    const { server, admin } = setup({ roles: ['admin'] })

    const result = await createGroup(validInput())

    expect(result).toEqual({ success: true, newGroupId, pendiente: false })
    expect(server.rpc).toHaveBeenCalledTimes(1)
    expect(server.rpc).toHaveBeenCalledWith('crear_grupo_con_director', {
      p_nombre: 'Grupo Norte',
      p_temporada_id: temporadaId,
      p_segmento_id: segmentoId,
      p_director_etapa_segmento_lider_id: directorId,
    })
    expect(server.rpc).not.toHaveBeenCalledWith('crear_grupo', expect.anything())
    expect(server.rpc).not.toHaveBeenCalledWith('puede_crear_grupo', expect.anything())
    expect(admin.tablesTouched).not.toContain('director_etapa_grupos')
  })

  it('keeps the post-creation: approved status, location and the initial leader', async () => {
    const { admin } = setup({ roles: ['director-general'] })

    await createGroup({ ...validInput(), lider_usuario_id: liderId })

    expect(admin.grupoUpdates).toEqual([expect.objectContaining({ estado_aprobacion: 'aprobado' })])
    expect(admin.grupoUpdates[0]).not.toHaveProperty('activo')
    expect(admin.miembroInserts).toEqual([{ grupo_id: newGroupId, usuario_id: liderId, rol: 'Líder' }])
    expect(admin.solicitudInserts).toEqual([])
  })

  it('creates a pending inactive group with a request when a director de etapa creates it', async () => {
    const { admin } = setup({ roles: ['director-etapa'] })

    const result = await createGroup(validInput())

    expect(result).toEqual({ success: true, newGroupId, pendiente: true })
    expect(admin.grupoUpdates[0]).toEqual(expect.objectContaining({ estado_aprobacion: 'pendiente', activo: false }))
    expect(admin.solicitudInserts).toEqual([
      expect.objectContaining({ tipo: 'activacion_grupo', estado: 'pendiente', grupo_id: newGroupId }),
    ])
  })

  it('maps SQLSTATE 42501 to the permissions message and stops', async () => {
    const { admin } = setup({ roles: ['director-general'], rpcError: { code: '42501', message: 'Permiso denegado' } })

    const result = await createGroup(validInput())

    expect(result).toEqual({ success: false, error: 'No tienes permisos para crear grupos en este segmento' })
    expect(admin.tablesTouched).toEqual([])
  })

  it('maps SQLSTATE 22023 to the invalid director message and stops', async () => {
    const { admin } = setup({ roles: ['admin'], rpcError: { code: '22023', message: 'El director de etapa indicado no pertenece al segmento' } })

    const result = await createGroup(validInput())

    expect(result).toEqual({ success: false, error: 'El director de etapa elegido no pertenece a este segmento' })
    expect(admin.tablesTouched).toEqual([])
  })

  it('reports any other RPC error with its message', async () => {
    setup({ roles: ['admin'], rpcError: { code: 'XX000', message: 'boom' } })

    await expect(createGroup(validInput())).resolves.toEqual({ success: false, error: 'boom' })
  })
})

function validInput() {
  return {
    nombre: 'Grupo Norte',
    temporada_id: temporadaId,
    segmento_id: segmentoId,
    director_etapa_segmento_lider_id: directorId as string | null | undefined,
    lider_usuario_id: null as string | null,
  }
}

function setup({ roles, rpcError = null }: { roles: string[]; rpcError?: { code: string; message: string } | null }) {
  const admin = createAdminClient()
  const server = {
    rpc: jest.fn().mockResolvedValue(rpcError ? { data: null, error: rpcError } : { data: newGroupId, error: null }),
    from: jest.fn((table: string) => {
      if (table === 'usuarios') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'usuario-interno' } }) }) }) }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }
  createSupabaseServerClient.mockResolvedValue(server)
  createSupabaseAdminClient.mockReturnValue(admin)
  getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles, platformSession: null })
  return { server, admin }
}

function createAdminClient() {
  const tablesTouched: string[] = []
  const grupoUpdates: Record<string, unknown>[] = []
  const miembroInserts: Record<string, unknown>[] = []
  const solicitudInserts: Record<string, unknown>[] = []
  const single = () => Promise.resolve({ data: { id: 'tipo-id' } })
  const from = jest.fn((table: string) => {
    tablesTouched.push(table)
    if (table === 'tipos_grupo') return { select: () => ({ limit: () => ({ single }) }) }
    if (table === 'grupos') {
      return {
        update: (payload: Record<string, unknown>) => {
          grupoUpdates.push(payload)
          return { eq: () => Promise.resolve({ error: null }) }
        },
      }
    }
    if (table === 'grupo_miembros') {
      return { insert: (row: Record<string, unknown>) => { miembroInserts.push(row); return Promise.resolve({ error: null }) } }
    }
    if (table === 'solicitudes_grupo') {
      return { insert: (row: Record<string, unknown>) => { solicitudInserts.push(row); return Promise.resolve({ error: null }) } }
    }
    throw new Error(`Unexpected admin table ${table}`)
  })
  return { from, tablesTouched, grupoUpdates, miembroInserts, solicitudInserts }
}
