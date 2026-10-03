import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'

import DashboardAdmin, { KPI_RETRY_DELAY_MS } from '@/components/dashboard/roles/DashboardAdmin'

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

  it('keeps the server numbers on mount when they already belong to the selected campus', async () => {
    mockCampus.campusId = 'campus-1'
    const supabase = createSupabaseMock()
    mockCreateClient.mockReturnValue(supabase)

    const { rerender } = render(<DashboardAdmin rol="admin" data={serverData} campusInicialId="campus-1" />)
    await act(async () => {})

    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(screen.getByText('Total Miembros: 869')).toBeInTheDocument()

    mockCampus.campusId = null
    rerender(<DashboardAdmin rol="admin" data={serverData} campusInicialId="campus-1" />)
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('resumen_dashboard_admin', {}))
  })

  it('refreshes on mount when the selected campus differs from the server campus', async () => {
    mockCampus.campusId = 'campus-2'
    const supabase = createSupabaseMock()
    mockCreateClient.mockReturnValue(supabase)

    render(<DashboardAdmin rol="admin" data={serverData} campusInicialId="campus-1" />)

    expect(await screen.findByText('Total Miembros: 312')).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('resumen_dashboard_admin', { p_campus_id: 'campus-2' })
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

// One scripted reply per campus and attempt; both lookups of an attempt share it.
type ScriptedReply = {
  wait?: Promise<void>
  usuarios?: number | null
  grupos?: number
  resumenError?: Error
  gruposError?: Error
}

function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

function createScriptedSupabase(script: (campus: string | null, attempt: number) => ScriptedReply) {
  const nextAttempt = (attempts: Map<string | null, number>, campus: string | null) => {
    const attempt = attempts.get(campus) ?? 0
    attempts.set(campus, attempt + 1)
    return script(campus, attempt)
  }
  const rpcAttempts = new Map<string | null, number>()
  const gruposAttempts = new Map<string | null, number>()
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
    rpc: jest.fn(async (_name: string, args: { p_campus_id?: string }) => {
      const reply = nextAttempt(rpcAttempts, args.p_campus_id ?? null)
      await reply.wait
      return reply.resumenError
        ? { data: null, error: reply.resumenError }
        : { data: { total_usuarios: reply.usuarios ?? null, total_grupos: 999 }, error: null }
    }),
    from: jest.fn(() => {
      let campus: string | null = null
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          if (column === 'campus_id') campus = value
          return query
        },
        then: (resolve: (value: { count: number | null; error: Error | null }) => unknown) => {
          const reply = nextAttempt(gruposAttempts, campus)
          return Promise.resolve(reply.wait).then(() => resolve(reply.gruposError
            ? { count: null, error: reply.gruposError }
            : { count: reply.grupos ?? null, error: null }))
        },
      }
      return query
    }),
  }
}

describe('DashboardAdmin campus refresh failures', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.useFakeTimers()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    mockCampus.campusId = null
    mockCampus.loading = false
    mockCreateClient.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
    consoleError.mockRestore()
  })

  function expectServerNumbers() {
    expect(screen.getByText('Total Miembros: 869')).toBeInTheDocument()
    expect(screen.getByText('Grupos Activos: 74')).toBeInTheDocument()
  }

  it('keeps the newer campus numbers when an older campus reply arrives last', async () => {
    const campusAReply = deferred()
    mockCreateClient.mockReturnValue(createScriptedSupabase((campus) => campus === 'campus-a'
      ? { wait: campusAReply.promise, usuarios: 100, grupos: 10 }
      : { usuarios: 200, grupos: 20 }))
    mockCampus.campusId = 'campus-a'
    const { rerender } = render(<DashboardAdmin rol="admin" data={serverData} />)

    mockCampus.campusId = 'campus-b'
    rerender(<DashboardAdmin rol="admin" data={serverData} />)
    await waitFor(() => expect(screen.getByText('Total Miembros: 200')).toBeInTheDocument())

    await act(async () => { campusAReply.resolve() })

    expect(screen.getByText('Total Miembros: 200')).toBeInTheDocument()
    expect(screen.getByText('Grupos Activos: 20')).toBeInTheDocument()
  })

  it('keeps both numbers when the groups count fails, then applies both after one retry', async () => {
    const supabase = createScriptedSupabase((_campus, attempt) => attempt === 0
      ? { usuarios: 312, gruposError: new Error('grupos unavailable') }
      : { usuarios: 312, grupos: 18 })
    mockCreateClient.mockReturnValue(supabase)
    mockCampus.campusId = 'campus-1'

    render(<DashboardAdmin rol="admin" data={serverData} />)
    await waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1))
    expectServerNumbers()

    await act(async () => { await jest.advanceTimersByTimeAsync(KPI_RETRY_DELAY_MS) })

    await waitFor(() => expect(screen.getByText('Total Miembros: 312')).toBeInTheDocument())
    expect(screen.getByText('Grupos Activos: 18')).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['an error', { resumenError: new Error('resumen unavailable'), grupos: 18 }],
    ['no total_usuarios', { usuarios: null, grupos: 18 }],
  ] satisfies Array<[string, ScriptedReply]>)('keeps both numbers when the summary returns %s, retrying only once', async (_label, reply) => {
    const supabase = createScriptedSupabase(() => reply)
    mockCreateClient.mockReturnValue(supabase)
    mockCampus.campusId = 'campus-1'

    render(<DashboardAdmin rol="admin" data={serverData} />)
    await waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1))
    expectServerNumbers()

    await act(async () => { await jest.advanceTimersByTimeAsync(KPI_RETRY_DELAY_MS * 3) })

    expectServerNumbers()
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['a newer campus change', (rerender: (ui: React.ReactElement) => void) => {
      mockCampus.campusId = 'campus-2'
      rerender(<DashboardAdmin rol="admin" data={serverData} />)
    }],
    ['unmounting', (_rerender: (ui: React.ReactElement) => void, unmount: () => void) => unmount()],
  ])('cancels the pending retry on %s', async (_label, interrupt) => {
    const supabase = createScriptedSupabase((campus) => campus === 'campus-1'
      ? { usuarios: 312, gruposError: new Error('grupos unavailable') }
      : { usuarios: 200, grupos: 20 })
    mockCreateClient.mockReturnValue(supabase)
    mockCampus.campusId = 'campus-1'
    const { rerender, unmount } = render(<DashboardAdmin rol="admin" data={serverData} />)
    await waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1))

    interrupt(rerender, unmount)
    await act(async () => { await jest.advanceTimersByTimeAsync(KPI_RETRY_DELAY_MS * 3) })

    expect(supabase.rpc.mock.calls.filter(([, args]) => args.p_campus_id === 'campus-1')).toHaveLength(1)
  })
})
