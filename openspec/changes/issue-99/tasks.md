# Tasks: Issue 99 RPC Auth Identity Hardening

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 376 actual PR changed lines: 372 additions, 4 deletions |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR #100; work-unit commits already separate migration/safety from CI workflow fix |
| Delivery strategy | auto-forecast |
| Chain strategy | pending |
| Reasoning | PR #100 is under the 400-line budget but close; scope is only 3 files and checks pass, so chaining is not required retroactively. |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Harden target RPC definitions and grants | PR #100 | Includes migration and read-only safety SQL. |
| 2 | Keep dependency review passing | PR #100 | Small CI syntax/config fix. |

> `[x]` means evidence exists in repo/PR #100 checks. `[ ]` means pending human rollout or follow-up.

## Phase 1: Foundation / Safety Artifacts

- [x] 1.1 Create `supabase/migrations/20260608173000_harden_rpc_auth_identity.sql` for the four target RPC signatures only.
- [x] 1.2 Create `supabase/safety/20260608173000_harden_rpc_auth_identity_preflight.sql` with read-only preflight, rollback-capture, postflight, and audit queries.
- [x] 1.3 Update `.github/workflows/dependency-review.yml` so dependency review runs with read-only permissions and valid gates.

## Phase 2: Core RPC Hardening

- [x] 2.1 Add non-service `auth.uid()` / `p_auth_id` binding to `registrar_asistencia` before domain work.
- [x] 2.2 Add the same identity binding to `agregar_miembro_a_grupo`, `actualizar_rol_miembro`, and `eliminar_miembro_de_grupo`.
- [x] 2.3 Revoke target RPC execution from `anon`/`PUBLIC`; grant only `authenticated` and `service_role`.
- [x] 2.4 Preserve `eliminar_miembro_de_grupo` as a `grupo_miembros` relationship-row delete only.

## Phase 3: Verification Evidence

- [x] 3.1 Statically verify migration contains identity checks, `search_path`, unchanged target signatures, and tightened grants.
- [x] 3.2 Verify PR #100 checks pass: lint, type-check, test, build, security-audit, migration lint, size guard, CodeQL, Vercel, and dependency-review.
- [x] 3.3 Verify safety SQL covers spec scenarios for anonymous denial, intended-role grants, `checks_auth_uid`, rollback evidence, and audit candidates.

## Phase 4: Human Rollout / Follow-up

- [ ] 4.1 Human operator runs read-only preflight before any approved migration application; block on signature or definition drift.
- [ ] 4.2 After explicit human approval and migration application, human operator runs read-only postflight verification.
- [ ] 4.3 Open follow-up for `crear_grupo` signature drift and remaining public `SECURITY DEFINER` + `p_auth_id` audit candidates.
