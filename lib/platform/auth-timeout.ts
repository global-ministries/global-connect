/**
 * Upper bound on how long client-side useCurrentUser.ts and the Edge
 * middleware will wait for an auth lookup before failing closed. Both call
 * sites must share the same value so client timeout behavior and the
 * server-side middleware guard cannot drift apart.
 *
 * Why 5s: the upper bound of what users perceive as "this feels broken"
 * before bouncing. See GH issue #257.
 */
export const AUTH_FETCH_TIMEOUT_MS = 5_000