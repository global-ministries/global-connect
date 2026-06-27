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

function createDashboardSupabaseMock() {
  return { auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null }) }, rpc: jest.fn(), from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ gte: jest.fn().mockResolvedValue({ count: 5 }) }) }) }
}
