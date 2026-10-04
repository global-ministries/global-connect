/**
 * Member health readers: v_salud_miembros_grupo is closed to signed-in
 * sessions, so both actions read it with the service client, only for
 * director de etapa and above, and keep the group scope.
 */
import { obtenerMiembrosEnRiesgo, obtenerSaludMiembrosGrupo } from '@/lib/actions/asistencia-avanzada.actions'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()
const getUserWithRoles = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (client: unknown) => getUserWithRoles(client) }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const authId = '11111111-1111-1111-1111-111111111111'
const usuarioId = '22222222-2222-2222-2222-222222222222'
const grupoId = '33333333-3333-3333-3333-333333333333'
const grupoDg = '44444444-4444-4444-4444-444444444444'
const grupoDe = '55555555-5555-5555-5555-555555555555'

type Llamada = [string, unknown[]]

/** Chainable, awaitable query that records its calls and resolves to `data`. */
function consulta(llamadas: Llamada[], data: unknown) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'in', 'order', 'limit']) {
    q[m] = jest.fn((...args: unknown[]) => {
      llamadas.push([m, args])
      return q
    })
  }
  q.maybeSingle = jest.fn(async () => ({ data, error: null }))
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve)
  return q
}

function montar(roles: string[], opciones: { puedeVerGrupo?: boolean } = {}) {
  const vista: Llamada[] = []
  const usuarios: Llamada[] = []
  const asignaciones: Llamada[] = []
  const sesion = {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: authId } } })) },
    rpc: jest.fn(async () => ({ data: opciones.puedeVerGrupo ?? true, error: null })),
    from: jest.fn(() => {
      throw new Error('the session client must not read the views')
    }),
  }
  const admin = {
    rpc: jest.fn(async () => ({ data: [grupoDg], error: null })),
    from: jest.fn((tabla: string) => {
      if (tabla === 'usuarios') return consulta(usuarios, { id: usuarioId })
      if (tabla === 'director_etapa_grupos') return consulta(asignaciones, [{ grupo_id: grupoDe }])
      return consulta(vista, [])
    }),
  }
  createSupabaseServerClient.mockResolvedValue(sesion)
  createSupabaseAdminClient.mockReturnValue(admin)
  getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles })
  return { sesion, admin, vista, usuarios, asignaciones }
}

const filtroGrupos = (vista: Llamada[]) => vista.find(([m, a]) => m === 'in' && a[0] === 'grupo_id')?.[1][1]

beforeEach(() => {
  jest.clearAllMocks()
  createSupabaseAdminClient.mockReset()
})

describe('obtenerSaludMiembrosGrupo', () => {
  it.each([['lider'], ['miembro']])('denies %s without reading the view', async (rol) => {
    const { admin } = montar([rol])

    const r = await obtenerSaludMiembrosGrupo(grupoId)

    expect(r.success).toBe(false)
    expect(admin.from).not.toHaveBeenCalledWith('v_salud_miembros_grupo')
  })

  it('denies a director outside the group (puede_ver_grupo false)', async () => {
    const { sesion, admin } = montar(['director-etapa'], { puedeVerGrupo: false })

    const r = await obtenerSaludMiembrosGrupo(grupoId)

    expect(r.success).toBe(false)
    expect(sesion.rpc).toHaveBeenCalledWith('puede_ver_grupo', { p_user_id: usuarioId, p_grupo_id: grupoId })
    expect(admin.from).not.toHaveBeenCalledWith('v_salud_miembros_grupo')
  })

  it.each([['director-etapa'], ['director-general'], ['admin']])(
    'reads the group with the service client for %s',
    async (rol) => {
      const { admin, vista } = montar([rol])

      const r = await obtenerSaludMiembrosGrupo(grupoId)

      expect(r).toEqual({ success: true, data: [] })
      expect(admin.from).toHaveBeenCalledWith('v_salud_miembros_grupo')
      expect(vista).toContainEqual(['eq', ['grupo_id', grupoId]])
    },
  )
})

describe('obtenerMiembrosEnRiesgo', () => {
  it('denies a leader without reading the view', async () => {
    const { admin } = montar(['lider'])

    const r = await obtenerMiembrosEnRiesgo()

    expect(r.success).toBe(false)
    expect(admin.from).not.toHaveBeenCalledWith('v_salud_miembros_grupo')
  })

  it('limits a director de etapa to their groups', async () => {
    const { vista, usuarios, asignaciones } = montar(['director-etapa'])

    expect((await obtenerMiembrosEnRiesgo()).success).toBe(true)
    expect(usuarios).toContainEqual(['eq', ['auth_id', authId]])
    expect(asignaciones).toContainEqual(['eq', ['segmento_lideres.usuario_id', usuarioId]])
    expect(asignaciones).toContainEqual(['eq', ['segmento_lideres.tipo_lider', 'director_etapa']])
    expect(filtroGrupos(vista)).toEqual([grupoDe])
  })

  it('returns the typed failure when the service client cannot be created', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    montar(['director-etapa'])
    createSupabaseAdminClient.mockImplementation(() => {
      throw new Error('Faltan variables de entorno')
    })

    const r = await obtenerMiembrosEnRiesgo()

    expect(r.success).toBe(false)
    expect(r.error).toEqual(expect.any(String))
    errorSpy.mockRestore()
  })

  it('limits a director general to the groups of the DG rule', async () => {
    const { admin, vista } = montar(['director-general'])

    expect((await obtenerMiembrosEnRiesgo()).success).toBe(true)
    expect(admin.rpc).toHaveBeenCalledWith('gdv_dg_grupos_activos_visibles', { p_usuario_id: usuarioId })
    expect(filtroGrupos(vista)).toEqual([grupoDg])
  })

  it('does not filter for admin', async () => {
    const { vista } = montar(['admin'])

    expect((await obtenerMiembrosEnRiesgo()).success).toBe(true)
    expect(filtroGrupos(vista)).toBeUndefined()
  })
})
