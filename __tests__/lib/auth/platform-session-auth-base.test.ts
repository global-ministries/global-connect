import { requireAuth, requireRole } from '@/lib/auth/requireAuth'
import type { AuthBaseSupabaseClient } from '@/lib/auth/platformSessionReadOnly'
import { getUserWithRoles } from '@/lib/getUserWithRoles'

const createSupabaseServerClient = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}))

type AuthUser = { id: string; email?: string }
type PersonaRow = { id: string; auth_id: string | null }
type CapabilityGrantRow = {
  capability_key: string
  experience: string
  scope_type: string
  scope_id: string | null
  source: string
  granted_at: string
  revoked_at: string | null
}

const defaultUser = { id: 'auth-1', email: 'staff@example.com' } satisfies AuthUser
const linkedPersona = { id: 'persona-1', auth_id: 'auth-1' } satisfies PersonaRow

function createAuthBaseClient(input: {
  user?: AuthUser | null
  authError?: Error | null
  rolesData?: unknown
  rolesError?: Error | null
  personaData?: PersonaRow | null
  personaError?: Error | null
  capabilityRows?: CapabilityGrantRow[]
}) {
  const personaData = input.personaData === undefined ? linkedPersona : input.personaData
  const personaQuery = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data: personaData, error: input.personaError ?? null }),
  }
  personaQuery.select.mockReturnValue(personaQuery)
  personaQuery.eq.mockReturnValue(personaQuery)
  const capabilityQuery = {
    select: jest.fn(),
    eq: jest.fn(),
    is: jest.fn().mockResolvedValue({ data: input.capabilityRows ?? [], error: null }),
  }
  capabilityQuery.select.mockReturnValue(capabilityQuery)
  capabilityQuery.eq.mockReturnValue(capabilityQuery)

  const client: AuthBaseSupabaseClient = {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: input.user === undefined ? defaultUser : input.user }, error: input.authError ?? null }),
    },
    rpc: jest.fn().mockResolvedValue({ data: input.rolesData ?? [], error: input.rolesError ?? null }),
    from: jest.fn((table: string) => {
      if (table === 'usuarios') return personaQuery
      if (table === 'dream_team_capability_grants') return capabilityQuery
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { client, personaQuery, capabilityQuery }
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

  it('loads active capability grants into the auth base platformSession', async () => {
    const capabilityRows: CapabilityGrantRow[] = [{
      capability_key: 'pastoral.read.all',
      experience: 'pastoral',
      scope_type: 'global',
      scope_id: null,
      source: 'manual',
      granted_at: '2026-07-24T10:00:00.000Z',
      revoked_at: null,
    }]
    const { client, capabilityQuery } = createAuthBaseClient({ capabilityRows })

    const result = await getUserWithRoles(client)

    expect(result?.platformSession?.capabilities).toEqual([{
      key: 'pastoral.read.all',
      experience: 'pastoral',
      scopeType: 'global',
      scopeId: undefined,
      source: 'manual',
      grantedAt: '2026-07-24T10:00:00.000Z',
    }])
    expect(capabilityQuery.is).toHaveBeenCalledWith('revoked_at', null)
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

  it('resolves platformSession with empty roles when legacy roles lookup fails', async () => {
    const { client } = createAuthBaseClient({
      rolesError: new Error('roles rpc timeout'),
    })

    await expect(getUserWithRoles(client)).resolves.toEqual({
      user: defaultUser,
      roles: [],
      platformSession: {
        personaId: 'persona-1',
        subjectAuthId: 'auth-1',
        globalRoles: [],
        contexts: [],
        capabilities: [],
      },
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

  it('keeps requireAuth authenticated when platformSession lookup fails closed', async () => {
    const { client } = createAuthBaseClient({
      personaError: new Error('platform lookup timeout'),
    })
    createSupabaseServerClient.mockResolvedValue(client)

    await expect(requireAuth()).resolves.toEqual({
      authId: 'auth-1',
      email: 'staff@example.com',
      platformSession: null,
    })
  })

  it('keeps requireAuth authenticated when no Persona row is linked', async () => {
    const { client } = createAuthBaseClient({
      personaData: null,
    })
    createSupabaseServerClient.mockResolvedValue(client)

    await expect(requireAuth()).resolves.toEqual({
      authId: 'auth-1',
      email: 'staff@example.com',
      platformSession: null,
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
