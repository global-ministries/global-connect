import { requireAuth, requireRole } from '@/lib/auth/requireAuth'
import type { AuthBaseSupabaseClient } from '@/lib/auth/platformSessionReadOnly'
import { getUserWithRoles } from '@/lib/getUserWithRoles'

const createSupabaseServerClient = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}))

type AuthUser = { id: string; email?: string }
type PersonaRow = { id: string; auth_id: string | null }

const defaultUser = { id: 'auth-1', email: 'staff@example.com' } satisfies AuthUser
const linkedPersona = { id: 'persona-1', auth_id: 'auth-1' } satisfies PersonaRow

function createAuthBaseClient(input: {
  user?: AuthUser | null
  authError?: Error | null
  rolesData?: unknown
  rolesError?: Error | null
  personaData?: PersonaRow | null
  personaError?: Error | null
}) {
  const personaQuery = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data: input.personaData ?? linkedPersona, error: input.personaError ?? null }),
  }
  personaQuery.select.mockReturnValue(personaQuery)
  personaQuery.eq.mockReturnValue(personaQuery)

  const client: AuthBaseSupabaseClient = {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: input.user === undefined ? defaultUser : input.user }, error: input.authError ?? null }),
    },
    rpc: jest.fn().mockResolvedValue({ data: input.rolesData ?? [], error: input.rolesError ?? null }),
    from: jest.fn((table: string) => {
      if (table !== 'usuarios') throw new Error(`Unexpected table ${table}`)
      return personaQuery
    }),
  }

  return { client, personaQuery }
}

describe('platformSession read-only auth base integration', () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset()
  })

  it('exposes platformSession from getUserWithRoles without changing legacy roles', async () => {
    const { client, personaQuery } = createAuthBaseClient({
      rolesData: [{ nombre_interno: 'admin' }, 'lider'],
    })

    const result = await getUserWithRoles(client)

    expect(result).toEqual({
      user: defaultUser,
      roles: ['admin', 'lider'],
      platformSession: {
        personaId: 'persona-1',
        subjectAuthId: 'auth-1',
        globalRoles: ['admin', 'lider'],
        contexts: [],
        capabilities: [],
      },
    })
    expect(personaQuery.select).toHaveBeenCalledWith('id, auth_id')
    expect(personaQuery.eq).toHaveBeenCalledWith('auth_id', 'auth-1')
  })

  it('keeps legacy roles when platformSession lookup fails closed', async () => {
    const { client } = createAuthBaseClient({
      rolesData: ['admin'],
      personaError: new Error('platform lookup timeout'),
    })

    await expect(getUserWithRoles(client)).resolves.toEqual({
      user: defaultUser,
      roles: ['admin'],
      platformSession: null,
    })
  })

  it('adds read-only platformSession to requireAuth when persona lookup is safe', async () => {
    const { client } = createAuthBaseClient({})
    createSupabaseServerClient.mockResolvedValue(client)

    await expect(requireAuth()).resolves.toEqual({
      authId: 'auth-1',
      email: 'staff@example.com',
      platformSession: {
        personaId: 'persona-1',
        subjectAuthId: 'auth-1',
        globalRoles: [],
        contexts: [],
        capabilities: [],
      },
    })
  })

  it('preserves requireRole legacy fallback when platformSession lookup fails', async () => {
    const { client } = createAuthBaseClient({
      rolesData: ['admin'],
      personaError: new Error('platform lookup timeout'),
    })
    createSupabaseServerClient.mockResolvedValue(client)

    await expect(requireRole('admin')).resolves.toEqual({
      authId: 'auth-1',
      email: 'staff@example.com',
      platformSession: null,
    })
  })

  it('does not authorize requireRole from platformSession availability alone', async () => {
    const { client } = createAuthBaseClient({ rolesData: [] })
    createSupabaseServerClient.mockResolvedValue(client)

    await expect(requireRole('admin')).rejects.toThrow('Permiso denegado: se requiere rol admin')
  })
})
