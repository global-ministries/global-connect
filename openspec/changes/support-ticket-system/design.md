# Design: Support Ticket System

## Technical Approach

Build a first-party support domain with Supabase as source of truth, R2 as private blob storage, and Inngest/Resend as post-commit side effects. Boundaries: `app/(auth)/ayuda/**` screens; `lib/actions/support*.ts` mutations; `app/api/support/attachments/**` R2 signing/finalization/download; `lib/support/**` authorization, evidence scrubbing, R2, Inngest helpers. GitHub sync stays out of MVP.

## Architecture Decisions

| Decision | Choice | Rejected | Why |
|---|---|---|---|
| System of record | Supabase tables + RLS | email/GitHub as queue | Preserves history, search, ownership, and auditability. |
| Attachments | Private R2 + DB metadata | Supabase Storage/public URLs/base64 | Keeps large files out of Next/Supabase limits; requires app authorization. |
| Staff auth | `support.view/reply/manage` capability tags on existing admin users | new support roles | Avoids role explosion and allows future GitHub capabilities. |
| Async | Inngest events by ID only | synchronous email/GitHub | Keeps ticket creation reliable and side effects retryable/idempotent. |
| Evidence | allowlisted diagnostics + Sentry IDs | raw Sentry/replay/session data | Reduces PII leakage while preserving debugging value. |
| Delivery | chained PRs | one large PR | Required by 400-line review budget. |

## Data Flow

Reporter UI -> Server Action creates ticket/message/event -> DB commit -> Inngest `support/ticket.created` -> Resend safe email. Attachments: intent row -> short-lived R2 signed PUT -> direct browser upload -> finalize verifies metadata -> signed GET after authorization.

## Supabase Design

Create migration with `support_tickets`, `support_ticket_messages`, `support_ticket_attachments`, `support_ticket_events`, `support_user_capabilities`. Use text checks for statuses `received/in_review/in_progress/resolved/closed`, attachment kind/status, and capabilities. Store `reporter_usuario_id`, optional `assignee_usuario_id`, `campus_id`, category/severity, title/description, route/browser/OS/viewport/build, `sentry_event_id`, `diagnostics_consent`, and generated weighted `search_vector` over ticket number/title/description/category/status. Index reporter, status+created, assignee, campus, pending attachments, event ticket/time, and GIN FTS.

RLS: enable all support tables, grant least privilege to `authenticated`, deny `anon`. Reporter can create/read own tickets/messages/attachments and append public replies. Staff helpers `support_has_capability(auth.uid(), capability)` and `support_current_usuario_id()` should live outside exposed schemas or be tightly granted; policies use `TO authenticated`, `(select auth.uid())`, and indexed columns. `support_ticket_events` is append-only: insert via server/RPC only, no update/delete. Manage status transitions via server action/RPC and audit each change.

## R2 Strategy

Bucket: private `global-connect-support`. Keys: `support/{ticket_id}/{attachment_id}/{safe_filename}`; never trust filenames for authorization. Intent validation enforces screenshots PNG/JPG/WebP <=10MB each, max 5; video MP4/WebM/MOV <=100MB, max 1; ticket total <=150MB. Signed PUT expires in 5 minutes. Finalization rechecks ownership/capability, HEADs the object, compares size/content type/checksum, performs magic-byte MIME sniffing where practical, marks uploaded, or deletes rejected objects. Signed reads expire in 60 seconds. Cleanup removes stale pending uploads and applies retention via `retention_expires_at`.

## Next.js Integration

Routes: `/ayuda`, `/ayuda/reportar`, `/ayuda/tickets`, `/ayuda/tickets/[id]`, `/ayuda/admin`. Replace Ayuda toasts in `sidebar-moderna`, `header-movil`, `menu-inferior-movil`, and `desktop-header` with links. Use existing `ContenedorDashboard`, `BotonSistema`, `InputSistema`, `TextareaSistema`, `BadgeSistema`, dialogs, and form labels. Route handlers cover attachment intent/finalize/download; large files never pass through Server Actions. Admin console provides filters, FTS, assignment, status, timeline, and internal evidence gated by capability.

## Interfaces / Contracts

Events: `support/ticket.created`, `support/ticket.message.created`, `support/ticket.status.changed`, `support/attachment.finalized`, future `support/github.sync.requested`. Payloads contain IDs only (`ticketId`, `messageId`, `attachmentId`, `actorUserId`, `eventId`). Idempotency keys: `email:{eventId}:{recipient}` and provider IDs recorded in audit events. Emails reuse `sendEmail` and React Email layout; no evidence, attachments, or PII-heavy fields in email bodies.

## Sentry Evidence

Before evidence UI, harden `instrumentation-client.ts`, `sentry.server.config.ts`, and `sentry.edge.config.ts`: disable default PII or scrub with `beforeSend`, mask replay text/media, and store only references. The support form shows consent copy and never collects cookies/tokens/passwords/localStorage/replays/videos automatically.

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/*support_ticket_system.sql` | Create | Schema, RLS, helpers, indexes. |
| `lib/support/**`, `lib/actions/support*.ts` | Create | Auth, validators, evidence, events, mutations. |
| `app/api/support/attachments/**/route.ts` | Create | R2 signing/finalization/download. |
| `app/(auth)/ayuda/**` | Create | User and staff support surfaces. |
| `emails/support-*.tsx`, `lib/email/**` | Create/Modify | Safe notifications. |
| nav/Sentry/test/type files | Modify | Entry points, PII hardening, generated types/tests. |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| DB/RLS | anon denial, reporter ownership, staff capability, append-only audit | `pnpm test:rls`, migration lint. |
| Unit | Zod validators, capability helpers, evidence scrubber, R2 key builder | Jest with mocked Supabase/R2/Inngest. |
| Integration | create/reply/status/attachment finalize and idempotent emails | route/action tests with provider mocks. |
| UI/E2E | mobile-first submit/history/admin queue | component tests plus manual authenticated flows. |

## Chained PR Strategy

1. Schema/RLS/tests/types. 2. `/ayuda` shell, navigation, create/history without attachments. 3. R2 attachment flow. 4. Admin queue/status/replies/search. 5. Inngest/Resend. 6. Sentry evidence hardening. Keep each slice under 400 changed lines; GitHub sync is later.

## Migration / Rollout

Add schema first with no navigation exposure. Configure R2/Inngest/Resend env vars server-only. Rollback: hide links, disable route handlers/workflows, stop email sends, revoke R2 signing; preserve data unless explicitly archived. No destructive migration until retention/export is decided.

## Open Questions

- [ ] Final attachment retention duration and cleanup cadence.
