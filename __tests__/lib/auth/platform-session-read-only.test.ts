import {
  findDreamTeamCapabilityGrantsByPersonaId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'

type CapabilityGrantRow = {
  capability_key: string
  experience: string
  scope_type: string
  scope_id: string | null
  source: string
  granted_at: string
  revoked_at: string | null
}

function createCapabilitySupabaseClient(rows: CapabilityGrantRow[]) {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    is: jest.fn(),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.is.mockImplementation((column: string, value: null) => Promise.resolve({
    data: rows.filter((row) => column !== 'revoked_at' || row.revoked_at === value),
    error: null,
  }))

  const supabase = {
    from: jest.fn((table: string) => {
      if (table !== 'dream_team_capability_grants') throw new Error(`Unexpected table ${table}`)
      return query
    }),
  }

  return { supabase, query }
}

const activeRows: CapabilityGrantRow[] = [
  {
    capability_key: 'pastoral.read.all',
    experience: 'pastoral',
    scope_type: 'global',
    scope_id: null,
    source: 'manual',
    granted_at: '2026-07-24T10:00:00.000Z',
    revoked_at: null,
  },
  {
    capability_key: 'pastoral.admin.manage',
    experience: 'pastoral',
    scope_type: 'equipo',
    scope_id: 'team-1',
    source: 'role',
    granted_at: '2026-07-24T11:00:00.000Z',
    revoked_at: null,
  },
]

const expectedCapabilities = [
  {
    key: 'pastoral.read.all',
    experience: 'pastoral',
    scopeType: 'global',
    scopeId: undefined,
    source: 'manual',
    grantedAt: '2026-07-24T10:00:00.000Z',
  },
  {
    key: 'pastoral.admin.manage',
    experience: 'pastoral',
    scopeType: 'equipo',
    scopeId: 'team-1',
    source: 'role',
    grantedAt: '2026-07-24T11:00:00.000Z',
  },
]

describe('read-only PlatformSession capabilities', () => {
  it('resolves multiple active capabilities from Supabase', async () => {
    const { supabase, query } = createCapabilitySupabaseClient(activeRows)

    const session = await resolveReadOnlyPlatformSession({
      subjectAuthId: 'auth-1',
      findPersonaByAuthId: jest.fn().mockResolvedValue({ id: 'persona-1', authId: 'auth-1' }),
      capabilitySupabase: supabase,
    })

    expect(session?.capabilities).toEqual(expectedCapabilities)
    expect(query.select).toHaveBeenCalledWith('capability_key, experience, scope_type, scope_id, source, granted_at, revoked_at')
    expect(query.eq).toHaveBeenCalledWith('persona_id', 'persona-1')
    expect(query.is).toHaveBeenCalledWith('revoked_at', null)
  })

  it('maps nullable scope ids and excludes revoked grants', async () => {
    const revokedRow: CapabilityGrantRow = {
      ...activeRows[1],
      capability_key: 'pastoral.one_on_one.create',
      revoked_at: '2026-07-24T12:00:00.000Z',
    }
    const { supabase } = createCapabilitySupabaseClient([...activeRows, revokedRow])

    await expect(findDreamTeamCapabilityGrantsByPersonaId(supabase, 'persona-1')).resolves.toEqual(expectedCapabilities)
  })
})
