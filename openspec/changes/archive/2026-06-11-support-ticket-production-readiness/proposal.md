# Proposal: Support Ticket Production Readiness

## Intent

The archived MVP is not production-ready because app UX, Supabase rollout, providers, staff operations, privacy evidence, and release gates are not coordinated. This hardens support while keeping Supabase authoritative and avoiding GitHub coupling.

## Scope

### In Scope
- Replace technical fields with `subject`, `description`, `category`, and inline `attachments`.
- Auto-capture privacy-safe diagnostics by default; never collect cookies, passwords, localStorage, raw payloads, signed URLs, object keys, or sensitive content.
- Keep `/ayuda` in the authenticated desktop layout and mobile menu.
- Add staff admin entry, assignment/status controls, and admin configuration for granting/revoking `support.view`, `support.reply`, and `support.manage` to admin/staff users.
- Wire non-production Inngest/Resend notifications to support staff with ID-only events.
- Add external escalation via webhook/email/event plus safe inbound updates/messages.
- Define production Supabase reconciliation, additive reviewed migrations, non-destructive rollout steps, and release gates for real production data.

### Out of Scope
- Built-in GitHub Issues sync.
- Retention automation unless required for readiness.
- Advanced SLA dashboards/escalations.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `support-ticket-system`: production-ready UX, attachments, navigation, capability administration, lifecycle controls, live notifications, external escalation, and rollout gates.

## Approach

Use chained slices to protect the 400-line budget: UX/evidence, attachments/R2 smoke, staff controls/navigation, admin capability configuration, Inngest/Resend, external bridge, Supabase reconciliation, and release governance. Each slice must be reviewable, reversible, and verified before exposure. Capability provisioning must be available through admin configuration, not SQL-only grants.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/(auth)/ayuda/**` | Modified | UX, attachments, staff controls, capability configuration, layout. |
| `components/ui/*` | Modified | `/ayuda` and admin navigation. |
| `lib/actions/support.actions.ts` | Modified | Events and lifecycle. |
| `lib/support/**`, `app/api/support/**` | Modified/New | Diagnostics, R2, Inngest, bridge. |
| `supabase/migrations/**`, `lib/supabase/database.types.ts` | Modified | Additive RLS/types reconciliation; no destructive production changes. |
| `docs/support-operations.md` | Modified | Safe rollout, release gates, rollback. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Privacy leakage | Med | Allowlist diagnostics; test scrubbers. |
| Production DB drift | High | Reconcile migrations before app exposure. |
| Data loss in production | High | Additive reviewed migrations only; no deletion/destructive changes. |
| Provider duplicates | Med | ID-only events, idempotency keys, smoke. |
| Oversized review | High | Chained PR slices under budget. |
| Unsafe bridge | Med | Signed/authenticated inbound API. |
| SQL-only support access | Med | Admin UI/config must grant and revoke support capabilities. |

## Rollback Plan

Keep providers and bridge behind config gates. Roll back app slices, disable Inngest/webhook dispatch, preserve Supabase data, and only ship additive reviewed migrations. Production rollback must not delete data or apply destructive schema changes.

## Dependencies

- Supabase production reconciliation.
- Reviewed non-destructive production migration plan.
- Non-production R2, Inngest, Resend, Sentry privacy validation.
- Admin capability configuration for support staff grants/revocation.

## Success Criteria

- [ ] Reporter creates tickets with non-technical fields and inline attachments.
- [ ] Admins can grant/revoke `support.view`, `support.reply`, and `support.manage` without SQL-only provisioning.
- [ ] Staff can reach admin tools and manage lifecycle safely according to assigned capabilities.
- [ ] All support staff receive safe non-production notifications.
- [ ] External escalation sends and receives safe updates without GitHub coupling.
- [ ] Release waits for app, DB, providers, privacy, smoke, additive migration review, and rollback gates.
