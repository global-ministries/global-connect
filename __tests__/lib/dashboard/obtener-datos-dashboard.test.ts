import { obtenerDatosDashboard } from '@/lib/dashboard/obtenerDatosDashboard'
import type { PlatformSession } from '@/lib/platform/session/types'

const createSupabaseServerClient = jest.fn()
const getUserWithRoles = jest.fn()
const getTotalUsuarios = jest.fn()
const getTotalGruposActivos = jest.fn()
const getDistribucionSegmentos = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: () => getUserWithRoles() }))
jest.mock('@/lib/dashboard/getTotalUsuarios', () => ({ getTotalUsuarios: () => getTotalUsuarios() }))
jest.mock('@/lib/dashboard/getTotalGruposActivos', () => ({ getTotalGruposActivos: () => getTotalGruposActivos() }))
jest.mock('@/lib/dashboard/getDistribucionSegmentos', () => ({ getDistribucionSegmentos: () => getDistribucionSegmentos() }))

type RpcResult = { data: unknown; error: Error | null }
type DashboardCase = [string, RpcResult[], Record<string, unknown>, boolean]

const platformSession: PlatformSession = { personaId: 'persona-1', subjectAuthId: 'auth-1', globalRoles: ['director-general'], contexts: [], capabilities: [] }
const successWidgets = { kpis_globales: { total_miembros: { valor: 10 } } }
const weeklyReport = { data: { kpis_globales: { porcentaje_asistencia_global: 76 } }, error: null }
const fallbackWidgets = { kpis_globales: { total_miembros: { valor: 42 }, asistencia_semanal: { valor: 76 }, grupos_activos: { valor: 7 }, nuevos_miembros_mes: { valor: 5 } }, distribucion_segmentos: [{ id: 'segmento-adultos', nombre: 'Adultos', total_miembros: 3 }] }

describe('obtenerDatosDashboard platform session continuity', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getUserWithRoles.mockResolvedValue({ user: { id: 'auth-1' }, roles: ['director-general'], platformSession })
    getTotalUsuarios.mockResolvedValue(42)
    getTotalGruposActivos.mockResolvedValue(7)
    getDistribucionSegmentos.mockResolvedValue([{ id: 'segmento-adultos', nombre: 'Adultos', grupos: 3 }])
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each([
    ['successful RPC response', [{ data: { rol: 'director-general', widgets: successWidgets }, error: null }], successWidgets, false],
    ['RPC error fallback', [{ data: null, error: new Error('dashboard rpc unavailable') }, weeklyReport], fallbackWidgets, true],
    ['RPC no-data fallback', [{ data: null, error: null }, weeklyReport], fallbackWidgets, false],
  ] satisfies DashboardCase[])('preserves platformSession for %s', async (_label, rpcResults, widgets, logsError) => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const supabase = createDashboardSupabaseMock()
    const responses = [...rpcResults]
    supabase.rpc.mockImplementation(() => Promise.resolve(responses.shift() ?? { data: null, error: null }))
    createSupabaseServerClient.mockResolvedValue(supabase)

    const result = await obtenerDatosDashboard()

    expect(result).toMatchObject({ rol: 'director-general', widgets })
    expect(result.platformSession).toBe(platformSession)
    expect(consoleError).toHaveBeenCalledTimes(logsError ? 1 : 0)
  })
})

describe('obtenerDatosDashboard total members definition', () => {
  const rpcKpis = { total_miembros: { valor: 869, variacion: 4.2 }, grupos_activos: { valor: 74 } }
  const campusId = '3f6c2a1e-8b7d-4c2e-9a1b-5d4e3f2a1b0c'

  beforeEach(() => {
    jest.clearAllMocks()
    getTotalUsuarios.mockResolvedValue(1021)
    getTotalGruposActivos.mockResolvedValue(74)
    getDistribucionSegmentos.mockResolvedValue([])
  })

  function mockDashboardRpc(rol: string, { gruposError = null as Error | null } = {}) {
    getUserWithRoles.mockResolvedValue({ user: { id: 'auth-1' }, roles: [rol], platformSession: null })
    const supabase = createDashboardSupabaseMock()
    supabase.rpc.mockImplementation((nombre: string) => Promise.resolve(nombre === 'resumen_dashboard_admin'
      ? { data: { total_usuarios: 312, total_grupos: 40, total_asistencias: 9000 }, error: null }
      : { data: { rol, widgets: { kpis_globales: { ...rpcKpis } } }, error: null }))
    const eq = jest.fn()
    const gruposQuery: QueryMock = {
      select: jest.fn(() => gruposQuery),
      eq: eq.mockImplementation(() => gruposQuery),
      then: (resolve) => resolve({ count: gruposError ? null : 18, error: gruposError }),
    }
    supabase.from.mockReturnValue(gruposQuery)
    createSupabaseServerClient.mockResolvedValue(supabase)
    return { supabase, eq }
  }

  it.each(['admin', 'pastor'])('shows every registered person to the %s instead of members of active groups', async (rol) => {
    const { supabase } = mockDashboardRpc(rol)

    const result = await obtenerDatosDashboard()

    expect(result.widgets.kpis_globales).toEqual({ total_miembros: { valor: 1021 }, grupos_activos: { valor: 74 } })
    expect(result.campusId).toBeNull()
    expect(supabase.rpc).not.toHaveBeenCalledWith('resumen_dashboard_admin', expect.anything())
  })

  it.each(['admin', 'pastor'])('scopes members and active groups to the initial campus for the %s', async (rol) => {
    const { supabase, eq } = mockDashboardRpc(rol)

    const result = await obtenerDatosDashboard(campusId)

    expect(result.widgets.kpis_globales).toEqual({ total_miembros: { valor: 312 }, grupos_activos: { valor: 18 } })
    expect(result.campusId).toBe(campusId)
    expect(supabase.rpc).toHaveBeenCalledWith('resumen_dashboard_admin', { p_campus_id: campusId })
    expect(supabase.from).toHaveBeenCalledWith('grupos')
    expect(eq).toHaveBeenCalledWith('activo', true)
    expect(eq).toHaveBeenCalledWith('eliminado', false)
    expect(eq).toHaveBeenCalledWith('campus_id', campusId)
    expect(getTotalUsuarios).not.toHaveBeenCalled()
  })

  it('keeps the global numbers when the campus counts fail, so the client refresh scopes them', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    mockDashboardRpc('admin', { gruposError: new Error('grupos unavailable') })

    const result = await obtenerDatosDashboard(campusId)

    expect(result.widgets.kpis_globales).toEqual({ total_miembros: { valor: 1021 }, grupos_activos: { valor: 74 } })
    expect(result.campusId).toBeNull()
    expect(consoleError).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('keeps the RPC member count for a director-general, even with an initial campus', async () => {
    const { supabase } = mockDashboardRpc('director-general')

    const result = await obtenerDatosDashboard(campusId)

    expect(result.widgets.kpis_globales).toEqual(rpcKpis)
    expect(result.campusId).toBeNull()
    expect(getTotalUsuarios).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalledWith('resumen_dashboard_admin', expect.anything())
  })
})

type QueryMock = {
  select: jest.Mock
  eq: jest.Mock
  then: (resolve: (value: { count: number | null; error: Error | null }) => unknown) => unknown
}

function createDashboardSupabaseMock() {
  return { auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null }) }, rpc: jest.fn(), from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ gte: jest.fn().mockResolvedValue({ count: 5 }) }) }) }
}
