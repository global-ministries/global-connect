# Proposal: Casas Anfitrionas Map

## Intent

Make Casa Anfitriona the official Life Group location source. Current `/grupos-vida/mapa` uses `v_mapa_grupos_vida`, falls back to manual addresses, and shows only 5/73 active groups with coordinates while 0 are linked to host homes. The map is unreliable and completion/review work is hidden.

## Goals

- Map only groups with linked host home and approved location.
- Warn non-blockingly when active groups lack host homes.
- Support scoped assignment, review, audit, privacy, and member-location rules.
- Force chained PRs within the 400-line budget.

## Scope

### In Scope
- Active/default and planned/filter eligibility; no historical map.
- Dashboard queues for missing host homes and pending reviews.
- Reused Casa create/select assignment from group edit or guided UX.
- Last-approved location plus pending change; edit audit.
- Admin/director-only member map layer within scope.

### Out of Scope
- Blocking attendance, reports, or planning.
- Full group-house history or invented historical data.
- Final modal-vs-page UX choice.

## User Stories

- Leader assigns an eligible host home so a group can become map-ready.
- Director/admin reviews incomplete groups, pending houses, multi-group homes, and approvals.
- Admin/director views exact member pins only within authorized active/future scope.

## Capabilities

### New Capabilities
- `life-group-host-home-map`: eligibility, filters, popups.
- `host-home-completeness`: missing-assignment and pending-review queues.
- `host-home-location-review`: approved/pending locations and audit.
- `member-location-map`: permission-gated member layer.

### Modified Capabilities
- `casas-anfitrionas-permissions`: assignment, multi-group, hall, approval, and member-location access rules.

## Approach

Exclude groups without approved host-home location from map data. Add scoped dashboard queries/actions. Link pending houses immediately but keep them off-map until approval. Model Iglesia Global halls as approved multi-group Casas. Centralize server/RPC authorization.

## Affected Areas

- Modified: `app/(auth)/grupos-vida/mapa/page.tsx`, `components/grupos-vida/mapa-*.tsx`.
- New/modified: `app/(auth)/grupos-vida/casas-anfitrionas/**`, `GroupEditForm.tsx`, `lib/actions/**`, `supabase/migrations/**`.

## Design-Phase Items

Modal vs page; sensitive fields; audit schema; migration strategy for manual group addresses.

## Migration/Data Strategy

Use additive migrations only. Do not invent host-home data. Preserve historical gaps; migrate manual addresses only after design approval.

## Risks

- High: cross-cutting scope → chained 400-line PR slices.
- Med: member privacy leak → backend authorization.
- High: emptier map → dashboard remediation queues.

## Rollback Plan

Revert UI/actions and previous map query behavior. Leave additive DB objects unused or remove later.

## Dependencies

- Existing `casas-anfitrionas-permissions` spec.
- Supabase-safe migration workflow.

## Acceptance Criteria

- [ ] Groups without Casa Anfitriona do not appear on the map.
- [ ] Pending-only locations stay hidden; last approved location remains visible.
- [ ] Scoped queues show missing host homes and pending reviews.
- [ ] Assignment, multi-group, hall, approval, audit, and member-layer permissions are server-enforced.
- [ ] Delivery plan uses chained PR slices within 400 changed lines.
