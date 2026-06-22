import React from 'react'
import { render, screen } from '@testing-library/react'
import { canReviewHostHomes } from '@/lib/casas-anfitrionas/review-roles'

const obtenerDatosDashboard = jest.fn()
const obtenerGruposSinCasaAnfitriona = jest.fn()
const obtenerCasasRevisionPendiente = jest.fn()

jest.mock('@/lib/dashboard/obtenerDatosDashboard', () => ({ obtenerDatosDashboard: () => obtenerDatosDashboard() }))
jest.mock('@/lib/actions/casas-anfitrionas.actions', () => ({
  obtenerCasasRevisionPendiente: () => obtenerCasasRevisionPendiente(),
  obtenerGruposSinCasaAnfitriona: (input: unknown) => obtenerGruposSinCasaAnfitriona(input),
}))
jest.mock('@/components/layout/dashboard-layout', () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }))
jest.mock('@/components/ui/sistema-diseno', () => ({ ContenedorDashboard: ({ children, titulo }: { children: React.ReactNode; titulo: string }) => <section><h1>{titulo}</h1>{children}</section> }))
jest.mock('@/components/dashboard/roles/DashboardAdmin', () => ({ __esModule: true, default: ({ data, rol }: DashboardRoleProbeProps) => <DashboardRoleProbe data={data} name={`admin:${rol}`} /> }))
jest.mock('@/components/dashboard/roles/DashboardDirector', () => ({ __esModule: true, default: ({ data }: DashboardRoleProbeProps) => <DashboardRoleProbe data={data} name="director" /> }))
jest.mock('@/components/dashboard/roles/DashboardLider', () => ({ __esModule: true, default: ({ data }: DashboardRoleProbeProps) => <DashboardRoleProbe data={data} name="lider" /> }))
jest.mock('@/components/dashboard/roles/DashboardMiembro', () => ({ __esModule: true, default: ({ data }: DashboardRoleProbeProps) => <DashboardRoleProbe data={data} name="miembro" /> }))

type DashboardRoleProbeProps = {
  data: {
    casas_anfitrionas_queues?: {
      missingGroups: unknown[]
      missingGroupsDegraded?: boolean
      pendingReviews: unknown[]
      pendingReviewsDegraded?: boolean
    }
  }
  name?: string
  rol?: string
}

function DashboardRoleProbe({ data, name = 'role' }: DashboardRoleProbeProps) {
  const queues = data.casas_anfitrionas_queues

  return (
    <section data-testid="role-probe">
      <span>{name}</span>
      <span>missing:{queues?.missingGroups.length ?? 'none'}</span>
      <span>pending:{queues?.pendingReviews.length ?? 'none'}</span>
      <span>missing-degraded:{String(queues?.missingGroupsDegraded ?? false)}</span>
      <span>pending-degraded:{String(queues?.pendingReviewsDegraded ?? false)}</span>
    </section>
  )
}

describe('dashboard host-home queue loading', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    obtenerGruposSinCasaAnfitriona.mockResolvedValue({ success: true, data: [{ grupo_id: 'group-1' }] })
    obtenerCasasRevisionPendiente.mockResolvedValue({ success: true, data: [{ review_id: 'review-1' }] })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('loads active host-home queues through server-action wrappers for operational roles', async () => {
    obtenerDatosDashboard.mockResolvedValue({ rol: 'admin', widgets: {} })
    const { default: PaginaTablero } = await import('@/app/(auth)/dashboard/page')

    render(await PaginaTablero())

    expect(obtenerGruposSinCasaAnfitriona).toHaveBeenCalledWith({ scope: 'active' })
    expect(obtenerCasasRevisionPendiente).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('role-probe')).toHaveTextContent('admin:admin')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('missing:1')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('pending:1')
  })

  it('does not load operational host-home queues for member dashboards', async () => {
    obtenerDatosDashboard.mockResolvedValue({ rol: 'miembro', widgets: {} })
    const { default: PaginaTablero } = await import('@/app/(auth)/dashboard/page')

    render(await PaginaTablero())

    expect(obtenerGruposSinCasaAnfitriona).not.toHaveBeenCalled()
    expect(obtenerCasasRevisionPendiente).not.toHaveBeenCalled()
    expect(screen.getByTestId('role-probe')).toHaveTextContent('miembro')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('missing:none')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('pending:none')
  })

  it('keeps the dashboard usable when optional queue wrappers fail', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    obtenerDatosDashboard.mockResolvedValue({ rol: 'admin', widgets: {} })
    obtenerGruposSinCasaAnfitriona.mockRejectedValue(new Error('queue rpc unavailable'))
    obtenerCasasRevisionPendiente.mockResolvedValue({ success: false, error: 'No autorizado' })
    const { default: PaginaTablero } = await import('@/app/(auth)/dashboard/page')

    render(await PaginaTablero())

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('role-probe')).toHaveTextContent('admin:admin')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('missing:0')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('pending:0')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('missing-degraded:true')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('pending-degraded:true')
    expect(consoleError).toHaveBeenCalledWith('Error cargando colas de Casas Anfitrionas:', expect.any(Error))
  })

  it('preserves degraded queue state when optional queue wrappers do not complete promptly', async () => {
    jest.useFakeTimers()
    obtenerDatosDashboard.mockResolvedValue({ rol: 'admin', widgets: {} })
    obtenerGruposSinCasaAnfitriona.mockReturnValue(new Promise(() => undefined))
    obtenerCasasRevisionPendiente.mockReturnValue(new Promise(() => undefined))
    const { default: PaginaTablero, HOST_HOME_QUEUE_FETCH_TIMEOUT_MS } = await import('@/app/(auth)/dashboard/page')

    const page = PaginaTablero()
    await jest.advanceTimersByTimeAsync(HOST_HOME_QUEUE_FETCH_TIMEOUT_MS)
    render(await page)

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('role-probe')).toHaveTextContent('admin:admin')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('missing:0')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('pending:0')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('missing-degraded:true')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('pending-degraded:true')
  })

  it('does not request pending-review queue data for roles that cannot review Casas', async () => {
    obtenerDatosDashboard.mockResolvedValue({ rol: 'lider', widgets: {} })
    const { default: PaginaTablero } = await import('@/app/(auth)/dashboard/page')

    render(await PaginaTablero())

    expect(obtenerGruposSinCasaAnfitriona).toHaveBeenCalledWith({ scope: 'active' })
    expect(obtenerCasasRevisionPendiente).not.toHaveBeenCalled()
    expect(screen.getByTestId('role-probe')).toHaveTextContent('lider')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('missing:1')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('pending:0')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('pending-degraded:false')
  })
})

describe('host-home review role predicate', () => {
  it('keeps review access scoped to admin, pastor, and director-general roles', () => {
    expect(canReviewHostHomes('admin')).toBe(true)
    expect(canReviewHostHomes('pastor')).toBe(true)
    expect(canReviewHostHomes('director-general')).toBe(true)
    expect(canReviewHostHomes('director-etapa')).toBe(false)
    expect(canReviewHostHomes('lider')).toBe(false)
    expect(canReviewHostHomes(undefined)).toBe(false)
  })
})
