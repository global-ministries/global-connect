# Proposal: Casas Anfitrionas Permissions

## Intent

Redesign Casas Anfitrionas authorization so view, request, create-for-another, approve/reject, edit, and deactivate/reactivate are enforced separately and safely. Current role checks are coarse and UI/backend rules diverge, which risks unauthorized direct actions and confusing workflows.

## Scope

### In Scope
- Add granular Casas permission rules backed by database/server-action checks.
- Align listing, detail, create, edit, approval, and active-state flows with those rules.
- Keep migrations additive, backward-compatible, and non-destructive.
- Add high-level diagnostics/tests for permission and direct-route safety.

### Out of Scope
- Destructive production data mutation.
- Data repair/backfill or cleanup without separate explicit approval and a reversible plan.
- A generic capability-management UI beyond the Casas role model.

## Capabilities

### New Capabilities
- `casas-anfitrionas-permissions`: Casas permission contract for scoped view, self-request, create-for-other, approve/reject, edit, and deactivate/reactivate behavior.

### Modified Capabilities
- None.

## Approach

Use granular Supabase RPC predicates as the authorization source of truth, then make Next.js server actions and UI consume those decisions instead of duplicating role arrays. Admin/Pastor receive broad authority; Director General acts within scope and can approve; Director de Etapa can view/create/edit within etapa scope but approval escalates; Líder and members can submit own pending requests, with Líder limited to group-related suggestions. Sensitive edits to approved houses must require review again or a pending revision path in specs/design.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `lib/actions/casas-anfitrionas.actions.ts` | Modified | Enforce granular action permissions. |
| `app/(auth)/grupos-vida/casas-anfitrionas/**` | Modified | Align list/detail/create/edit/approval UI and route guards. |
| `components/grupos-vida/form-casa-anfitriona.tsx` | Modified | Keep form presentational; pass allowed choices only. |
| `supabase/migrations/*casas*`, `*grupos_vida*` | New/Modified | Add predicates/RLS-compatible guards without destructive data changes. |
| `__tests__/`, `supabase/tests/` | New | Add permission coverage/preflight checks. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing data violates new rules | High | Diagnostics only; separate repair change. |
| RLS/server-action mismatch | Med | One predicate layer and tests. |
| Approved edits disrupt active groups | Med | Specify review lifecycle before implementation. |

## Rollback Plan

Revert app/UI changes and stop calling new RPC predicates. Because migrations must be additive, rollback leaves old data intact and can retain unused functions until a later cleanup migration.

## Dependencies

- Product confirmation of approved-house edit lifecycle.
- Safe Supabase migration/testing workflow.

## Success Criteria

- [ ] Each Casas action maps to an explicit permission.
- [ ] Direct URL/action access revalidates scoped visibility before mutation.
- [ ] No destructive production data mutation is included.
- [ ] Specs/design can define tests for role/scope scenarios.
