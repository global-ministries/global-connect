# Design: Support Ticket Production Readiness

## Technical Approach

Harden the existing support MVP instead of replacing it. Supabase remains authoritative; R2 stores private blobs; Next.js App Router pages/actions own UX and authorization; live providers stay gated until smoke and release checks pass. The design follows the current `ContenedorDashboard`/server-action patterns while closing production gaps called out by the delta spec: simple reporter UX, inline attachments, staff lifecycle controls, capability administration, live ID-only notifications, safe external bridge, and rollout gates.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| Keep Supabase as source of truth | Requires production migration reconciliation before exposure | Use existing `support_*` tables/RLS/RPCs; add only additive reviewed migrations. |
| Reuse existing R2 helpers | UI work remains, but storage rules are already tested | Wire `lib/support/r2*.ts` and `app/api/support/attachments/**` into reporter/detail UI; no public URLs or base64. |
| Capability tags over new roles | Needs admin UI for grants/revokes | Keep `support.view/reply/manage` in `support_user_capabilities`; add bounded admin configuration and audit events. |
| Live Inngest later than local helpers | Adds provider slice, avoids hidden side effects | Add real Inngest client/route/functions with ID-only events after DB commit and Resend idempotency. |
| Config-gated bridge | Less built-in automation | No GitHub sync; external webhook/email/event bridge must sanitize, authenticate, audit, and dedupe. |
| Chained implementation | More coordination | Required: scope is high and exceeds the 400-line review budget. |

## Data Flow

Reporter form -> `createSupportTicket` -> Supabase ticket/event -> Inngest event -> Resend to support staff.
Attachments: create ticket -> intent route -> signed R2 PUT -> finalize route -> metadata visible/downloadable only after auth.
Staff: `/ayuda/admin` -> capability check -> RPC mutation -> audit event -> revalidate/detail refresh.
External bridge: staff-approved escalation -> sanitized outbound -> authenticated inbound update -> idempotent message/event.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/(auth)/ayuda/reportar/page.tsx` | Modify | Replace technical fields with subject/description/category and client-side automatic safe diagnostics plus inline upload progress/retry/finalize. |
| `app/(auth)/ayuda/tickets/[id]/page.tsx` | Modify | Show authorized attachments, staff controls, replies, and safe evidence without object keys/signed URLs. |
| `app/(auth)/ayuda/admin/page.tsx` | Modify | Add assignment/status controls and staff detail actions gated by capabilities. |
| `components/ui/sidebar-moderna.tsx`, `components/ui/header-movil.tsx`, `components/ui/menu-inferior-movil.tsx`, `components/ui/desktop-header.tsx` | Modify | Preserve `/ayuda` links and add capability-aware support admin entry. |
| `app/(auth)/configuracion/**`, `lib/actions/support-capabilities.actions.ts` | Create/Modify | Admin grant/revoke UI for support capabilities with audit and allowlist validation. |
| `lib/actions/support.actions.ts` | Modify | Use `subject` mapping, emit post-commit support events, return safe action results. |
| `lib/support/support-evidence.ts`, `lib/support/sentry-privacy.ts`, Sentry config files | Modify | Move from user-typed diagnostics to allowlisted automatic evidence and scrubber verification. |
| `lib/support/inngest.ts`, `app/api/inngest/route.ts`, `emails/support-ticket.tsx`, `lib/email/support.ts` | Modify/Create | Live Inngest/Resend path for support staff notifications; payloads remain IDs only. |
| `lib/support/external-bridge.ts`, `app/api/support/external/**` | Create | Sanitized outbound and authenticated inbound bridge with idempotency. |
| `supabase/migrations/*support*.sql`, `lib/supabase/database.types.ts`, `docs/support-operations.md` | Modify/Add | Additive reconciliation, capability audit support, generated types, release gates. |

## Interfaces / Contracts

- Reporter input: `subject`, `description`, `category`, `attachments[]`; keep server DB `title` until an additive rename is reviewed.
- Support events: `support/ticket.created`, `support/ticket.message.created`, `support/ticket.status.changed`, `support/attachment.finalized`, `support/external.update.received`; data contains IDs only.
- Capability actions accept only `support.view`, `support.reply`, `support.manage` and record actor, target, capability, action.
- Bridge inbound requires authentication plus idempotency key; stores sanitized message once.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | evidence scrubbers, capability allowlist, event builders, bridge sanitizer | Jest with typed fixtures; no `any`. |
| Integration | server actions, R2 intent/finalize/download, Inngest/Resend mocks, admin grant/revoke | Existing Jest route/action tests plus provider mocks. |
| DB/RLS | ownership, support capability gates, audited RPCs, additive migrations | `pnpm lint:migrations`, `pnpm test:rls`, migration contract tests. |
| Smoke | non-production R2, Resend/Inngest, Sentry privacy, release gates | Manual/automated runbook checks without printing secrets, URLs, or object keys. |

## Migration / Rollout

Roll out in chained slices: UX/evidence, attachments/R2 smoke, staff/navigation, capability admin, Inngest/Resend, external bridge, Supabase reconciliation, release governance. Production stays degraded until DB/provider/env/privacy/RLS/smoke/rollback gates pass. No destructive production migration or data deletion; rollback hides links and disables side effects while preserving records.

## Open Questions

- [ ] Final retention duration and stale pending-upload cleanup cadence remain unresolved but are not required for initial readiness unless policy demands deletion.
