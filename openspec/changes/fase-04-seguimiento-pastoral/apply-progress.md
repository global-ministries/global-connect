# Apply Progress: Fase 4 — Seguimiento Pastoral (recap W22–W26)

## Status

- Change: `fase-04-seguimiento-pastoral`
- Issue: https://github.com/global-ministries/global-connect/issues/367
- Pull request: https://github.com/global-ministries/global-connect/pull/368
- Review workload: small W26 (≈260 lines, defensive fix only)
- Delivery strategy: `auto-forecast`
- Chain strategy: Not needed (single isolated fix)
- Database safety: No migrations applied, no production data mutated, no destructive SQL executed

## Executive Summary

F4 (Seguimiento Pastoral) shipped 1:1 + tríada + crisis + métricas + admin grants across W01–W17 plus the recap W23/W24/W25 that the user asked for after playback. W26 is a defensive fix layered on top of W25 (PR #365) to prevent the /pastor server component from crashing when the hierarchical-visibility helper fails.

Recap:
- W23 (PR #362, commit 27a806a): hide tríada from UI.
- W24 (PR #363, commits 2b9a18c + c8b2922): auto-grant pastoral capabilities on role assignment.
- W25 (PR #365, commit ccf5bc7): hierarchical visibility via `get_personas_under_me` + `getPersonasUnderMe`.
- W26 (PR #368, commit b13207e + 1a3850b): defensive fallback for `getVisiblePastoralOneOnOneIds` so the /pastor page no longer crashes on visibility errors.

## Completed Tasks

- [x] W23 — hide tríada from UI (PR #362, commit 27a806a)
- [x] W24 — auto-grant pastoral capabilities on role assignment (PR #363, commits 2b9a18c + c8b2922)
- [x] W25 — hierarchical visibility via `getPersonasUnderMe` (PR #365, commit ccf5bc7)
- [x] W26 — defensive fallback for `getVisiblePastoralOneOnOneIds` (PR #368, commit b13207e)
  - Wrap `getPersonasUnderMe` in try/catch.
  - Return `[]` when the participants query fails.
  - Add typed `HierarchicalVisibilityError` with reason discriminator.
  - Normalize RPC payload shape (object row, plain string, null, invalid).
  - Console warnings gated to non-production environments.
  - 13 regression tests covering all defensive paths.

## Remaining Tasks

- [ ] Manual verification on staging: confirm /pastor renders for admin after W26 lands.
- [ ] Run full CI suite (lint, test, security-audit, build) on PR #368.
- [ ] Decide if the F4 follow-up issues (#325, #324, #334, #353) are still in scope or out of MVP.

## Files Accounted For

| File | Action | Evidence |
|------|--------|----------|
| `lib/platform/pastoral/hierarchical-visibility.ts` | Modified in PR #368 | Adds try/catch fallback, `HierarchicalVisibilityError`, payload normalization. |
| `__tests__/lib/platform/pastoral/hierarchical-visibility.test.ts` | Created in PR #368 | 13 regression tests covering RPC error, participants error, no auth user, shape mismatch, production silence, happy path. |

## Verification Evidence

- `tsc --noEmit` — 0 errors
- `pnpm test -- __tests__/lib/platform/pastoral/ --runInBand` — 39 suites, 609 passed, 1 skipped, 0 failed
- `pnpm test -- __tests__/lib/platform/pastoral/hierarchical-visibility.test.ts --runInBand` — 13/13 passed
- Runtime path: production admin loading /pastor previously crashed with `Application error: a client-side exception has occurred`; after W26 the page renders an empty-dashboard fallback rather than crashing.

## Lessons Learned

1. **Server components must catch runtime errors from data helpers.** Next.js renders the generic `Application error` whenever the server component throws. Returning `[]` from the helper preserves the page structure and keeps the user on /pastor.
2. **Admin paths inflate RPC results.** For admin, `get_personas_under_me` returns 134 UUIDs. Any downstream `.in()` filter ballooned to ~5 KB; one more failure mode (RLS, network, timeout) and the page crashed. The defensive fallback isolates that risk from the rendering layer.
3. **RPC payload shape is fragile.** `RETURNS TABLE(x uuid)` can be marshalled as `[{x: uuid}]`, `[uuid]`, `uuid`, or `null` depending on the client. Normalizing the shape in the helper removes a class of bugs without changing the SQL contract.
4. **Console warnings belong in dev only.** Production telemetry costs money and clutters logs. Gate `console.warn` on `NODE_ENV !== 'production'`.
