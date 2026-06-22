# Tasks: Casas Anfitrionas Map

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900-1,300 total; each PR ≤400 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 DB foundation → PR 2 actions → PR 3 dashboard → PR 4 assignment → PR 5 review → PR 6 map → PR 7 member layer → PR 8 cleanup |
| Delivery strategy | auto-chain (force-chained) |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

First autonomous apply slice: PR 1 only.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Additive DB contracts + inventory | PR 1 | Base tracker branch; verify SQL; rollback by leaving objects unused. |
| 2 | RPC-backed action wrappers | PR 2 | Base PR 1; Jest action tests; fix-forward validation only. |
| 3 | Dashboard queues | PR 3 | Base PR 2; non-blocking cards; no workflow blocking. |
| 4 | Guided assignment flow | PR 4 | Base PR 3; assign existing approved/active Casas safely; create-and-link pending Casa deferred until a dedicated safe backend contract exists. |
| 5 | Review/approval + audit UI | PR 5 | Base PR 4; approve/reject scoped pending rows. |
| 6 | Host-home group map | PR 6 | Base PR 5; remove manual-address map eligibility. |
| 7 | Member map layer | PR 7 | Base PR 6; admin/director only, privacy messaging. |
| 8 | Guarded backfill/docs/cleanup | PR 8 | Base PR 7; dry-run first; no invented history. |

## Phase 1: PR 1 Safe DB Foundation

- [x] 1.1 Create `supabase/migrations/*_casas_map_location_review.sql` with additive review/audit tables, indexes, RPCs, grants; no drops or destructive updates.
- [x] 1.2 Add read-only inventory and verification SQL in `supabase/tests/casas_map_inventory.sql` for current Casas, manual addresses, pending rows, and map counts.
- [x] 1.3 Add `supabase/tests/casas_map_rpc_contracts.sql` for auth binding, approved-visible, pending-hidden, manual-address-ignored, scoped queues.

### PR 1 Traceability Notes

- RPCs created in PR1:
  - `obtener_mapa_grupos_vida_host_homes` — read-only host-home map contract; granted to `authenticated` and `service_role`.
  - `obtener_grupos_sin_casa_anfitriona` — read-only missing-host-home queue; granted to `authenticated` and `service_role`.
  - `obtener_casas_revision_pendiente` — read-only pending-review queue; granted to `authenticated` and `service_role`.
  - `obtener_mapa_miembros` — read-only member-location contract; granted to `authenticated` and `service_role`, but role-filtered in the RPC.
  - `asignar_casa_anfitriona_a_grupo` — mutating assignment contract; PR1 keeps it service-role-only and not executable by regular `authenticated` users until a later UI/action slice intentionally enables a rollout path.
  - `procesar_revision_ubicacion_casa` — mutating approval/rejection contract; PR1 keeps it service-role-only and not executable by regular `authenticated` users until the review UI/action slice intentionally enables a rollout path.
- SQL contracts now cover caller binding, actual authenticated denial for service-role-only mutating RPCs, service-role review execution using supplied actor scope, global-leader assignment denial for unmanaged groups, ordinary-member assignment denial, scoped leader assignment success, Casa-in-use denial, assignment audit, approve/reject effects, old-approved-location behavior while a change is pending, review audit writes, and member-layer filtering.
- Final PR1 contracts also lock the member map to one pin per user even when the user has multiple visible active memberships, and centralize director-general group scope checks for view, assignment, and review paths with executable coverage for a DG that has both assigned-DE and direct same-segment scope.
- Later slices must not broaden mutating grants without pairing server-action validation, rollout notes, and fresh SQL/Jest contracts in the same PR slice.

## Phase 2: PR 2 RPC/Authz Actions

- [x] 2.1 Update `lib/actions/casas-anfitrionas.actions.ts` with Zod-validated wrappers for map, queues, assignment, review, and member RPCs.
- [x] 2.2 Add `__tests__/lib/actions/casas-anfitrionas.actions.test.ts` cases for invalid scope, unauthorized mutation, and no admin read before RPC validation.

## Phase 3: PRs 3-5 Operational Flows

- [x] 3.1 Update `app/(auth)/dashboard/page.tsx` and `components/dashboard/roles/*` with missing-host-home and pending-review cards.
- [x] 3.2 Create `app/(auth)/grupos-vida/casas-anfitrionas/asignar/**` guided assignment flow for existing approved/active Casas and tests.
- [x] 3.3 Create `app/(auth)/grupos-vida/casas-anfitrionas/revision/**` scoped approve/reject UI and audit verification tests.
- [ ] 3.4 Create-and-link pending Casa during assignment after a safe backend contract exists; do not treat PR4 as completing this pending-house flow.

## Phase 4: PRs 6-7 Maps and Privacy

- [x] 4.1 Update `app/(auth)/grupos-vida/mapa/page.tsx` and `components/grupos-vida/mapa-*.tsx` to use host-home RPC, filters, and neutral privacy copy.
- [x] 4.2 Update `components/forms/GroupEditForm.tsx` to stop treating manual addresses as map source and link to guided assignment.
- [x] 4.3 Add member-layer rendering/tests in `components/grupos-vida/mapa-*.tsx`; verify unauthorized users receive no member payload.

## Phase 5: PR 8 Production Safety and Cleanup

- [x] 5.1 Gate production data changes with dry-run inventory, staging smoke, explicit approval, and post-migration verification queries.
- [x] 5.2 Add guarded backfill utilities under `supabase/migrations/` only for approved existing Casa data; never invent historical host-home records.
- [ ] 5.3 Run `supabase/tests/**`, Jest/page tests, and Supabase advisors; document fix-forward notes for each DB slice. Local/static Jest and SQL evidence gates are prepared in PR8, but live Supabase advisors remain a release gate and have not been run by this PR.
