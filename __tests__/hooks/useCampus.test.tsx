/**
 * CampusProvider reads the current user's roles from CurrentUserProvider
 * instead of calling obtener_roles_usuario a second time. With its own call,
 * a transient RPC failure there left esSuperadmin false and the campus list
 * empty, so the campus selector disappeared even while the sidebar (fed by
 * useCurrentUser) still showed the full menu. One source of truth keeps the
 * two consistent, and the provider waits while that source is loading so it
 * never decides esSuperadmin from the empty roles array of a pending load.
 */

import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'

import { CampusProvider, useCampus } from '@/hooks/useCampus'

type CurrentUserStub = { authUserId: string | null; roles: string[]; loading: boolean }

let currentUser: CurrentUserStub = { authUserId: null, roles: [], loading: true }

jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => currentUser }))

const createClient = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => createClient() }))

const CAMPUS_ROWS = [
  { id: 'campus-1', nombre: 'Central', codigo: 'CEN', tipo: 'presencial', activo: true },
  { id: 'campus-2', nombre: 'Norte', codigo: 'NOR', tipo: 'presencial', activo: true },
]

function setupSupabaseClient() {
  const campusQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data: CAMPUS_ROWS, error: null }),
  }
  // Non-superadmins read their assigned campus through the join; the
  // inactive one must be filtered out.
  const usuarioCampusQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({
      data: [{ campus: CAMPUS_ROWS[1] }, { campus: { ...CAMPUS_ROWS[0], activo: false } }],
      error: null,
    }),
  }
  const localidadesQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data: [], error: null }),
  }
  const client = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null }) },
    rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
    from: jest.fn((table: string) => {
      if (table === 'campus') return campusQuery
      if (table === 'usuario_campus') return usuarioCampusQuery
      if (table === 'campus_localidades') return localidadesQuery
      throw new Error(`Unexpected table ${table}`)
    }),
  }
  createClient.mockReturnValue(client)
  return { client, campusQuery, usuarioCampusQuery }
}

function campusQueryCount(client: { from: jest.Mock }) {
  return client.from.mock.calls.filter(([table]) => table === 'campus').length
}

function wrapper({ children }: { children: ReactNode }) {
  return <CampusProvider>{children}</CampusProvider>
}

describe('CampusProvider', () => {
  beforeEach(() => {
    createClient.mockReset()
    window.localStorage.clear()
  })

  it('derives esSuperadmin from the useCurrentUser roles without its own roles RPC', async () => {
    currentUser = { authUserId: 'auth-1', roles: ['admin'], loading: false }
    const { client } = setupSupabaseClient()

    const { result } = renderHook(() => useCampus(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.esSuperadmin).toBe(true)
    expect(result.current.campusDisponibles).toEqual(CAMPUS_ROWS)
    expect(client.from).toHaveBeenCalledWith('campus')
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('stays loading while useCurrentUser is loading, then resolves once its roles arrive', async () => {
    currentUser = { authUserId: null, roles: [], loading: true }
    const { client } = setupSupabaseClient()

    const { result, rerender } = renderHook(() => useCampus(), { wrapper })

    // Give any (wrong) eager load a chance to run before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current.loading).toBe(true)
    expect(result.current.esSuperadmin).toBe(false)
    expect(client.from).not.toHaveBeenCalled()
    expect(client.rpc).not.toHaveBeenCalled()

    currentUser = { authUserId: 'auth-1', roles: ['pastor'], loading: false }
    rerender()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.esSuperadmin).toBe(true)
    expect(result.current.campusDisponibles).toEqual(CAMPUS_ROWS)
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('reads the assigned campus for a non-superadmin, and reloads (loading again) when the flag flips', async () => {
    currentUser = { authUserId: 'auth-1', roles: ['lider'], loading: false }
    const { client, campusQuery, usuarioCampusQuery } = setupSupabaseClient()

    const { result, rerender } = renderHook(() => useCampus(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.esSuperadmin).toBe(false)
    expect(usuarioCampusQuery.eq).toHaveBeenCalledWith('usuario_id', 'auth-1')
    expect(result.current.campusDisponibles).toEqual([CAMPUS_ROWS[1]])
    // The only assigned campus is selected automatically.
    expect(result.current.campusId).toBe('campus-2')
    expect(campusQueryCount(client)).toBe(0)

    let resolveCampus!: (value: { data: typeof CAMPUS_ROWS; error: null }) => void
    campusQuery.order.mockReturnValueOnce(new Promise((resolve) => { resolveCampus = resolve }))
    currentUser = { authUserId: 'auth-1', roles: ['lider', 'admin'], loading: false }
    rerender()

    // The superadmin flag changed: loading until the new list arrives.
    await waitFor(() => expect(result.current.loading).toBe(true))
    await act(async () => {
      resolveCampus({ data: CAMPUS_ROWS, error: null })
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.esSuperadmin).toBe(true)
    expect(result.current.campusDisponibles).toEqual(CAMPUS_ROWS)
  })

  it('resets the campus state to its initial values when the user signs out', async () => {
    window.localStorage.setItem('gc_campus_activo', 'campus-1')
    currentUser = { authUserId: 'auth-1', roles: ['admin'], loading: false }
    setupSupabaseClient()

    const { result, rerender } = renderHook(() => useCampus(), { wrapper })

    await waitFor(() => expect(result.current.campusId).toBe('campus-1'))
    expect(result.current.esSuperadmin).toBe(true)

    currentUser = { authUserId: null, roles: [], loading: false }
    rerender()

    await waitFor(() => expect(result.current.campusDisponibles).toEqual([]))
    expect(result.current.esSuperadmin).toBe(false)
    expect(result.current.campusId).toBeNull()
    expect(result.current.campusActivo).toBeNull()
    expect(result.current.localidadId).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('does not refetch the campus list when useCurrentUser only toggles loading for the same identity and flag', async () => {
    currentUser = { authUserId: 'auth-1', roles: ['admin'], loading: false }
    const { client } = setupSupabaseClient()

    const { result, rerender } = renderHook(() => useCampus(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(campusQueryCount(client)).toBe(1)

    // A non-signed-out reload (e.g. the SIGNED_IN refetch) keeps the
    // identity and the roles while it runs.
    currentUser = { authUserId: 'auth-1', roles: ['admin'], loading: true }
    rerender()
    expect(result.current.loading).toBe(false)

    // Same identity, same flag — a new roles array does not count as a change.
    currentUser = { authUserId: 'auth-1', roles: ['admin'], loading: false }
    rerender()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(campusQueryCount(client)).toBe(1)
    expect(result.current.loading).toBe(false)
    expect(result.current.campusDisponibles).toEqual(CAMPUS_ROWS)
  })
})
