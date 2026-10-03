import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'

import { CampusProvider, useCampus } from '@/hooks/useCampus'

type CurrentUserStub = { authUserId: string | null; roles: string[]; loading: boolean }

const signedInAdmin: CurrentUserStub = { authUserId: 'auth-1', roles: ['admin'], loading: false }
let mockCurrentUser: CurrentUserStub = signedInAdmin
const mockCreateClient = jest.fn()

jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => mockCurrentUser }))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => mockCreateClient() }))

const CAMPUS_COOKIE = 'gc_campus_activo'
const STORAGE_KEY_CAMPUS = 'gc_campus_activo'
const campusList = [
  { id: 'campus-1', nombre: 'Barquisimeto', codigo: 'BQT', tipo: 'sede', activo: true },
  { id: 'campus-2', nombre: 'Cabudare', codigo: 'CAB', tipo: 'sede', activo: true },
]

type QueryMock = {
  select: jest.Mock
  eq: jest.Mock
  order: jest.Mock
  then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => unknown
}

function createSupabaseMock({ campusListPending = false } = {}) {
  const tableQuery = (rows: unknown[], pending: boolean) => {
    const query: QueryMock = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      order: jest.fn(() => query),
      then: (resolve) => (pending ? undefined : resolve({ data: rows, error: null })),
    }
    return query
  }
  return {
    from: jest.fn((table: string) => (table === 'campus' ? tableQuery(campusList, campusListPending) : tableQuery([], false))),
  }
}

function readCampusCookie(): string | undefined {
  return document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${CAMPUS_COOKIE}=`))
    ?.slice(CAMPUS_COOKIE.length + 1)
}

function CampusProbe() {
  const { campusId, loading, seleccionarCampus } = useCampus()
  return (
    <div>
      <span>{loading ? 'loading' : `campus:${campusId ?? 'none'}`}</span>
      <button onClick={() => seleccionarCampus('campus-2')}>select campus-2</button>
      <button onClick={() => seleccionarCampus(null)}>clear campus</button>
    </div>
  )
}

describe('CampusProvider cookie mirrors the selection', () => {
  beforeEach(() => {
    mockCurrentUser = signedInAdmin
    localStorage.clear()
    document.cookie = `${CAMPUS_COOKIE}=; path=/; max-age=0`
    mockCreateClient.mockReset()
  })

  it('cookie mirrors the selection restored from localStorage', async () => {
    localStorage.setItem(STORAGE_KEY_CAMPUS, 'campus-1')
    mockCreateClient.mockReturnValue(createSupabaseMock())

    render(<CampusProvider><CampusProbe /></CampusProvider>)

    expect(await screen.findByText('campus:campus-1')).toBeInTheDocument()
    expect(readCampusCookie()).toBe('campus-1')
  })

  it('cookie mirrors the selection when it changes and is removed when it is cleared', async () => {
    mockCreateClient.mockReturnValue(createSupabaseMock())
    render(<CampusProvider><CampusProbe /></CampusProvider>)
    expect(await screen.findByText('campus:none')).toBeInTheDocument()
    expect(readCampusCookie()).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: 'select campus-2' }))
    expect(readCampusCookie()).toBe('campus-2')

    fireEvent.click(screen.getByRole('button', { name: 'clear campus' }))
    expect(readCampusCookie()).toBeUndefined()
  })

  it.each([
    ['the identity', { authUserId: null, roles: [], loading: true }, false],
    ['the campus list', signedInAdmin, true],
  ])('cookie mirrors the selection only after loading, so it is kept while waiting for %s', async (_label, currentUser, campusListPending) => {
    mockCurrentUser = currentUser
    document.cookie = `${CAMPUS_COOKIE}=campus-1; path=/`
    mockCreateClient.mockReturnValue(createSupabaseMock({ campusListPending }))

    render(<CampusProvider><CampusProbe /></CampusProvider>)
    await act(async () => {})

    expect(screen.getByText('loading')).toBeInTheDocument()
    expect(readCampusCookie()).toBe('campus-1')
  })

  it('cookie mirrors the selection reset on sign-out', async () => {
    localStorage.setItem(STORAGE_KEY_CAMPUS, 'campus-1')
    mockCreateClient.mockReturnValue(createSupabaseMock())
    const { rerender } = render(<CampusProvider><CampusProbe /></CampusProvider>)
    expect(await screen.findByText('campus:campus-1')).toBeInTheDocument()

    mockCurrentUser = { authUserId: null, roles: [], loading: false }
    rerender(<CampusProvider><CampusProbe /></CampusProvider>)

    expect(await screen.findByText('campus:none')).toBeInTheDocument()
    expect(readCampusCookie()).toBeUndefined()
  })
})
