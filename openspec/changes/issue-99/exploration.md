## Exploration: issue-99 — RPC auth identity hardening

### Current State

#### Problem Statement
Issue #99 identifies a critical authorization flaw in user-facing Supabase RPCs: several `SECURITY DEFINER` functions accepted caller-supplied `p_auth_id`, granted execution to `anon`, and derived authorization from that parameter. Revoking `anon` alone is not sufficient because an authenticated caller could still spoof another user's identity unless `p_auth_id` is bound to the active JWT identity via `auth.uid()`.

#### Implementation State Verified
- PR #100 (`fix/rpc-auth-identity-hardening`) is open against `main`, merge state is clean, and all reported checks are passing, including dependency review after repository Dependency graph support was enabled.
- The PR changes 3 files with 376 total changed lines (`372` additions, `4` deletions), which is below the 400-line review budget.
- `supabase/migrations/20260608173000_harden_rpc_auth_identity.sql` replaces four target RPC definitions, keeps them `SECURITY DEFINER`, sets `search_path` to `public`, revokes execution from `anon`/`PUBLIC`, grants execution to `authenticated` and `service_role`, and rejects non-service callers when `auth.uid()` is null or `p_auth_id IS DISTINCT FROM auth.uid()`.
- `supabase/safety/20260608173000_harden_rpc_auth_identity_preflight.sql` is read-only and uses `SELECT` statements to inspect function privileges, definitions, post-application identity checks, and broader same-pattern audit candidates.
- `.github/workflows/dependency-review.yml` was simplified to run on PRs to `main`/`develop` with read-only contents permission and high-severity/license blocking.

#### Security and Data-Safety Constraints
- Do not apply migrations during exploration.
- Do not execute database mutations, DDL, destructive SQL, or ad-hoc production data changes.
- Production data is real: never delete users, profiles, or data-bearing records as part of this issue.
- It is acceptable for `eliminar_miembro_de_grupo` to preserve `DELETE FROM public.grupo_miembros` because that operation removes only the membership relationship link, not a user/profile record.
- Keep `service_role` execution available only for trusted server/admin contexts; never expose service-role credentials to public clients.

### Affected Areas
- `supabase/migrations/20260608173000_harden_rpc_auth_identity.sql` — hardens the target RPCs and their exact function grants.
- `supabase/safety/20260608173000_harden_rpc_auth_identity_preflight.sql` — read-only verification and broader audit candidate discovery.
- `.github/workflows/dependency-review.yml` — CI dependency review configuration associated with PR #100 check completion.
- `app/api/grupos/[id]/asistencia/route.ts` — active `registrar_asistencia` call site; derives `p_auth_id` from `supabase.auth.getUser().user.id`, which matches the hardened contract for authenticated callers.
- `lib/actions/asistencia-avanzada.actions.ts` — active `registrar_asistencia` server action call site; derives `p_auth_id` from the authenticated Supabase user before invoking the RPC.
- `lib/actions/groupMember.actions.ts` — no longer calls `agregar_miembro_a_grupo` directly; it delegates group membership changes through the request flow (`crearSolicitudGrupo`), reducing active direct-use surface for the member mutation RPC.
- `scripts/test-rpc-asistencia.ts` — uses `SUPABASE_SERVICE_ROLE_KEY`; useful for controlled service-role contract checks but not sufficient to prove authenticated spoof rejection.

#### Affected RPCs
- `public.registrar_asistencia(uuid, uuid, date, text, text, text, jsonb, text, text, text, integer, boolean, text, boolean)`
- `public.agregar_miembro_a_grupo(uuid, uuid, uuid, public.enum_rol_grupo)`
- `public.actualizar_rol_miembro(uuid, uuid, uuid, public.enum_rol_grupo)`
- `public.eliminar_miembro_de_grupo(uuid, uuid, uuid)`

### Approaches
1. **Targeted hardening already implemented in PR #100** — Preserve existing RPC behavior and signatures while tightening grants and binding non-service callers to `auth.uid()`.
   - Pros: Minimal scope, direct acceptance-criteria coverage, no production data cleanup, below review budget, keeps current server/client call contract.
   - Cons: Leaves the broader public `SECURITY DEFINER` RPC pattern for follow-up audit; relies on exact live function signatures matching the migration.
   - Effort: Low

2. **Broader same-pattern RPC audit in the same change** — Extend the migration to additional `SECURITY DEFINER` functions that accept `p_auth_id`.
   - Pros: Reduces more authorization surface at once.
   - Cons: Higher blast radius, likely exceeds the intended issue scope, may require live-signature reconciliation (for example `crear_grupo`), and increases production-risk review burden.
   - Effort: Medium to High

3. **Frontend/server action validation only** — Ensure callers always pass `user.id` and avoid database-function replacement.
   - Pros: Small application-code change.
   - Cons: Incorrect security boundary; direct RPC execution would still trust caller-controlled `p_auth_id`, and `anon`/`authenticated` grants would remain dangerous.
   - Effort: Low, but not acceptable

### Recommendation
Proceed to `sdd-propose` using Approach 1 as the formal change direction. The proposal should retroactively document PR #100 as a targeted security hardening migration with read-only safety verification, strict production-data constraints, and a separate follow-up path for broader same-pattern RPC audit candidates.

### Risks
- Live database function signatures or definitions may have drifted from migration history; the safety preflight should be used before applying any migration.
- The target RPCs remain `SECURITY DEFINER` functions in the exposed `public` schema; `search_path` and tighter grants reduce risk, but a private-schema privileged-code design remains a separate architectural follow-up.
- `service_role` bypass is intentional but must remain server-only; exposing service-role credentials would bypass the non-service identity check.
- Existing automated evidence is mostly static/CI-oriented; authenticated spoof rejection and valid authorized success still need post-application read-only verification or controlled tests.
- Broader audit candidates from issue #99 remain out of scope for this PR and should not be changed blindly.

### Non-Goals
- Do not create proposal, spec, design, tasks, apply, or verify artifacts in this phase.
- Do not apply the migration or run production SQL.
- Do not delete or clean up production users, profiles, groups, or other data-bearing records.
- Do not expand PR #100 to unrelated RPCs without a separate proposal or follow-up issue.

### Ready for Proposal
Yes — tell the orchestrator to run `sdd-propose` for `issue-99`, using PR #100 as the implementation reference and preserving the hard safety constraints above.
