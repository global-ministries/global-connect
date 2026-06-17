# Tasks: Casas Anfitrionas Permissions

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 650-950 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 RPC/tests → PR 2 actions/tests → PR 3 UI/verification |
| Delivery strategy | auto-forecast |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Strict TDD: write/adjust the failing Jest or SQL-static test before each production change; implementation is only complete once the targeted test passes.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Add additive granular RPC contract and static migration safety tests | PR 1 | Base main; no production repair/backfill. |
| 2 | Enforce RPC-backed server actions and scope validation | PR 2 | Base PR 1; tests cover deny-before-write. |
| 3 | Align App Router pages/forms with backend permissions | PR 3 | Base PR 2; UI only reflects server decisions. |

## Phase 1: RED Permission Contract Tests

- [x] 1.1 Create `__tests__/supabase/casas-anfitrionas-permissions-migration.test.ts` asserting additive SQL, RPC names/grants, `SECURITY DEFINER SET search_path`, and no destructive repair SQL.
- [x] 1.2 Create `__tests__/lib/actions/casas-anfitrionas.actions.test.ts` for deny-before-write, granular RPC calls, owner/co-host scope checks, revalidation, and approved sensitive edits.

## Phase 2: Supabase Foundation

- [x] 2.1 Create `supabase/migrations/<timestamp>_casas_anfitrionas_granular_permissions.sql` with `obtener_permisos_*` and `puede_*` RPCs only; keep migration additive/non-destructive.
- [x] 2.2 Run staging migration/type workflow, then update `lib/supabase/database.types.ts`; flag generated-type diff if it alone exceeds review budget.

## Phase 3: Server Enforcement

- [x] 3.1 Update `lib/actions/casas-anfitrionas.actions.ts` to replace coarse role checks with action-specific RPC permission helpers.
- [x] 3.2 In the same file, validate submitted owner, co-host, group, and house ids before any `adminDb` read/write.
- [x] 3.3 In the same file, conservatively reject or return approved sensitive edits to pending/review per spec before saving.

## Phase 4: App Router UI Wiring

- [ ] 4.1 Update `app/(auth)/grupos-vida/casas-anfitrionas/page.tsx` to use backend list visibility and create permissions.
- [ ] 4.2 Update `app/(auth)/grupos-vida/casas-anfitrionas/[id]/page.tsx` to call visibility RPC before enriched `adminDb` detail reads.
- [ ] 4.3 Update `app/(auth)/grupos-vida/casas-anfitrionas/nueva/page.tsx` and `[id]/editar/page.tsx` to use backend-derived assignable users/permissions.
- [ ] 4.4 Keep `components/grupos-vida/form-casa-anfitriona.tsx` presentational; remove local role inference and consume passed permissions/options only.

## Phase 5: Verification

- [ ] 5.1 Run targeted Jest tests, `pnpm lint:migrations`, `pnpm test:no-only`, and `pnpm lint`; document any staging-only RPC checks separately.
