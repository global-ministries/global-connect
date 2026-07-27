/**
 * W26 — Defensive guard for hierarchical-visibility helpers.
 *
 * The runtime error in /pastor surfaced as "Application error: a client-side
 * exception has occurred" because getVisiblePastoralOneOnOneIds threw on any
 * failure (auth error, RPC error, or unexpected payload shape). The page did
 * not catch it, so the server component crashed.
 *
 * The fix wraps the helper with a fallback that returns an empty array on
 * failure, logs the failure in non-production environments, and prevents the
 * page from crashing. The page already handles the empty case (no crisis
 * alerts, no 1:1 rows).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getPersonasUnderMe,
  getVisiblePastoralOneOnOneIds,
  visiblePersonaIdsOrNone,
  HierarchicalVisibilityError,
} from '@/lib/platform/pastoral/hierarchical-visibility'

type RpcResult = { data: unknown; error: unknown }

function makeClient(options: {
  user?: { id: string } | null
  rpcResult?: RpcResult
  participantsResult?: { data: unknown; error: unknown }
}): SupabaseClient {
  const auth = {
    getUser: jest.fn(async () => ({
      data: { user: options.user === undefined ? { id: 'auth-1' } : options.user },
      error: null,
    })),
  }
  const rpc = jest.fn(async () => options.rpcResult ?? { data: [], error: null })
  const participantsBuilder = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn(async () => options.participantsResult ?? { data: [], error: null }),
  }
  const from = jest.fn((table: string) => {
    if (table === 'pastoral_one_on_one_participantes') {
      return participantsBuilder
    }
    throw new Error(`unexpected table in test: ${table}`)
  })

  return { auth, rpc, from } as unknown as SupabaseClient
}

describe('hierarchical-visibility (W26)', () => {
  const originalEnv = process.env.NODE_ENV
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

  beforeEach(() => {
    warnSpy.mockClear()
  })

  afterAll(() => {
    setNodeEnv(originalEnv as 'development' | 'production' | 'test')
    warnSpy.mockRestore()
  })

  function setNodeEnv(value: 'development' | 'production' | 'test') {
    Object.assign(process.env, { NODE_ENV: value })
  }

  describe('visiblePersonaIdsOrNone', () => {
    it('returns personaIds when at least one is provided', () => {
      expect(visiblePersonaIdsOrNone(['a', 'b'])).toEqual(['a', 'b'])
    })

    it('returns the placeholder UUID when the list is empty', () => {
      expect(visiblePersonaIdsOrNone([])).toEqual([
        '00000000-0000-0000-0000-000000000000',
      ])
    })
  })

  describe('getPersonasUnderMe', () => {
    it('returns [] when no auth user is available', async () => {
      const client = makeClient({ user: null })
      const result = await getPersonasUnderMe(client)
      expect(result).toEqual([])
    })

    it('returns persona ids when the RPC returns an array of rows', async () => {
      const client = makeClient({
        rpcResult: {
          data: [{ persona_id: 'p1' }, { persona_id: 'p2' }],
          error: null,
        },
      })
      const result = await getPersonasUnderMe(client)
      expect(result).toEqual(['p1', 'p2'])
    })

    it('returns [] when the RPC returns null', async () => {
      const client = makeClient({ rpcResult: { data: null, error: null } })
      expect(await getPersonasUnderMe(client)).toEqual([])
    })

    it('wraps the payload when the RPC returns a single uuid string', async () => {
      const client = makeClient({ rpcResult: { data: 'single-uuid', error: null } })
      expect(await getPersonasUnderMe(client)).toEqual(['single-uuid'])
    })

    it('throws HierarchicalVisibilityError when the RPC returns an error', async () => {
      const client = makeClient({
        rpcResult: { data: null, error: { message: 'function not found' } },
      })
      await expect(getPersonasUnderMe(client)).rejects.toBeInstanceOf(
        HierarchicalVisibilityError,
      )
    })

    it('throws HierarchicalVisibilityError when the payload shape is invalid', async () => {
      const client = makeClient({ rpcResult: { data: 123, error: null } })
      await expect(getPersonasUnderMe(client)).rejects.toBeInstanceOf(
        HierarchicalVisibilityError,
      )
    })
  })

  describe('getVisiblePastoralOneOnOneIds — defensive fallback', () => {
    it('returns [] when getPersonasUnderMe throws (RPC error)', async () => {
      setNodeEnv('development')
      const client = makeClient({
        rpcResult: { data: null, error: { message: 'rpc failed' } },
      })
      const result = await getVisiblePastoralOneOnOneIds(client)
      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalled()
    })

    it('returns [] when the participants query fails', async () => {
      setNodeEnv('development')
      const client = makeClient({
        rpcResult: { data: [{ persona_id: 'p1' }], error: null },
        participantsResult: { data: null, error: { message: 'rls denied' } },
      })
      const result = await getVisiblePastoralOneOnOneIds(client)
      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalled()
    })

    it('returns [] when the auth user is missing', async () => {
      const client = makeClient({ user: null })
      const result = await getVisiblePastoralOneOnOneIds(client)
      expect(result).toEqual([])
    })

    it('returns the deduplicated one_on_one ids on the happy path', async () => {
      const client = makeClient({
        rpcResult: { data: [{ persona_id: 'p1' }], error: null },
        participantsResult: {
          data: [
            { one_on_one_id: 'o1' },
            { one_on_one_id: 'o1' },
            { one_on_one_id: 'o2' },
          ],
          error: null,
        },
      })
      const result = await getVisiblePastoralOneOnOneIds(client)
      expect(result).toEqual(['o1', 'o2'])
    })

    it('does not warn in production when the helper fails', async () => {
      setNodeEnv('production')
      const client = makeClient({
        rpcResult: { data: null, error: { message: 'rpc failed' } },
      })
      const result = await getVisiblePastoralOneOnOneIds(client)
      expect(result).toEqual([])
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })
})
