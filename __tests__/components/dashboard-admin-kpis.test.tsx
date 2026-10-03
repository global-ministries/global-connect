import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'

import DashboardAdmin from '@/components/dashboard/roles/DashboardAdmin'

const mockCampus: { campusId: string | null; loading: boolean } = { campusId: null, loading: false }
const mockCreateClient = jest.fn()

jest.mock('@/hooks/useCampus', () => ({ useCampus: () => mockCampus }))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => mockCreateClient() }))
jest.mock('@/components/dashboard/widgets/MetricWidget', () => ({
  MetricWidget: ({ title, value }: { title: string; value: string }) => <div>{`${title}: ${value}`}</div>,
}))
jest.mock('@/components/dashboard/widgets/DonutWidget', () => ({ DonutWidget: ({ title }: { title: string }) => <div>{title}</div> }))
jest.mock('@/components/dashboard/widgets/ActivityWidget', () => ({ ActivityWidget: ({ title }: { title: string }) => <div>{title}</div> }))
jest.mock('@/components/dashboard/widgets/BirthdayWidget', () => ({ BirthdayWidget: ({ title }: { title: string }) => <div>{title}</div> }))
jest.mock('@/components/dashboard/widgets/RiskGroupsWidget', () => ({ RiskGroupsWidget: ({ title }: { title: string }) => <div>{title}</div> }))
jest.mock('@/components/dashboard/widgets/NotasLideresWidget', () => ({ NotasLideresWidget: ({ title }: { title: string }) => <div>{title}</div> }))

// Server numbers are global: every registered person and every active group.
const serverData = { kpis_globales: { total_miembros: { valor: 869 }, grupos_activos: { valor: 74 } } }

type GruposQueryMock = {
  select: jest.Mock
  eq: jest.Mock
  then: (resolve: (value: { count: number; error: null }) => unknown) => unknown
}

function createSupabaseMock({ totalUsuarios = 312, totalGrupos = 40, gruposActivos = 18 } = {}) {
  const eq = jest.fn()
  const gruposQuery: GruposQueryMock = {
    select: jest.fn(() => gruposQuery),
    eq: eq.mockImplementation(() => gruposQuery),
    then: (resolve: (value: { count: number; error: null }) => unknown) => resolve({ count: gruposActivos, error: null }),
  }
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
    rpc: jest.fn().mockResolvedValue({ data: { total_usuarios: totalUsuarios, total_grupos: totalGrupos }, error: null }),
    from: jest.fn(() => gruposQuery),
    eq,
  }
}

describe('DashboardAdmin KPIs', () => {
  beforeEach(() => {
    mockCampus.campusId = null
    mockCampus.loading = false
    mockCreateClient.mockReset()
  })

  it('keeps the global server numbers on mount when no campus is selected', async () => {
    const supabase = createSupabaseMock()
    mockCreateClient.mockReturnValue(supabase)

    render(<DashboardAdmin rol="admin" data={serverData} />)
    await act(async () => {})

    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
    expect(screen.getByText('Total Miembros: 869')).toBeInTheDocument()
    expect(screen.getByText('Grupos Activos: 74')).toBeInTheDocument()
  })

  it('scopes the members and active groups to the campus selected on mount', async () => {
    mockCampus.campusId = 'campus-1'
    const supabase = createSupabaseMock()
    mockCreateClient.mockReturnValue(supabase)

    render(<DashboardAdmin rol="admin" data={serverData} />)

    expect(await screen.findByText('Total Miembros: 312')).toBeInTheDocument()
    expect(screen.getByText('Grupos Activos: 18')).toBeInTheDocument()
    expect(screen.queryByText('Grupos Activos: 40')).not.toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('resumen_dashboard_admin', { p_campus_id: 'campus-1' })
    expect(supabase.from).toHaveBeenCalledWith('grupos')
    expect(supabase.eq).toHaveBeenCalledWith('activo', true)
    expect(supabase.eq).toHaveBeenCalledWith('eliminado', false)
    expect(supabase.eq).toHaveBeenCalledWith('campus_id', 'campus-1')
  })

  it('refreshes when the campus changes and goes back to global numbers when it is cleared', async () => {
    const supabase = createSupabaseMock()
    mockCreateClient.mockReturnValue(supabase)
    const { rerender } = render(<DashboardAdmin rol="admin" data={serverData} />)
    await act(async () => {})
    expect(supabase.rpc).not.toHaveBeenCalled()

    mockCampus.campusId = 'campus-2'
    rerender(<DashboardAdmin rol="admin" data={serverData} />)
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('resumen_dashboard_admin', { p_campus_id: 'campus-2' }))

    mockCampus.campusId = null
    rerender(<DashboardAdmin rol="admin" data={serverData} />)
    await waitFor(() => expect(supabase.rpc).toHaveBeenLastCalledWith('resumen_dashboard_admin', {}))
    expect(supabase.eq).not.toHaveBeenCalledWith('campus_id', null)
  })

  it('never refreshes for a director-general, whose data is already scoped by the server', async () => {
    mockCampus.campusId = 'campus-1'
    const supabase = createSupabaseMock()
    mockCreateClient.mockReturnValue(supabase)

    render(<DashboardAdmin rol="director-general" data={serverData} />)
    await act(async () => {})

    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(screen.getByText('Total Miembros: 869')).toBeInTheDocument()
  })
})
