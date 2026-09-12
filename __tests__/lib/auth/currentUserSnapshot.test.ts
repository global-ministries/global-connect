/**
 * lib/auth/currentUserSnapshot.ts — server-side snapshot for CurrentUserProvider.
 *
 * The client-side useCurrentUser fetch resolves everything in one sequential
 * chain on mount (getUser → usuarios → obtener_roles_usuario RPC →
 * support_user_capabilities → platformSession), which is why the sidebar
 * used to paint only permission-free items for seconds on every full load.
 * This module resolves the same shape on the server so
 * app/(auth)/layout.tsx and app/(pastoral)/layout.tsx can hand
 * CurrentUserProvider an `initial` snapshot that is already correct on the
 * first paint.
 *
 * The function returns `CurrentUserSnapshot | null`, and the two are NOT
 * interchangeable: `null` means "could not resolve" (an auth.getUser()
 * error, or anything else unexpected) — the caller might still be a
 * genuinely signed-in user the middleware already let through, so handing
 * the provider a signed-out snapshot here would assert something false.
 * Only a real `!user` with no error returns the signed-out snapshot, since
 * that IS authoritative. These tests pin: signed-out (a) → the signed-out
 * snapshot; an auth error (b) and a thrown/rejected query (c) → `null`, not
 * the signed-out snapshot; an inner per-query error (usuarios/roles/etc.
 * reporting `error` without throwing) → still a real snapshot with the
 * actual authUserId, distinguishing "signed in, nothing resolved yet" from
 * "unresolved" and from "signed out"; signed-in → populated snapshot.
 *
 * Round-trip shape: getUser() → usuarios select → ONE parallel stage with
 * the roles RPC, the platform session and support_user_capabilities
 * together. The platform session is fed a findPersonaByAuthId that reuses
 * the usuarios row already fetched above instead of re-querying it by
 * auth_id (mirroring toClientPlatformPersona in hooks/useCurrentUser.tsx) —
 * findPlatformSessionPersonaByAuthId is only a fallback for when that row
 * is missing or mismatched. Tests below pin both the "usuarios precedes,
 * the rest overlap" shape and that the persona re-query disappears in the
 * normal case.
 */

const resolveReadOnlyPlatformSession = jest.fn()
const findPlatformSessionPersonaByAuthId = jest.fn()

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  ...jest.requireActual('@/lib/auth/platformSessionReadOnly'),
  resolveReadOnlyPlatformSession: (...args: unknown[]) => resolveReadOnlyPlatformSession(...args),
  findPlatformSessionPersonaByAuthId: (...args: unknown[]) => findPlatformSessionPersonaByAuthId(...args),
}))

const createSupabaseServerClient = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}))

import { resolveCurrentUserSnapshot } from '@/lib/auth/currentUserSnapshot'

type QueryResult<T> = { data: T; error: { message: string } | null }
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

async function flushMicrotasks() {
  for (let cycle = 0; cycle < 10; cycle += 1) {
    await Promise.resolve()
  }
}

const DEFAULT_USUARIO = { id: 'usuario-1', auth_id: 'auth-1', nombre: 'Staff User' }

function buildClient(overrides: {
  getUser?: jest.Mock
  maybeSingle?: jest.Mock
  rpc?: jest.Mock
  supportIs?: jest.Mock
} = {}) {
  const getUser = overrides.getUser ?? jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null })
  const maybeSingle = overrides.maybeSingle ?? jest.fn().mockResolvedValue({ data: DEFAULT_USUARIO, error: null })
  const rpc = overrides.rpc ?? jest.fn().mockResolvedValue({ data: ['admin'], error: null })
  const supportIs = overrides.supportIs ?? jest.fn().mockResolvedValue({ data: [{ capability: 'support.view' }], error: null })

  const usuariosQuery = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle }
  const supportQuery = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), is: supportIs }

  const client = {
    auth: { getUser },
    from: jest.fn((table: string) => {
      if (table === 'usuarios') return usuariosQuery
      if (table === 'support_user_capabilities') return supportQuery
      throw new Error(`Unexpected table ${table}`)
    }),
    rpc,
  }

  return { client, getUser, maybeSingle, rpc, supportIs, usuariosQuery, supportQuery }
}

describe('resolveCurrentUserSnapshot', () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset()
    resolveReadOnlyPlatformSession.mockReset()
    findPlatformSessionPersonaByAuthId.mockReset()
  })

  it('returns the signed-out snapshot (not null) when there is genuinely no authenticated user', async () => {
    const { client } = buildClient({
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    })
    createSupabaseServerClient.mockResolvedValue(client)

    const snapshot = await resolveCurrentUserSnapshot()

    // A real `!user` with no error is authoritative — this is genuinely
    // signed out, not merely unresolved, so it must NOT be null.
    expect(snapshot).not.toBeNull()
    expect(snapshot).toEqual({
      authUserId: null,
      usuario: null,
      roles: [],
      supportCapabilities: [],
      platformSession: null,
    })
    expect(resolveReadOnlyPlatformSession).not.toHaveBeenCalled()
  })

  it('returns null (unresolved) when auth.getUser() reports an error — the caller may still be signed in', async () => {
    const { client } = buildClient({
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: { message: 'invalid_grant' } }),
    })
    createSupabaseServerClient.mockResolvedValue(client)

    // Unlike the genuine signed-out case above, an auth.getUser() error does
    // NOT prove there is no session — the middleware may have already let a
    // signed-in user through. Returning the signed-out snapshot here would
    // assert a false "no user, no roles" first paint instead of just not
    // having resolved yet, so this must be null, not SIGNED_OUT_SNAPSHOT.
    await expect(resolveCurrentUserSnapshot()).resolves.toBeNull()
  })

  it('populates roles, support capabilities and the platform session for a signed-in user', async () => {
    const { client } = buildClient()
    createSupabaseServerClient.mockResolvedValue(client)
    resolveReadOnlyPlatformSession.mockResolvedValue({
      personaId: 'usuario-1',
      subjectAuthId: 'auth-1',
      globalRoles: [],
      contexts: [],
      capabilities: [
        { key: 'dream_team.org.manage', experience: 'dream_team', scopeType: 'experience', source: 'manual' },
      ],
    })

    const snapshot = await resolveCurrentUserSnapshot()

    expect(snapshot).not.toBeNull()
    expect(snapshot?.authUserId).toBe('auth-1')
    expect(snapshot?.usuario).toEqual(DEFAULT_USUARIO)
    expect(snapshot?.roles).toEqual(['admin'])
    expect(snapshot?.supportCapabilities).toEqual(['support.view'])
    // The platform session comes back with empty globalRoles from the mock
    // above — resolveCurrentUserSnapshot must stamp the real roles onto it
    // since they were resolved concurrently, not threaded into the call.
    expect(snapshot?.platformSession).toEqual({
      personaId: 'usuario-1',
      subjectAuthId: 'auth-1',
      globalRoles: ['admin'],
      contexts: [],
      capabilities: [
        { key: 'dream_team.org.manage', experience: 'dream_team', scopeType: 'experience', source: 'manual' },
      ],
    })
  })

  it('filters support capabilities to the known SUPPORT_CAPABILITIES set', async () => {
    const { client } = buildClient({
      supportIs: jest.fn().mockResolvedValue({
        data: [{ capability: 'support.manage' }, { capability: 'not-a-real-capability' }],
        error: null,
      }),
    })
    createSupabaseServerClient.mockResolvedValue(client)
    resolveReadOnlyPlatformSession.mockResolvedValue(null)

    const snapshot = await resolveCurrentUserSnapshot()

    expect(snapshot?.supportCapabilities).toEqual(['support.manage'])
  })

  it('does not query support_user_capabilities when no usuario is linked', async () => {
    const { client, supportIs } = buildClient({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    createSupabaseServerClient.mockResolvedValue(client)
    resolveReadOnlyPlatformSession.mockResolvedValue(null)

    const snapshot = await resolveCurrentUserSnapshot()

    expect(snapshot).not.toBeNull()
    expect(snapshot?.usuario).toBeNull()
    expect(snapshot?.supportCapabilities).toEqual([])
    expect(supportIs).not.toHaveBeenCalled()
  })

  it('still returns a real snapshot (not null) when the usuarios query reports an error without throwing', async () => {
    // This is the "inner degradation" case, distinct from both (b) and (c)
    // above: the query resolved (no throw), it just came back with an
    // error. authUserId is real because the user IS signed in — only the
    // usuarios field degrades to null, exactly like the pre-existing
    // per-query error handling for roles/support capabilities. The
    // background client-side revalidation fills the gap in afterward.
    const { client } = buildClient({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: { message: 'connection terminated' } }),
    })
    createSupabaseServerClient.mockResolvedValue(client)
    resolveReadOnlyPlatformSession.mockResolvedValue(null)

    const snapshot = await resolveCurrentUserSnapshot()

    expect(snapshot).not.toBeNull()
    expect(snapshot?.authUserId).toBe('auth-1')
    expect(snapshot?.usuario).toBeNull()
    expect(snapshot?.roles).toEqual(['admin'])
  })

  it('still returns a real snapshot (not null) when the roles RPC reports an error without throwing', async () => {
    const { client } = buildClient({
      rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'rpc failed' } }),
    })
    createSupabaseServerClient.mockResolvedValue(client)
    resolveReadOnlyPlatformSession.mockResolvedValue(null)

    const snapshot = await resolveCurrentUserSnapshot()

    expect(snapshot).not.toBeNull()
    expect(snapshot?.authUserId).toBe('auth-1')
    expect(snapshot?.usuario).toEqual(DEFAULT_USUARIO)
    expect(snapshot?.roles).toEqual([])
  })

  it('returns null (unresolved) when a query throws — not the signed-out snapshot, since the caller may still be signed in', async () => {
    const { client } = buildClient({
      getUser: jest.fn().mockRejectedValue(new Error('network down')),
    })
    createSupabaseServerClient.mockResolvedValue(client)

    await expect(resolveCurrentUserSnapshot()).resolves.toBeNull()
  })

  it('returns null (unresolved) when resolveReadOnlyPlatformSession rejects — an unexpected failure, not proof of being signed out', async () => {
    const { client } = buildClient()
    createSupabaseServerClient.mockResolvedValue(client)
    resolveReadOnlyPlatformSession.mockRejectedValue(new Error('capability lookup exploded'))

    await expect(resolveCurrentUserSnapshot()).resolves.toBeNull()
  })

  it('reuses a supabase client passed in instead of creating a new one', async () => {
    const { client } = buildClient()
    resolveReadOnlyPlatformSession.mockResolvedValue(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double, not a real SupabaseClient<Database>
    await resolveCurrentUserSnapshot(client as any)

    expect(createSupabaseServerClient).not.toHaveBeenCalled()
    expect(client.auth.getUser).toHaveBeenCalledTimes(1)
  })

  it('resolves the usuarios row before issuing roles, platform session and support capabilities — which then overlap', async () => {
    const usuarioDeferred = createDeferred<QueryResult<unknown>>()
    const rolesDeferred = createDeferred<QueryResult<unknown>>()
    const platformSessionDeferred = createDeferred<unknown>()
    const supportDeferred = createDeferred<QueryResult<unknown>>()
    const callLog: string[] = []

    const maybeSingle = jest.fn(() => {
      callLog.push('usuario:start')
      return usuarioDeferred.promise.then((value) => {
        callLog.push('usuario:end')
        return value
      })
    })
    const rpc = jest.fn(() => {
      callLog.push('roles:start')
      return rolesDeferred.promise.then((value) => {
        callLog.push('roles:end')
        return value
      })
    })
    resolveReadOnlyPlatformSession.mockImplementation(() => {
      callLog.push('platformSession:start')
      return platformSessionDeferred.promise.then((value) => {
        callLog.push('platformSession:end')
        return value
      })
    })
    const supportIs = jest.fn(() => {
      callLog.push('support:start')
      return supportDeferred.promise.then((value) => {
        callLog.push('support:end')
        return value
      })
    })

    const { client } = buildClient({ maybeSingle, rpc, supportIs })
    createSupabaseServerClient.mockResolvedValue(client)

    const snapshotPromise = resolveCurrentUserSnapshot()

    await flushMicrotasks()
    // Only the usuarios query has started — roles, the platform session and
    // support capabilities all wait on the usuarios row (support capabilities
    // needs its id; the platform session needs it to skip the persona
    // re-query — see the tests below).
    expect(callLog).toEqual(['usuario:start'])

    usuarioDeferred.resolve({ data: DEFAULT_USUARIO, error: null })
    await flushMicrotasks()

    // All three later queries have now started together — none waited for
    // one of the others to finish first.
    expect(callLog).toEqual(['usuario:start', 'usuario:end', 'roles:start', 'platformSession:start', 'support:start'])

    // Resolve out of dependency order — if any of the three depended on
    // another, resolving them like this would either hang or have no effect.
    platformSessionDeferred.resolve({
      personaId: 'usuario-1',
      subjectAuthId: 'auth-1',
      globalRoles: [],
      contexts: [],
      capabilities: [],
    })
    supportDeferred.resolve({ data: [{ capability: 'support.view' }], error: null })
    rolesDeferred.resolve({ data: ['admin'], error: null })

    const snapshot = await snapshotPromise
    expect(snapshot).not.toBeNull()
    expect(snapshot?.roles).toEqual(['admin'])
    expect(snapshot?.usuario).toEqual(DEFAULT_USUARIO)
    expect(snapshot?.supportCapabilities).toEqual(['support.view'])
  })

  it('does not re-query the persona when the usuarios row already has a matching auth_id', async () => {
    const { client } = buildClient()
    createSupabaseServerClient.mockResolvedValue(client)
    // Exercise the real findPersonaByAuthId seam resolveCurrentUserSnapshot
    // hands to resolveReadOnlyPlatformSession, the way the real function
    // would call it.
    resolveReadOnlyPlatformSession.mockImplementation(async (input: {
      subjectAuthId: string
      findPersonaByAuthId: (authId: string) => Promise<{ id: string; authId: string | null } | null>
    }) => {
      const persona = await input.findPersonaByAuthId(input.subjectAuthId)
      return persona
        ? { personaId: persona.id, subjectAuthId: input.subjectAuthId, globalRoles: [], contexts: [], capabilities: [] }
        : null
    })

    const snapshot = await resolveCurrentUserSnapshot()

    expect(findPlatformSessionPersonaByAuthId).not.toHaveBeenCalled()
    expect(snapshot?.platformSession?.personaId).toBe(DEFAULT_USUARIO.id)
  })

  it('falls back to findPlatformSessionPersonaByAuthId when the usuarios row is missing', async () => {
    const { client } = buildClient({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) })
    createSupabaseServerClient.mockResolvedValue(client)
    findPlatformSessionPersonaByAuthId.mockResolvedValue({ id: 'persona-fallback', authId: 'auth-1' })
    resolveReadOnlyPlatformSession.mockImplementation(async (input: {
      subjectAuthId: string
      findPersonaByAuthId: (authId: string) => Promise<{ id: string; authId: string | null } | null>
    }) => {
      const persona = await input.findPersonaByAuthId(input.subjectAuthId)
      return persona
        ? { personaId: persona.id, subjectAuthId: input.subjectAuthId, globalRoles: [], contexts: [], capabilities: [] }
        : null
    })

    const snapshot = await resolveCurrentUserSnapshot()

    expect(findPlatformSessionPersonaByAuthId).toHaveBeenCalledWith(client, 'auth-1')
    expect(snapshot?.platformSession?.personaId).toBe('persona-fallback')
  })
})
