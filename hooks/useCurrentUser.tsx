'use client'

import { createContext, useContext, useState, useEffect, useRef, useMemo, type ReactNode } from 'react'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/client'
import { buildPlatformSession } from '@/lib/platform/session/build'
import { AUTH_FETCH_TIMEOUT_MS } from '@/lib/platform/auth-timeout'
import type { Database } from '@/lib/supabase/database.types'
import type { PlatformSession, PlatformSessionPersona } from '@/lib/platform/session/types'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

type Usuario = Database['public']['Tables']['usuarios']['Row']

interface CurrentUserData {
  authUserId: string | null
  usuario: Usuario | null
  roles: string[]
  supportCapabilities: string[]
  platformSession: PlatformSession | null
  loading: boolean
  error: string | null
}

const SUPPORT_CAPABILITIES = ['support.view', 'support.reply', 'support.manage'] as const
type SupportCapability = (typeof SUPPORT_CAPABILITIES)[number]
export type CurrentUserResult = Omit<CurrentUserData, 'loading' | 'error'>
  & { authUserId: string | null }

const CURRENT_USER_CACHE_TTL_MS = 15_000
const SIGNED_IN_DEBOUNCE_MS = 150
// Bound the time we wait for the entire auth lookup (cache check + load +
// dependent queries) before giving up on that load. Without this, a stalled
// network between Vercel and Supabase can leave `loading=true` forever and
// block all client-side navigation. See GH issue #257 — this is a
// regression of the same root cause partially fixed in #225.
//
// On timeout we resolve null (not throw) so the provider can release
// `loading` without alarming the user with a toast; a Sentry breadcrumb
// captures the event for ops. A timeout is NOT treated as signed out: a slow
// connection is no evidence the session ended, and wiping the state here
// collapsed the sidebar and made useCachedAccessCredentials drop its cache.
// The provider keeps what it already shows and retries once. The constant
// lives in lib/platform/auth-timeout.ts so the middleware getUser() guard
// shares the same value (Finding 7 in 4R).
const FETCH_TIMEOUT_MS = AUTH_FETCH_TIMEOUT_MS
// A load that times out or ends in the `error` kind (a failed usuarios
// select or roles RPC — not an auth failure) is retried once after this
// delay, so a transient failure heals itself instead of leaving the sidebar
// without its role-gated items until the next full reload. Once per load
// request: a retry that fails again stays failed, so a real outage never
// turns into a request loop. Exported so tests advance timers by the real
// value instead of a copy.
export const LOAD_RETRY_DELAY_MS = 1_500
let currentUserCache: { authUserId: string | null; expiresAt: number; value: CurrentUserResult } | null = null
let currentUserCacheGeneration = 0

function clearCurrentUserCache() {
  currentUserCacheGeneration += 1
  currentUserCache = null
}

// Test-only: clears the module-level cache and returns the prior value so
// tests can both reset state between cases AND assert that a code path
// did NOT poison the cache. Not part of the public hook surface — the
// leading underscores signal "internal/test-only" and the NODE_ENV guard
// enforces that production code cannot accidentally call this.
export function __resetCurrentUserCacheForTesting() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetCurrentUserCacheForTesting is test-only')
  }
  const previous = currentUserCache
  clearCurrentUserCache()
  return previous
}

type RetryTimerRef = { current: ReturnType<typeof setTimeout> | null }

// One pending retry per provider, shared by every kind of load (mount,
// SIGNED_IN refetch, talleres:refresh-session): any newer load cancels a
// retry still waiting from an older one, so the newest request always wins.
function cancelLoadRetry(timerRef: RetryTimerRef) {
  if (timerRef.current) {
    clearTimeout(timerRef.current)
    timerRef.current = null
  }
}

function scheduleLoadRetry(timerRef: RetryTimerRef, retry: () => void) {
  cancelLoadRetry(timerRef)
  timerRef.current = setTimeout(() => {
    timerRef.current = null
    retry()
  }, LOAD_RETRY_DELAY_MS)
}

// What one load resolves. `supportCapabilities` is null when only the
// support_user_capabilities query failed: those capabilities gate a single
// entry (Soporte), so their failure must neither fail the whole load (and
// with it the roles) nor read as "no capabilities". The provider fills a
// null in from the last known value for the same identity — see
// resolveSupportCapabilities below.
type LoadedCurrentUser = Omit<CurrentUserResult, 'supportCapabilities'> & { supportCapabilities: string[] | null }

type KnownSupportCapabilitiesRef = { current: { authUserId: string | null; capabilities: string[] } | null }

// Records resolved capabilities as the last known ones for their identity,
// and answers an unresolved (null) value with those last known ones — only
// for that same identity, never another user's; [] when none are known.
function resolveSupportCapabilities(loaded: LoadedCurrentUser, known: KnownSupportCapabilitiesRef): string[] {
  if (loaded.supportCapabilities) {
    known.current = { authUserId: loaded.authUserId, capabilities: loaded.supportCapabilities }
    return loaded.supportCapabilities
  }
  return known.current?.authUserId === loaded.authUserId ? known.current.capabilities : []
}

// Discriminated union returned by tryFetchCurrentUserData. Distinguishes a
// network timeout (silent failure — no toast, the UI keeps what it shows)
// from a real error from loadCurrentUserData (DB outage, RPC failure, auth
// error) which the consumer must surface via setError() so ops can
// correlate and the user can retry. The previous fix collapsed both into a
// single `null` return with `.catch(() => null)` — ops could not tell the
// two apart and users got neither a toast nor a retry prompt. See Finding 1
// in the 4R review.
//
// 'auth_error' is split out from the generic 'error' kind because they are
// handled differently: supabase.auth.getUser() itself failing (e.g. an
// invalidated/expired session returning a 401 AuthApiError) means the
// session is genuinely no longer valid, so it is the ONLY kind that clears
// state, even on a silent run. A data/RPC query failure or a timeout says
// nothing about the session, so both keep the data already shown (silent
// or not) and are retried once. Both error kinds still surface through
// setError on a non-silent run.
export type CurrentUserFetchResult =
  | { kind: 'ok'; data: LoadedCurrentUser }
  | { kind: 'timeout' }
  | { kind: 'auth_error'; error: unknown }
  | { kind: 'error'; error: unknown }

// Thrown by loadCurrentUserData specifically when supabase.auth.getUser()
// itself reports an error — kept as a distinct class (checked via
// `instanceof` below), NOT by matching the error message text, so
// tryFetchCurrentUserData can reliably tell "auth genuinely failed" apart
// from "a data/RPC query failed" regardless of what either error happens to
// say.
class AuthLookupError extends Error {}

async function tryFetchCurrentUserData(): Promise<CurrentUserFetchResult> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  let didTimeOut = false
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutHandle = setTimeout(() => {
      didTimeOut = true
      resolve(null)
    }, FETCH_TIMEOUT_MS)
  })
  const work = (async () => {
    const now = Date.now()
    if (currentUserCache && currentUserCache.expiresAt > now) {
      if (await isCurrentAuthUser(currentUserCache.authUserId)) return currentUserCache.value
      clearCurrentUserCache()
    }

    const requestGeneration = currentUserCacheGeneration
    const supabase = createClient()
    return loadCurrentUserData(supabase).then(async (value): Promise<LoadedCurrentUser> => {
      // Skip the cache write if the race already settled by timeout —
      // otherwise the abandoned chain would poison the module-level cache
      // with stale data the caller was told does not exist.
      if (didTimeOut) return value
      // A load whose support capabilities did not resolve is not cached
      // either: a later cache hit would hand those unresolved capabilities
      // to a caller as if they were the real ones.
      const { supportCapabilities } = value
      if (supportCapabilities && requestGeneration === currentUserCacheGeneration) {
        if (await isCurrentAuthUser(value.authUserId)) {
          currentUserCache = {
            authUserId: value.authUserId,
            value: { ...value, supportCapabilities },
            expiresAt: Date.now() + CURRENT_USER_CACHE_TTL_MS,
          }
        }
      }
      return value
    })
  })().then(
    (value): CurrentUserFetchResult => ({ kind: 'ok', data: value }),
    (error): CurrentUserFetchResult =>
      error instanceof AuthLookupError ? { kind: 'auth_error', error } : { kind: 'error', error }
  )
  try {
    const result = await Promise.race([work, timeoutPromise])
    if (result === null) {
      try {
        Sentry.addBreadcrumb({
          category: 'auth',
          level: 'warning',
          message: 'useCurrentUser fetch timed out',
          data: { timeoutMs: FETCH_TIMEOUT_MS },
        })
      } catch {
        // Sentry SDK not initialized (e.g. Edge runtime, instrumentation
        // disabled) — observability is best-effort and must never break
        // the auth flow.
      }
      return { kind: 'timeout' }
    }
    return result
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

async function loadCurrentUserData(supabase: ReturnType<typeof createClient>): Promise<LoadedCurrentUser> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError) {
    throw new AuthLookupError('Error de autenticación: ' + authError.message)
  }

  if (!user) {
    return { authUserId: null, usuario: null, roles: [], supportCapabilities: [], platformSession: null }
  }

  // The lookups below run in two parallel stages instead of one sequential
  // chain: on a slow connection the chain alone could outlast
  // FETCH_TIMEOUT_MS. Stage 1 needs only user.id — the usuarios row and the
  // roles RPC.
  const [usuarioResult, rolesResult] = await Promise.all([
    supabase.from('usuarios').select('*').eq('auth_id', user.id).maybeSingle(),
    supabase.rpc('obtener_roles_usuario', { p_auth_id: user.id }),
  ])

  // Checked before the roles result, so a failed usuarios select reports
  // the same error it did when it ran first.
  const { data: userData, error: userError } = usuarioResult
  if (userError) {
    throw new Error('Error al obtener datos del usuario: ' + userError.message)
  }

  const { data: rolesData, error: rolesError } = rolesResult

  // A failed roles lookup must not read as "this person has no roles":
  // mapping it to [] made the whole load `ok`, so a background revalidation
  // or a talleres:refresh-session refresh replaced good roles with nothing
  // and the sidebar collapsed to its permission-free items. Throwing turns it
  // into the `error` kind, which keeps the previous data and is retried once.
  // A NULL result WITHOUT an error is still [] — array_agg over a person with
  // no roles legitimately returns NULL.
  if (rolesError) {
    throw new Error('Error al obtener roles del usuario: ' + rolesError.message)
  }

  const roles = Array.isArray(rolesData)
    ? rolesData.map((role: unknown) => typeof role === "string" ? role : getRoleName(role)).filter((role): role is string => Boolean(role))
    : []

  // Stage 2 needs the usuarios row (and the roles): the support capabilities
  // by usuario.id and the platform session, independent of each other.
  const [supportCapabilities, platformSession] = await Promise.all([
    loadSupportCapabilities(supabase, userData?.id),
    resolveClientPlatformSession({
      subjectAuthId: user.id,
      usuario: userData,
      globalRoles: roles,
    }),
  ])

  return { authUserId: user.id, usuario: userData, roles, supportCapabilities, platformSession }
}

async function loadSupportCapabilities(
  supabase: ReturnType<typeof createClient>,
  usuarioId: string | undefined
): Promise<string[] | null> {
  // support_user_capabilities is keyed by usuario.id: no linked row, none.
  if (!usuarioId) return []

  const { data: capabilitiesData, error: capabilitiesError } = await supabase
    .from('support_user_capabilities')
    .select('capability')
    .eq('usuario_id', usuarioId)
    .is('revoked_at', null)

  // Unlike the roles RPC, this failure does not fail the load: the roles
  // still apply, and null marks the capabilities as unresolved so the
  // provider keeps the last known ones (see LoadedCurrentUser).
  if (capabilitiesError) {
    console.error('Error al obtener capacidades de soporte:', capabilitiesError.message)
    return null
  }
  if (!capabilitiesData) return []

  return capabilitiesData
    .map((row: { capability: string }) => row.capability)
    .filter((capability): capability is SupportCapability => SUPPORT_CAPABILITIES.includes(capability as SupportCapability))
}

async function isCurrentAuthUser(authUserId: string | null): Promise<boolean> {
  const { data, error } = await createClient().auth.getUser()
  return !error && (data.user?.id ?? null) === authUserId
}

const CurrentUserContext = createContext<CurrentUserData | null>(null)

export function CurrentUserProvider({ children, initial }: { children: ReactNode; initial?: CurrentUserResult }) {
  // `initial` is the server-resolved snapshot the layout hands down (see
  // lib/auth/currentUserSnapshot.ts) — when present, the SSR pass already
  // ran the same lookups this hook runs on the client, so state starts
  // populated and `loading` starts false instead of true. Every existing
  // caller omits this prop, so `initial` is undefined and every field below
  // initializes exactly as it always has — this is purely additive.
  const [authUserId, setAuthUserId] = useState<string | null>(initial?.authUserId ?? null)
  const [usuario, setUsuario] = useState<Usuario | null>(initial?.usuario ?? null)
  const [roles, setRoles] = useState<string[]>(initial?.roles ?? [])
  const [supportCapabilities, setSupportCapabilities] = useState<string[]>(initial?.supportCapabilities ?? [])
  const [platformSession, setPlatformSession] = useState<PlatformSession | null>(initial?.platformSession ?? null)
  const [loading, setLoading] = useState(initial === undefined)
  const [error, setError] = useState<string | null>(null)
  const authGenerationRef = useRef(0)
  const signedInDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Last support capabilities that actually resolved, and for whom. Seeded
  // from `initial` so a revalidation whose capabilities query fails keeps
  // the server-resolved ones.
  const knownSupportCapabilitiesRef = useRef<KnownSupportCapabilitiesRef['current']>(
    initial ? { authUserId: initial.authUserId, capabilities: initial.supportCapabilities } : null
  )
  // The identity currently on screen, for the auth listener below: it is
  // registered once on mount, so reading `authUserId` there would see the
  // value from that first render.
  const displayedAuthUserIdRef = useRef<string | null>(initial?.authUserId ?? null)
  useEffect(() => {
    displayedAuthUserIdRef.current = authUserId
  }, [authUserId])
  // Whether the very first mount fetch below should behave like the
  // talleres:refresh-session listener further down — a background
  // revalidation that only ever updates state on success — instead of a
  // normal loading fetch. Read once: only the initial mount (not a later
  // SIGNED_IN refetch) is a candidate for silence, and only when the layout
  // already gave us real data to show while it revalidates.
  const hasServerSnapshotRef = useRef(initial !== undefined)

  useEffect(() => {
    const fetchCurrentUser = async (options: { silent?: boolean; isRetry?: boolean } = {}) => {
      cancelLoadRetry(loadRetryRef)
      const authGeneration = authGenerationRef.current + 1
      authGenerationRef.current = authGeneration

      try {
        // A silent run must never flip `loading` to true — that would undo
        // the entire point of `initial`: the sidebar would show its
        // role-gated items on first paint, then hide them again for the
        // duration of this background revalidation. Every non-silent path
        // (no `initial`, or a later SIGNED_IN refetch) is unaffected.
        if (!options.silent) {
          setLoading(true)
        }
        setError(null)

        const result = await tryFetchCurrentUserData()

        if (authGeneration !== authGenerationRef.current) return

        if (result.kind === 'timeout' || result.kind === 'error') {
          // Neither a timeout nor a data/RPC failure says anything about the
          // session, so neither clears state — silent or not. Wiping it here
          // ("treat as unauthenticated") is what collapsed the sidebar on a
          // slow connection: non-silent loads run on every SIGNED_IN event
          // (supabase-js emits it on tab focus / session recovery). Whatever
          // is already shown stays — an empty state on a first load — and
          // `loading` is released in the finally below. Only 'auth_error'
          // clears state.
          //
          // Retry the same load once (keeping its `silent` mode) so a
          // transient failure heals itself. Only reached by the newest
          // request (the generation check above), and cancelled by any later
          // load, SIGNED_IN/SIGNED_OUT or unmount.
          if (!options.isRetry) {
            scheduleLoadRetry(loadRetryRef, () => {
              void fetchCurrentUser({ silent: options.silent, isRetry: true })
            })
          }
          // A stalled network gets no toast; tryFetchCurrentUserData already
          // left a Sentry breadcrumb for ops.
          if (result.kind === 'timeout') return
          if (options.silent) {
            // Still logged for ops even though a background revalidation
            // does not surface it as a user-facing toast.
            console.error('Error en useCurrentUser (revalidación en segundo plano):', result.error)
            return
          }
          // Real error from loadCurrentUserData (DB outage, RPC failure).
          // Surface through setError so the user gets a toast and ops gets
          // a Sentry report. Silent failure is reserved for genuine
          // timeouts. See Finding 1 in the 4R review.
          const err = result.error
          console.error('Error en useCurrentUser:', err)
          setError(err instanceof Error ? err.message : 'Error desconocido')
        } else if (result.kind === 'ok') {
          setAuthUserId(result.data.authUserId)
          setUsuario(result.data.usuario)
          setRoles(result.data.roles)
          setSupportCapabilities(resolveSupportCapabilities(result.data, knownSupportCapabilitiesRef))
          setPlatformSession(result.data.platformSession)
        } else {
          // 'auth_error' — the only kind that clears state. Unlike a
          // data/RPC error or a timeout above, a failed auth.getUser() means
          // the session itself is no longer valid (e.g. an invalidated/expired
          // session returning a 401 AuthApiError) — the SSR snapshot is now
          // stale and must be cleared even during a silent background
          // revalidation. Middleware and RLS still gate real access, so
          // this is about not asserting a false "still signed in" UI, not
          // an authorization gap.
          if (options.silent) {
            console.error('Error en useCurrentUser (revalidación en segundo plano):', result.error)
          } else {
            // Non-silent: same toast path as the generic error above —
            // surface through setError so the user gets a toast and ops
            // gets a Sentry report. See Finding 1 in the 4R review.
            const err = result.error
            console.error('Error en useCurrentUser:', err)
            setError(err instanceof Error ? err.message : 'Error desconocido')
          }
          setAuthUserId(null)
          setUsuario(null)
          setRoles([])
          setSupportCapabilities([])
          setPlatformSession(null)
        }
      } finally {
        if (authGeneration !== authGenerationRef.current) return

        setLoading(false)
      }
    }

    fetchCurrentUser({ silent: hasServerSnapshotRef.current })

    // Escuchar cambios en la autenticación
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      // TOKEN_REFRESHED and INITIAL_SESSION do not change the user identity
      // — only the access token rotates (or no rotation has happened yet
      // for INITIAL_SESSION). Clearing the cache on these events negates
      // the 15s TTL and forces a full DB reload on every Supabase auth
      // event. See Finding 6 in the 4R review.
      if (event !== 'TOKEN_REFRESHED' && event !== 'INITIAL_SESSION') {
        clearCurrentUserCache()
      }
      if (signedInDebounceRef.current) {
        clearTimeout(signedInDebounceRef.current)
        signedInDebounceRef.current = null
      }
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        // A retry scheduled for the previous identity must not run after it
        // signed out or was replaced.
        cancelLoadRetry(loadRetryRef)
      }
      if (event === 'SIGNED_OUT') {
        authGenerationRef.current += 1
        // Forget them on sign-out: a later failed capabilities query must
        // not bring back what this session had.
        knownSupportCapabilitiesRef.current = null
        setAuthUserId(null)
        setUsuario(null)
        setRoles([])
        setSupportCapabilities([])
        setPlatformSession(null)
        setLoading(false)
      } else if (event === 'SIGNED_IN' && session) {
        authGenerationRef.current += 1
        const displayedAuthUserId = displayedAuthUserIdRef.current
        if (displayedAuthUserId !== null && session.user?.id !== displayedAuthUserId) {
          // A different account signed in (account switch in the same
          // browser). A failed or timed-out reload keeps whatever is shown,
          // so clear the previous account now — same as SIGNED_OUT — or a
          // stalled reload would keep showing its roles and data. A
          // SIGNED_IN for the same user keeps the state while it reloads.
          knownSupportCapabilitiesRef.current = null
          setAuthUserId(null)
          setUsuario(null)
          setRoles([])
          setSupportCapabilities([])
          setPlatformSession(null)
        }
        signedInDebounceRef.current = setTimeout(() => {
          signedInDebounceRef.current = null
          fetchCurrentUser()
        }, SIGNED_IN_DEBOUNCE_MS)
      }
    })

    return () => {
      if (signedInDebounceRef.current) {
        clearTimeout(signedInDebounceRef.current)
      }
      cancelLoadRetry(loadRetryRef)
      subscription.unsubscribe()
    }
  }, [])

  // PR21.3: listen for explicit "refresh session" events fired by the
  // sidebar (or any other client component) when the user returns to the
  // tab. This forces a full DB re-fetch so newly-granted capabilities
  // appear in the UI without requiring logout+login.
  //
  // NOTE: clearCurrentUserCache() is critical — without it, the
  // module-level cache (15s TTL) returns the stale value and the UI
  // never updates. See Finding 7 in the 4R review for cache semantics.
  //
  // Only an `ok` result is applied: a failed roles RPC (the `error` kind)
  // or a timeout keeps the roles already shown and is retried once, like
  // the mount fetch above. A failed capabilities query alone is still `ok`
  // and keeps the last known capabilities.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const refresh = async (isRetry: boolean): Promise<void> => {
      cancelLoadRetry(loadRetryRef)
      try {
        clearCurrentUserCache()
        const result = await tryFetchCurrentUserData()
        if (result.kind === 'ok') {
          setAuthUserId(result.data.authUserId)
          setUsuario(result.data.usuario)
          setRoles(result.data.roles)
          setSupportCapabilities(resolveSupportCapabilities(result.data, knownSupportCapabilitiesRef))
          setPlatformSession(result.data.platformSession)
        } else if ((result.kind === 'error' || result.kind === 'timeout') && !isRetry) {
          scheduleLoadRetry(loadRetryRef, () => {
            void refresh(true)
          })
        }
      } catch {
        // Silent — sidebar refresh is best-effort.
      }
    }
    const onRefresh = (): void => {
      void refresh(false)
    }
    window.addEventListener('talleres:refresh-session', onRefresh)
    return () => {
      window.removeEventListener('talleres:refresh-session', onRefresh)
      cancelLoadRetry(loadRetryRef)
    }
  }, [])

  const value = useMemo(
    () => ({ authUserId, usuario, roles, supportCapabilities, platformSession, loading, error }),
    [authUserId, usuario, roles, supportCapabilities, platformSession, loading, error]
  )

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>
}

export function useCurrentUser(): CurrentUserData {
  const ctx = useContext(CurrentUserContext)
  if (!ctx) {
    throw new Error('useCurrentUser must be used within CurrentUserProvider')
  }
  return ctx
}

async function resolveClientPlatformSession(input: {
  subjectAuthId: string
  usuario: Usuario | null
  globalRoles: string[]
}): Promise<PlatformSession | null> {
  // PR21.6: also fetch the user's capability grants so the client-side
  // session mirrors the server session. Without this, the client's
  // session.capabilities is always [] because buildPlatformSession
  // requires an explicit capabilityLookup to populate capabilities.
  const result = await buildPlatformSession({
    subjectAuthId: input.subjectAuthId,
    personaLookup: {
      findByAuthId: async (authId) => toClientPlatformPersona(input.usuario, authId),
    },
    capabilityLookup: input.usuario?.id
      ? {
          findByPersonaId: async (personaId) => {
            const supabase = createClient()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- browser supabase
            const { data, error } = await (supabase as any)
              .from('dream_team_capability_grants')
              .select('capability_key, experience, scope_type, scope_id, source, granted_at, revoked_at')
              .eq('persona_id', personaId)
              .is('revoked_at', null)
            if (error) throw new Error('platform capability lookup failed')
            return (data ?? []).map((row: {
              capability_key: string
              experience: string
              scope_type: string
              scope_id: string | null
              source: string
              granted_at: string
            }) => ({
              key: row.capability_key,
              experience: row.experience,
              scopeType: row.scope_type,
              scopeId: row.scope_id || undefined,
              source: row.source,
              grantedAt: row.granted_at,
            }))
          },
        }
      : undefined,
  })

  return result.ok ? { ...result.session, globalRoles: [...input.globalRoles] } : null
}

function toClientPlatformPersona(usuario: Usuario | null, authId: string): PlatformSessionPersona | null {
  if (!usuario?.id || usuario.auth_id !== authId) return null
  return { id: usuario.id, authId: usuario.auth_id }
}

function getRoleName(role: unknown) {
  if (typeof role !== 'object' || role === null || !('nombre_interno' in role)) return undefined
  const roleName = role.nombre_interno
  return typeof roleName === 'string' ? roleName : undefined
}
