import { obtenerUsuariosAsignablesCasaAnfitriona } from '@/lib/casas-anfitrionas/assignable-users'

const authId = '11111111-1111-1111-1111-111111111111'
const allowedUserId = '22222222-2222-2222-2222-222222222222'
const usedUserId = '33333333-3333-3333-3333-333333333333'
const deniedUserId = '44444444-4444-4444-4444-444444444444'
const inactiveUserId = '55555555-5555-5555-5555-555555555555'

describe('obtenerUsuariosAsignablesCasaAnfitriona', () => {
  it('returns only in-scope active-group users and disables only occupied in-scope users', async () => {
    const supabase = createServerClient({
      permissionByUserId: {
        [allowedUserId]: true,
        [usedUserId]: true,
        [deniedUserId]: false,
        [inactiveUserId]: true,
      },
      users: [
        userRow(allowedUserId, 'Ana', 'Disponible', 'ana@example.com', '123'),
        userRow(usedUserId, 'Beto', 'Ocupado', 'beto@example.com', '456'),
        userRow(deniedUserId, 'Carla', 'Fuera', 'carla@example.com', '789'),
        userRow(inactiveUserId, 'Diego', 'Inactivo', 'diego@example.com', '000'),
      ],
    })
    const adminDb = createAdminClient({
      activeMemberIds: [allowedUserId, usedUserId, deniedUserId],
      occupiedRows: [{ id: 'casa-usada', usuario_id: usedUserId, co_anfitrion_id: null }],
    })

    const result = await obtenerUsuariosAsignablesCasaAnfitriona({
      supabase: supabase as never,
      adminDb: adminDb as never,
      authId,
      busqueda: ' ana@example.com ',
    })

    expect(result).toEqual([
      expect.objectContaining({ value: allowedUserId, label: 'Ana Disponible', puedeSeleccionar: true }),
      expect.objectContaining({
        value: usedUserId,
        label: 'Beto Ocupado',
        puedeSeleccionar: false,
        yaTieneCasa: true,
        razonNoSeleccionable: 'Ya tiene casa asignada',
      }),
    ])
    expect(result.map((user) => user.value)).not.toContain(deniedUserId)
    expect(result.map((user) => user.value)).not.toContain(inactiveUserId)
    expect(supabase.rpc).toHaveBeenCalledWith('listar_usuarios_con_permisos', expect.objectContaining({
      p_busqueda: 'ana@example.com',
      p_en_grupo: true,
    }))
    expect(adminDb.grupoMiembrosQuery.eq).toHaveBeenCalledWith('grupos.activo', true)
    expect(adminDb.grupoMiembrosQuery.eq).toHaveBeenCalledWith('grupos.eliminado', false)
  })

  it('normalizes invalid limits before calling the search RPC', async () => {
    const supabase = createServerClient({ users: [] })
    const adminDb = createAdminClient({ activeMemberIds: [], occupiedRows: [] })

    await obtenerUsuariosAsignablesCasaAnfitriona({
      supabase: supabase as never,
      adminDb: adminDb as never,
      authId,
      busqueda: 'Ana',
      limit: Number.NaN,
    })

    expect(supabase.rpc).toHaveBeenCalledWith('listar_usuarios_con_permisos', expect.objectContaining({
      p_limite: 30,
    }))
  })

  it('does not call admin lookups when the permission search fails', async () => {
    const supabase = createServerClient({ users: [], listError: { message: 'raw database failure' } })
    const adminDb = createAdminClient({ activeMemberIds: [], occupiedRows: [] })

    await expect(obtenerUsuariosAsignablesCasaAnfitriona({
      supabase: supabase as never,
      adminDb: adminDb as never,
      authId,
      busqueda: 'Ana',
    })).rejects.toThrow('raw database failure')
    expect(adminDb.from).not.toHaveBeenCalled()
  })
})

function userRow(id: string, nombre: string, apellido: string, email: string, cedula: string) {
  return { id, nombre, apellido, email, cedula, foto_perfil_url: null }
}

function createServerClient({
  listError = null,
  permissionByUserId = {},
  users,
}: {
  listError?: { message: string } | null
  permissionByUserId?: Record<string, boolean>
  users: Array<ReturnType<typeof userRow>>
}) {
  return {
    rpc: jest.fn((name: string, args: Record<string, unknown>) => {
      if (name === 'listar_usuarios_con_permisos') {
        return Promise.resolve({ data: listError ? null : users, error: listError })
      }

      if (name === 'puede_crear_casa_anfitriona_para') {
        return Promise.resolve({ data: permissionByUserId[String(args.p_usuario_id)] === true, error: null })
      }

      throw new Error(`Unexpected RPC ${name}`)
    }),
  }
}

function createAdminClient({
  activeMemberIds,
  occupiedRows,
}: {
  activeMemberIds: string[]
  occupiedRows: Array<{ id: string; usuario_id: string | null; co_anfitrion_id: string | null }>
}) {
  const grupoMiembrosQuery = createGrupoMiembrosQuery(activeMemberIds)
  const casasQuery = createCasasQuery(occupiedRows)

  return {
    grupoMiembrosQuery,
    casasQuery,
    from: jest.fn((table: string) => {
      if (table === 'grupo_miembros') return grupoMiembrosQuery
      if (table === 'casas_anfitrionas') return casasQuery
      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

function createGrupoMiembrosQuery(activeMemberIds: string[]) {
  const query = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    then: (resolve: (value: { data: Array<{ usuario_id: string }>; error: null }) => void) =>
      resolve({ data: activeMemberIds.map((usuario_id) => ({ usuario_id })), error: null }),
  }

  return query
}

function createCasasQuery(rows: Array<{ id: string; usuario_id: string | null; co_anfitrion_id: string | null }>) {
  const query = {
    select: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    then: (resolve: (value: { data: typeof rows; error: null }) => void) => resolve({ data: rows, error: null }),
  }

  return query
}
