# Apply Progress: Issue 99 RPC Auth Identity Hardening

## Status

- Change: `issue-99`
- Pull request: https://github.com/global-ministries/global-connect/pull/100
- Issue: https://github.com/global-ministries/global-connect/issues/99
- Mode: Retroactive SDD apply bookkeeping only
- Artifact store: OpenSpec + Engram
- Review workload: 376 forecasted changed lines / 372 additions and 4 deletions in PR #100
- Delivery strategy: `auto-forecast`
- Chain strategy: Not needed; chained PRs were not recommended
- Database safety: No migrations applied, no production data mutated, and no destructive SQL executed during this apply-progress creation

## Executive Summary

PR #100 implements the targeted issue-99 hardening scope for four public Supabase `SECURITY DEFINER` RPCs: `registrar_asistencia`, `agregar_miembro_a_grupo`, `actualizar_rol_miembro`, and `eliminar_miembro_de_grupo`. The completed implementation binds non-service callers to `auth.uid()`, keeps `service_role` as a trusted server/admin bypass, revokes `PUBLIC`/`anon` execution, grants only `authenticated` and `service_role`, and preserves remove-member behavior as a delete of only the `grupo_miembros` relationship row.

The remaining work is intentionally human-controlled rollout and follow-up: run read-only preflight, explicitly approve and apply the migration outside this SDD apply step, run read-only postflight, and open follow-up audit work for `crear_grupo` signature drift plus other public `SECURITY DEFINER` + `p_auth_id` candidates.

## Completed Tasks

- [x] 1.1 Create `supabase/migrations/20260608173000_harden_rpc_auth_identity.sql` for the four target RPC signatures only.
- [x] 1.2 Create `supabase/safety/20260608173000_harden_rpc_auth_identity_preflight.sql` with read-only preflight, rollback-capture, postflight, and audit queries.
- [x] 1.3 Update `.github/workflows/dependency-review.yml` so dependency review runs with read-only permissions and valid gates.
- [x] 2.1 Add non-service `auth.uid()` / `p_auth_id` binding to `registrar_asistencia` before domain work.
- [x] 2.2 Add the same identity binding to `agregar_miembro_a_grupo`, `actualizar_rol_miembro`, and `eliminar_miembro_de_grupo`.
- [x] 2.3 Revoke target RPC execution from `anon`/`PUBLIC`; grant only `authenticated` and `service_role`.
- [x] 2.4 Preserve `eliminar_miembro_de_grupo` as a `grupo_miembros` relationship-row delete only.
- [x] 3.1 Statically verify migration contains identity checks, `search_path`, unchanged target signatures, and tightened grants.
- [x] 3.2 Verify PR #100 checks pass: lint, type-check, test, build, security-audit, migration lint, size guard, CodeQL, Vercel, and dependency-review.
- [x] 3.3 Verify safety SQL covers spec scenarios for anonymous denial, intended-role grants, `checks_auth_uid`, rollback evidence, and audit candidates.

## Remaining Tasks

- [ ] 4.1 Human operator runs read-only preflight before any approved migration application; block on signature or definition drift.
- [ ] 4.2 After explicit human approval and migration application, human operator runs read-only postflight verification.
- [ ] 4.3 Open follow-up for `crear_grupo` signature drift and remaining public `SECURITY DEFINER` + `p_auth_id` audit candidates.

## Files Accounted For

| File | Action | Evidence |
|------|--------|----------|
| `supabase/migrations/20260608173000_harden_rpc_auth_identity.sql` | Modified in PR #100 | Replaces the four target RPC definitions, adds non-service identity checks, sets `search_path`, preserves `service_role`, tightens grants, and does not include production data cleanup. |
| `supabase/safety/20260608173000_harden_rpc_auth_identity_preflight.sql` | Created in PR #100 | Provides read-only preflight, rollback-capture, postflight verification, and same-pattern audit discovery queries. |
| `.github/workflows/dependency-review.yml` | Modified in PR #100 | Uses read-only permissions and dependency review gates that keep PR #100 checks passing. |
| `openspec/changes/issue-99/tasks.md` | Existing SDD bookkeeping | Already records 10 complete tasks and 3 pending human rollout/follow-up tasks; no checkbox changes were needed. |
| `openspec/changes/issue-99/apply-progress.md` | Created by this retroactive apply step | Documents implemented PR #100 work and pending human rollout/follow-up without changing implementation or production data. |

## Verification Evidence

| Area | Evidence |
|------|----------|
| Identity binding | Each target RPC contains a non-service guard using `auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()`. |
| Role grants | Each target RPC revokes execution from `anon` and `PUBLIC`, then grants execution only to `authenticated` and `service_role`. |
| Search path | Each target RPC is recreated with `SET search_path TO 'public'`. |
| Data safety | The migration only replaces function definitions and grants. It does not delete, truncate, backfill, or clean production users/profiles/groups/data-bearing records. |
| Remove-member exception | `eliminar_miembro_de_grupo` preserves the existing `DELETE FROM public.grupo_miembros` relationship-row behavior only. |
| Safety SQL | Preflight/postflight SQL is read-only and inspects signatures, grants, function definitions, rollback evidence, identity-check presence, and same-pattern audit candidates. |
| PR checks | The tasks artifact records PR #100 checks as passing for lint, type-check, test, build, security-audit, migration lint, size guard, CodeQL, Vercel, and dependency-review. |

## Deviations From Design

None. This retroactive apply-progress artifact records the already implemented PR #100 work and does not alter the design, implementation files, tasks state, migrations, or production data.

## Risks

- Live function signature or definition drift may exist before rollout; human operators must run the read-only preflight and block if drift appears.
- `service_role` remains a trusted bypass and must stay server-only.
- Broader public `SECURITY DEFINER` + `p_auth_id` RPCs remain out of issue-99 scope and require a separate approved follow-up.
- The PR is close to the 400-line review budget, but the forecast classifies risk as Medium and chained PRs as not recommended.

## Next Recommended

1. Keep tasks 4.1-4.3 unchecked until a human performs rollout and follow-up.
2. Human operator runs `supabase/safety/20260608173000_harden_rpc_auth_identity_preflight.sql` read-only and saves rollback evidence.
3. Apply `supabase/migrations/20260608173000_harden_rpc_auth_identity.sql` only after explicit human approval.
4. Run the read-only postflight section from the safety SQL after migration application.
5. Open a separate follow-up for `crear_grupo` signature drift and remaining public `SECURITY DEFINER` + `p_auth_id` audit candidates.
