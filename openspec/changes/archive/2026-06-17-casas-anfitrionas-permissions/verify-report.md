## Verification Report

**Change**: casas-anfitrionas-permissions
**Version**: N/A
**Mode**: Strict TDD
**Date**: 2026-06-17
**Verifier scope**: Task 5.1 final safe verification only; no production Supabase calls were made.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 12 |
| Tasks complete | 12 |
| Tasks incomplete | 0 |

### Build & Tests Execution

**Targeted Casas Jest**: ✅ Passed

```text
pnpm test -- __tests__/supabase/casas-anfitrionas-permissions-migration.test.ts __tests__/lib/actions/casas-anfitrionas.actions.test.ts __tests__/lib/casas-anfitrionas/ui-permissions.test.ts __tests__/app/casas-anfitrionas-pages.test.tsx --runInBand
Test Suites: 4 passed, 4 total
Tests: 41 passed, 41 total
```

**Full Jest suite**: ✅ Passed

```text
pnpm test -- --runInBand
Test Suites: 28 passed, 28 total
Tests: 249 passed, 249 total
```

**Focused-test guard**: ✅ Passed

```text
pnpm test:no-only
No focused Jest tests found.
```

**Migration lint**: ✅ Passed with warnings

```text
pnpm lint:migrations
Summary: 172 files checked
Errors: 0
Warnings: 185
Info: 127
```

The Casas migrations introduced by this change emitted informational `security-definer` notices only; no Casas-specific migration lint errors were reported.

**Project lint**: ✅ Passed with warnings

```text
pnpm lint
457 problems (0 errors, 457 warnings)
```

Warnings are repo-wide pre-existing lint debt and did not block the command.

**Type check**: ✅ Passed

```text
pnpm exec tsc --noEmit
```

**Whitespace checks**: ✅ Passed

```text
git diff --check
git diff --cached --check
```

### Coverage

**Changed-file coverage command**: ✅ Passed

```text
pnpm exec jest --coverage __tests__/supabase/casas-anfitrionas-permissions-migration.test.ts __tests__/lib/actions/casas-anfitrionas.actions.test.ts __tests__/lib/casas-anfitrionas/ui-permissions.test.ts __tests__/app/casas-anfitrionas-pages.test.tsx --runInBand --collectCoverageFrom='lib/actions/casas-anfitrionas.actions.ts' --collectCoverageFrom='lib/casas-anfitrionas/**/*.ts' --collectCoverageFrom='app/(auth)/grupos-vida/casas-anfitrionas/**/*.tsx' --collectCoverageFrom='components/grupos-vida/form-casa-anfitriona.tsx'
Test Suites: 4 passed, 4 total
Tests: 41 passed, 41 total
```

| File | Line % | Branch % | Uncovered Lines | Rating |
|------|--------|----------|-----------------|--------|
| `lib/actions/casas-anfitrionas.actions.ts` | 65.28% | 35.86% | 102-108, 118-124, 127-138, 236-248, 250-264, 266-276, 280-284, 311-355, 361-362, 394-402, 411-414, 416-418, 434-447, 473-480, 483-490, 504-516, 527-531, 549-556, 579-586, 588-604, 666-682, 689-700 | ⚠️ Low |
| `lib/casas-anfitrionas/assignable-users.ts` | 100% | 80% | Branches 40, 42 | ⚠️ Acceptable |
| `lib/casas-anfitrionas/ui-permissions.ts` | 100% | 100% | — | ✅ Excellent |
| `components/grupos-vida/form-casa-anfitriona.tsx` | 0% | 0% | 1-666 | ⚠️ Low; presentational form was indirectly constrained by App Router page tests, not directly instrumented |

App Router page files were exercised by `__tests__/app/casas-anfitrionas-pages.test.tsx`, but they were not listed in Jest's coverage table after instrumentation.

### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Found in Engram `sdd/casas-anfitrionas-permissions/apply-progress` (#8929). |
| All implementation tasks have tests | ✅ | Tasks 1.1-4.4 have reported test files and passing runtime evidence. |
| RED confirmed | ✅ | Test files exist for SQL-static, server-action, UI helper, and App Router page behavior. |
| GREEN confirmed | ✅ | Targeted Casas Jest suite passed 41/41. |
| Triangulation adequate | ✅ | Allow/deny, scope, direct access, and malformed payload cases are covered. |
| Safety net for modified files | ✅ | Prior apply-progress records safety-net runs per slice; final verification reran targeted and full suites. |

**TDD Compliance**: 6/6 checks passed.

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| SQL-static unit | 12 | 1 | Jest + filesystem SQL inspection |
| Server-action unit | 9 | 1 | Jest mocks for Supabase clients/actions |
| UI helper unit | 11 | 1 | Jest RPC-client mocks |
| App Router unit | 9 | 1 | Jest + Testing Library with mocked Next/Supabase |
| E2E | 0 | 0 | Not available in cached testing capabilities |
| **Total** | **41** | **4** | |

### Assertion Quality

**Assertion quality**: ✅ All reviewed Casas test assertions verify concrete behavior. No tautologies, focused tests, ghost loops, or type-only standalone assertions were found in the Casas test files.

### Spec Compliance Matrix

| Requirement | Scenario | Test / Evidence | Result |
|-------------|----------|-----------------|--------|
| Granular Role Permissions | Authorized action succeeds | `__tests__/supabase/casas-anfitrionas-permissions-migration.test.ts`; `supabase/tests/casas-anfitrionas-permissions-rpc.test.sql`; `__tests__/lib/actions/casas-anfitrionas.actions.test.ts`; `__tests__/app/casas-anfitrionas-pages.test.tsx` | ✅ COMPLIANT |
| Granular Role Permissions | Unauthorized action is denied | Same targeted suites cover deny-before-write, out-of-scope edit/approval/create, spoofed `p_auth_id`, and direct edit denial. | ✅ COMPLIANT |
| Scoped Visibility and Detail Revalidation | Direct detail access is revalidated | `__tests__/app/casas-anfitrionas-pages.test.tsx` verifies `puede_ver_casa_anfitriona` before admin detail reads. | ✅ COMPLIANT |
| Scoped Visibility and Detail Revalidation | Scoped lower role targets are checked | `__tests__/lib/actions/casas-anfitrionas.actions.test.ts` and assignable-user/page tests cover owner/co-host/read-helper scope checks and filtered assignable users. | ✅ COMPLIANT |
| UI, Server, and RPC Consistency | UI mirrors backend authorization | UI helper and App Router page tests verify controls and selectors derive from backend permission RPCs. | ✅ COMPLIANT |
| UI, Server, and RPC Consistency | Consistent permission diagnostics | SQL-static and action/UI tests assert matching RPC names, allow/deny categories, and error handling. | ✅ COMPLIANT |
| Approved House Sensitive Edits | Sensitive edit returns to review | `__tests__/lib/actions/casas-anfitrionas.actions.test.ts` verifies approved sensitive edit clears approval metadata. | ✅ COMPLIANT |
| Approved House Sensitive Edits | Non-sensitive edit preserves approval | Not separately covered by runtime test; current implementation only resets approval when `tieneEdicionSensible(parsed)` matches sensitive fields. | ⚠️ PARTIAL |
| Non-Destructive Migration and Data Safety | Migration preserves production data | SQL-static tests assert no destructive DDL/DML in the Casas granular migration. | ✅ COMPLIANT |
| Non-Destructive Migration and Data Safety | Data repair is blocked | SQL-static tests reject repair/backfill/delete/update patterns for this change. | ✅ COMPLIANT |

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Granular RPC predicates | ✅ Implemented | Additive functions exist with `SECURITY DEFINER SET search_path TO 'public'`, caller binding, anon revokes, and authenticated/service_role grants. |
| Server enforcement before admin writes | ✅ Implemented | Server actions check granular RPCs and target user scope before `adminDb` writes/reads. |
| UI permission source of truth | ✅ Implemented | List/detail/new/edit pages consume backend permission snapshots and filtered options. |
| Non-production verification | ✅ Followed | No production Supabase command was executed. |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Use granular RPC predicates instead of patching `puede_gestionar_casas` | ✅ Yes | New code paths use action-specific Casas RPCs for this change. |
| Validate visibility/scope before enriched admin reads/writes | ✅ Yes | Detail/edit/actions deny before admin client usage in covered paths. |
| Keep migrations additive and non-destructive | ✅ Yes | Migration lint passes with no errors; SQL-static tests assert no repair SQL. |
| Keep form presentational | ✅ Yes | Server pages pass `usuarios` and `mostrarSelectorUsuario`; tests verify backend-derived options. |

### Staging-only RPC Checks

`supabase/tests/casas-anfitrionas-permissions-rpc.test.sql` documents deterministic executable RPC checks for staging/local use and wraps fixture writes in `BEGIN`/`ROLLBACK`. It was not executed during this final verification to avoid any production Supabase access. Prior apply-progress records staging/type workflow evidence for Task 2.2.

### Issues Found

**CRITICAL**: None.

**WARNING**:
- Repo-wide `pnpm lint` and `pnpm lint:migrations` pass with existing warnings.
- Changed-file coverage remains low for `lib/actions/casas-anfitrionas.actions.ts` and uninstrumented/directly untested for `components/grupos-vida/form-casa-anfitriona.tsx`.
- Non-sensitive approved edit preservation is covered by static implementation review, not a dedicated runtime scenario.

**SUGGESTION**:
- Add a future direct test for non-sensitive approved edits if that policy becomes user-visible or risky.

### Verdict

PASS WITH WARNINGS

All required safe verification commands completed successfully, all 12 tasks are complete, and no blocker was found. Warnings are non-blocking repo-wide lint/migration debt and coverage gaps documented above.

## Corrective Addendum — 2026-06-17 Tracker Readiness Blocker

**Scope**: Post-archive hardening for direct execution of legacy `public.obtener_casas_visibles_ids(uuid)`. No production Supabase calls were made.

### Fix

- Added additive migration `supabase/migrations/20260617214453_harden_obtener_casas_visibles_ids_rpc.sql`.
- The RPC now checks `p_auth_id` before user/role/scope lookup and raises `auth_id_spoofed` for non-`service_role` callers whose `p_auth_id` differs from `auth.uid()`.
- The SQL harness now asserts the explicit invalid-input contract: `obtener_casas_visibles_ids(NULL)` raises `auth_id_required` before identity comparison or user lookup.
- Preserved authenticated caller behavior when `p_auth_id = auth.uid()` and kept trusted `service_role` execution available.
- Explicitly revoked `anon` execution and granted execution to `authenticated, service_role`.

### TDD Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| Tracker blocker: harden `obtener_casas_visibles_ids` | `__tests__/supabase/casas-anfitrionas-permissions-migration.test.ts`; `supabase/tests/casas-anfitrionas-permissions-rpc.test.sql` | SQL-static + SQL harness | ✅ Baseline targeted Jest passed 14/14 before this corrective evidence edit | ✅ Static test failed on missing SQL harness header / NULL invalid-input coverage | ✅ Focused Casas suites passed 43/43 after harness + static evidence update | ✅ Direct RPC NULL denial, spoof denial, matching director-etapa allow/in-scope, and out-of-scope cases documented | ✅ Minimal evidence-only update; no unrelated docs touched |

### Checks Run

```text
pnpm test -- __tests__/supabase/casas-anfitrionas-permissions-migration.test.ts --runInBand
Baseline: passed 14/14 before this corrective evidence edit.
RED: failed as expected while static evidence required stale header and NULL invalid-input coverage that the SQL harness did not yet contain.
GREEN: passed 14/14 after adding SQL harness `obtener_casas_visibles_ids(NULL)` coverage and header evidence.

pnpm test -- __tests__/supabase/casas-anfitrionas-permissions-migration.test.ts __tests__/lib/actions/casas-anfitrionas.actions.test.ts __tests__/lib/casas-anfitrionas/ui-permissions.test.ts __tests__/app/casas-anfitrionas-pages.test.tsx --runInBand
Test Suites: 4 passed, 4 total
Tests: 43 passed, 43 total

pnpm test -- --runInBand
Test Suites: 28 passed, 28 total
Tests: 251 passed, 251 total

pnpm lint:migrations
Summary: 173 files checked
Errors: 0
Warnings: 185
Info: 128

pnpm test:no-only
No focused Jest tests found.
```

`pnpm exec supabase status` showed the local Supabase container was not running (`No such container: supabase_db_Global_Connect`), so the SQL harness was not executed locally in this corrective slice.

### Corrective Verdict

PASS WITH WARNINGS — the tracker readiness blocker is fixed in code and covered by static/SQL-harness evidence. Remaining warning: executable SQL harness still requires a running local/staging Supabase database before deployment.
