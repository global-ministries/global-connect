import {
  listarSolicitudesCompletadas,
  listarSolicitudesPendientes,
  obtenerMisSolicitudes,
} from '@/lib/actions/solicitudes-grupo.actions'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()
const getUserWithRoles = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (client: unknown) => getUserWithRoles(client) }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const authId = '11111111-1111-1111-1111-111111111111'
const grupoId = '33333333-3333-3333-3333-333333333333'

type Tablas = Record<string, unknown>

/** Every chained call returns the same awaitable query; `.single()` returns the first row. */
function clienteConTablas(tablas: Tablas) {
  return {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: authId } } })) },
    rpc: jest.fn(async () => ({ data: null, error: null })),
    from: jest.fn((tabla: string) => {
      const resultado = { data: tablas[tabla] ?? [], error: null }
      const query: Record<string, unknown> = {}
      for (const metodo of ['select', 'eq', 'neq', 'in', 'order', 'limit']) query[metodo] = jest.fn(() => query)
      query.single = jest.fn(async () => ({ data: Array.isArray(resultado.data) ? resultado.data[0] : resultado.data, error: null }))
      query.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resultado).then(resolve)
      return query
    }),
  }
}

const asignacion = (nombre: string, apellido: string) => ({ segmento_lideres: { usuario: { nombre, apellido } } })

function grupoConDirectores(...directores: Array<[string, string]>) {
  return {
    id: grupoId,
    segmento_id: 'seg',
    campus: { nombre: 'Central' },
    grupo_miembros: [],
    director_etapa_grupos: directores.map(([n, a]) => asignacion(n, a)),
  }
}

const solicitudBase = {
  id: 's1', tipo: 'activacion_grupo', estado: 'pendiente', motivo: null, notas_director: null,
  creado_en: '2026-01-01', actualizado_en: '2026-01-01', expira_en: null, grupo_id: grupoId,
  grupo_origen_id: null, rol_solicitado: null, temporada_id: null,
}

const lectores = [
  {
    nombre: 'listarSolicitudesPendientes',
    ejecutar: listarSolicitudesPendientes,
    servidor: () => ({ v_solicitudes_pendientes: [{ ...solicitudBase }] }),
  },
  {
    nombre: 'listarSolicitudesCompletadas',
    ejecutar: listarSolicitudesCompletadas,
    servidor: () => ({}),
    admin: () => ({ solicitudes_grupo: [{ ...solicitudBase, estado: 'aprobada' }] }),
  },
  {
    nombre: 'obtenerMisSolicitudes',
    ejecutar: obtenerMisSolicitudes,
    servidor: () => ({ usuarios: [{ id: 'u1' }], solicitudes_grupo: [{ ...solicitudBase }] }),
  },
] as const

describe.each(lectores)('$nombre lists every director of the group', (lector) => {
  const leer = async (...directores: Array<[string, string]>) => {
    const admin = 'admin' in lector ? lector.admin() : {}
    createSupabaseServerClient.mockResolvedValue(clienteConTablas(lector.servidor()))
    createSupabaseAdminClient.mockReturnValue(clienteConTablas({ ...admin, grupos: [grupoConDirectores(...directores)] }))
    getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles: ['admin'] })
    const resultado = await lector.ejecutar()
    expect(resultado.success).toBe(true)
    return resultado.data![0] as { director_nombre: string | null; director_apellido: string | null; directores_nombres?: string | null }
  }

  it('shows one director', async () => {
    const fila = await leer(['Ana', 'Pérez'])

    expect(fila.directores_nombres).toBe('Ana Pérez')
    expect([fila.director_nombre, fila.director_apellido]).toEqual(['Ana', 'Pérez'])
  })

  it('shows both spouses of a couple and keeps the first one in the legacy fields', async () => {
    const fila = await leer(['Ana', 'Pérez'], ['Luis', 'Gómez'])

    expect(fila.directores_nombres).toBe('Ana Pérez y Luis Gómez')
    expect([fila.director_nombre, fila.director_apellido]).toEqual(['Ana', 'Pérez'])
  })

  it('separates three directors with commas', async () => {
    const fila = await leer(['Ana', 'Pérez'], ['Luis', 'Gómez'], ['Sara', 'Díaz'])

    expect(fila.directores_nombres).toBe('Ana Pérez, Luis Gómez y Sara Díaz')
  })

  it('has no directors text when the group has none', async () => {
    const fila = await leer()

    expect(fila.directores_nombres ?? null).toBeNull()
    expect(fila.director_nombre).toBeNull()
  })
})
