/**
 * @jest-environment node
 *
 * PR15 — api-helpers unit tests.
 *
 * Tests the gate function against 4 paths:
 *   - 404 when feature flag is off
 *   - 401 when there is no authed user
 *   - 403 when capability is missing and director.read superset is also missing
 *   - 200 (ok: true) when capability is present OR director.read superset holds
 *
 * Also asserts the RPC contract: the helper must call
 * `auth_has_talleres_capability` with the argument `p_capability_key`
 * (the real SQL function signature). PR18 introduced a regression where
 * the helper called `eval_talleres_capability` (which does not exist);
 * `pr40_5` locks the contract.
 *
 * Mocks the supabase server client + the flag module so tests are
 * deterministic. Tests do not hit the database.
 */

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'

jest.mock('@/lib/platform/talleres/flags', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/flags') as Record<string, unknown>
  return {
    ...actual,
    isTalleresEnabled: jest.fn(),
  }
})

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

// Captured mock handles — set in beforeEach. These are mutable refs so the
// closures inside the mock factory read the latest test value, not the
// factory-creation-time value.
const isTalleresEnabledMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock

interface MockState {
  user: { id: string } | null
  rpc: (cap: string) => Promise<{ data: unknown }>
}
const state: MockState = {
  user: { id: 'user-1' },
  rpc: () => Promise.resolve({ data: true }),
}

// Captures every rpc call so the contract test can assert name + args.
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []

beforeEach(() => {
  // Reset mutable state so tests don't leak.
  state.user = { id: 'user-1' }
  state.rpc = () => Promise.resolve({ data: true })
  rpcCalls.length = 0

  isTalleresEnabledMock.mockReset().mockReturnValue(true)
  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      // Read `state.user` lazily so beforeEach changes are observed.
      getUser: jest.fn().mockImplementation(() =>
        Promise.resolve({ data: { user: state.user }, error: null }),
      ),
    },
    rpc: jest.fn().mockImplementation((name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      const cap = args.p_capability_key as string
      return state.rpc(cap)
    }),
  })
})

describe('requireTalleresApi — flag gate', () => {
  it('returns 404 when the talleres feature flag is off', async () => {
    isTalleresEnabledMock.mockReturnValue(false)
    const result = await requireTalleresApi('talleres_crecimiento.director.read')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(404)
      const body = await result.response.json()
      expect(body.error).toBe('not-found')
    }
  })
})

describe('requireTalleresApi — auth gate', () => {
  it('returns 401 when there is no authed user', async () => {
    state.user = null
    const result = await requireTalleresApi('talleres_crecimiento.director.read')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
      const body = await result.response.json()
      expect(body.error).toBe('unauthorized')
    }
  })
})

describe('requireTalleresApi — capability gate', () => {
  it('returns 403 when neither the capability nor director.read superset is held', async () => {
    state.rpc = () => Promise.resolve({ data: false })
    const result = await requireTalleresApi('talleres_crecimiento.director.read')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(403)
      const body = await result.response.json()
      expect(body.error).toBe('forbidden')
    }
  })

  it('returns ok when the requested capability is held', async () => {
    const calls: string[] = []
    state.rpc = (cap: string) => {
      calls.push(cap)
      return Promise.resolve({ data: true })
    }
    const result = await requireTalleresApi('talleres_crecimiento.coordinator.write')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.userId).toBe('user-1')
      expect(result.supabase).toBeDefined()
    }
    expect(calls).toContain('talleres_crecimiento.coordinator.write')
  })

  it('falls back to director.read superset when the requested capability is not held', async () => {
    const calls: string[] = []
    state.rpc = (cap: string) => {
      calls.push(cap)
      if (cap === 'talleres_crecimiento.director.read') return Promise.resolve({ data: true })
      return Promise.resolve({ data: false })
    }
    const result = await requireTalleresApi('talleres_crecimiento.metrics.read')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.userId).toBe('user-1')
    }
    expect(calls[0]).toBe('talleres_crecimiento.metrics.read')
    expect(calls[1]).toBe('talleres_crecimiento.director.read')
  })
})

describe('requireTalleresApi — RPC contract (pr40_5 regression)', () => {
  it('calls auth_has_talleres_capability with p_capability_key (never eval_talleres_capability)', async () => {
    // Force the superset path so we observe both rpc calls.
    state.rpc = (cap: string) => {
      if (cap === 'talleres_crecimiento.director.read') return Promise.resolve({ data: true })
      return Promise.resolve({ data: false })
    }
    await requireTalleresApi('talleres_crecimiento.participation.read')

    // Two calls expected: capability check + director.read superset fallback.
    expect(rpcCalls).toHaveLength(2)
    for (const call of rpcCalls) {
      expect(call.name).toBe('auth_has_talleres_capability')
      expect(call.name).not.toBe('eval_talleres_capability')
      expect(call.args).toHaveProperty('p_capability_key')
      expect(call.args).not.toHaveProperty('p_capability')
    }
    expect(rpcCalls[0].args.p_capability_key).toBe('talleres_crecimiento.participation.read')
    expect(rpcCalls[1].args.p_capability_key).toBe('talleres_crecimiento.director.read')
  })

  it('uses auth_has_talleres_capability on the happy path (capability held)', async () => {
    await requireTalleresApi('talleres_crecimiento.participation.read')

    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe('auth_has_talleres_capability')
    expect(rpcCalls[0].name).not.toBe('eval_talleres_capability')
    expect(rpcCalls[0].args).toEqual({ p_capability_key: 'talleres_crecimiento.participation.read' })
  })

  it('uses auth_has_talleres_capability even when the first check is false (forces superset path)', async () => {
    state.rpc = () => Promise.resolve({ data: false })
    const result = await requireTalleresApi('talleres_crecimiento.metrics.read')
    expect(result.ok).toBe(false)

    expect(rpcCalls.map((c) => c.name)).toEqual([
      'auth_has_talleres_capability',
      'auth_has_talleres_capability',
    ])
    expect(rpcCalls[0].args.p_capability_key).toBe('talleres_crecimiento.metrics.read')
    expect(rpcCalls[1].args.p_capability_key).toBe('talleres_crecimiento.director.read')
  })
})
