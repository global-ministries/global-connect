# Exploration: support-ticket-system

## Current State

Global Connect is a Next.js App Router application backed by Supabase Auth/Postgres/RLS. Authenticated routes live under `app/(auth)`, route handlers live under `app/api`, mutations are mostly Server Actions in `lib/actions`, and Supabase clients are split into browser, server, and admin clients under `lib/supabase`. The design system is the Liquid Glass/VisionOS system in `components/ui/sistema-diseno.tsx`, with `DashboardLayout`, `ContenedorDashboard`, `BotonSistema`, `InputSistema`, `TextareaSistema`, and `BadgeSistema` as preferred building blocks.

There is no first-party support ticket domain yet. The existing “Ayuda” entry points in desktop sidebar, mobile drawer, and bottom mobile menu currently show `toast.info('Próximamente')`, and the mobile title resolver already recognizes `/ayuda`. This is the natural user entry point for reporting failures, viewing ticket history, and accessing support actions.

The current platform already has useful integration foundations:

- Supabase Auth SSR protects private pages through middleware and `supabase.auth.getUser()`.
- Role/permission logic is already centralized around `obtener_roles_usuario`, `getUserWithRoles`, `requireAuth`, RLS policies, and RPCs.
- Existing audited workflow tables (`solicitudes_grupo`, `historial_movimientos_grupo`, `audit_grupo_miembros`) show the repo pattern for stateful requests, status history, RLS, scoped reads, duplicate prevention, and audit trails.
- Supabase Storage is currently used for profile photos and platform logos; Cloudflare R2 is not integrated yet.
- Resend is already installed and wrapped by `lib/email/send.ts`, with React Email templates in `emails/`.
- Sentry is installed and configured for Next.js, including replay, request errors, and a `/monitoring` tunnel.
- Inngest and GitHub App/Octokit dependencies are not present in `package.json` yet.
- `next.config.mjs` currently allows Supabase Storage images only; R2-hosted media would need explicit image/domain handling if displayed through Next image paths.

## Affected Areas

- `app/(auth)/ayuda/**` — new authenticated support surface for report creation, ticket history, ticket detail, and possibly admin/support triage.
- `components/ui/sidebar-moderna.tsx` — desktop “Ayuda” toast should become navigation to the support surface.
- `components/ui/header-movil.tsx` — mobile drawer footer “Ayuda” toast should become navigation; title resolver already includes `/ayuda`.
- `components/ui/menu-inferior-movil.tsx` — bottom mobile “Ayuda” currently has no link; it can become the primary mobile support entry point.
- `components/ui/sistema-diseno.tsx` — existing form/card/button components should be reused for accessible ticket forms, attachment states, and timelines.
- `lib/actions/**` or `app/api/support/**` — ticket creation, message posting, attachment preparation/finalization, status transitions, and GitHub sync requests need server-side auth, validation, and authorization.
- `lib/supabase/database.types.ts` — must be regenerated after support migrations.
- `supabase/migrations/**` — new support tables, indexes, RLS policies, RPCs if needed, and FTS indexes.
- `supabase/tests/rls-policies.test.mjs` — add RLS coverage for reporter access, support/admin access, attachment ownership, and anonymous denial.
- `lib/email/**` and `emails/**` — support notification templates and idempotent sends through the existing Resend wrapper.
- `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` — evidence capture must be reviewed because `sendDefaultPii: true` is currently enabled.
- `next.config.mjs` — R2 asset host and upload limits need review; large videos should not flow through Server Actions.

## Support Ticket Domain Boundaries

Recommended core entities:

- `support_tickets`: source of truth for reporter, campus, title, description, category, severity, status, origin route, sanitized public summary, optional Sentry references, and assignment metadata.
- `support_ticket_messages`: conversation/history entries from reporter, support staff, and system automation.
- `support_ticket_attachments`: R2 object metadata only; no blobs in Postgres. Include object key, content type, size, checksum, upload status, scan status, and visibility.
- `support_ticket_events`: append-only audit trail for status changes, assignment, attachment lifecycle, email notifications, and GitHub sync state.
- `support_ticket_github_syncs`: optional sanitized GitHub issue mapping, payload snapshot, issue number/url, sync status, failure reason, and idempotency key.

Do not make GitHub the support source of truth. GitHub should be an optional engineering projection created only after sanitization and authorization.

## R2 Storage Strategy and Upload Flow

Preferred MVP flow:

1. Authenticated user creates a draft ticket or submits ticket metadata in Supabase.
2. Server validates the file intent and creates `support_ticket_attachments` rows with `status = 'pending_upload'`.
3. Server returns short-lived R2 presigned PUT/POST URLs using server-only R2 credentials.
4. Browser uploads screenshots/videos directly to R2, avoiding Supabase Storage and Next.js body limits.
5. Client calls a finalize endpoint/server action with attachment IDs, object metadata, size, content type, and optional checksum.
6. Server verifies authorization, marks attachments `uploaded`, emits async events, and renders attachments only through authorized signed download/view URLs.

Object key convention should avoid user-provided filenames as path authority: `support/{ticket_id}/{attachment_id}/{safe_filename}` or `support/{campus_id}/{ticket_id}/{attachment_id}`. Keep the bucket private. Use signed read URLs after RLS authorization, not public URLs. Enforce MIME allowlists, size caps, max attachment count per ticket, and cleanup for stale `pending_upload` rows.

## Supabase Schema and RLS Responsibilities

Supabase should remain the transactional source of truth:

- Reporter can create tickets and read their own tickets, messages, and attachments.
- Support/admin roles can triage within the agreed product scope. The project already has `admin`, `pastor`, `director-general`, `director-etapa`, `lider`, and `miembro`; proposal must decide whether support is a new role or a permission attached to existing roles.
- Campus scoping should follow existing `usuario_campus`, `mis_campus_ids`, and `mi_campus_principal` patterns where applicable.
- RLS must deny anonymous access and prevent IDOR on ticket IDs and attachment IDs.
- Writes should validate status transitions; sensitive escalation actions can be RPC-backed if direct table policies become too complex.
- Search can start with Postgres FTS over title, description, ticket number, reporter name/email, status, category, and sanitized engineering summary. Add GIN indexes and partial indexes for common queues (`status`, `campus_id`, `created_at`, assigned support user).

The schema should avoid storing raw browser screenshots, session replay content, or complete Sentry payloads in Postgres. Store stable references and a controlled support summary instead.

## Inngest Workflow Boundaries and Idempotency

Inngest is best used after the database commit, not as the synchronous source of truth.

Good MVP events:

- `support/ticket.created` — send acknowledgement, notify support staff, link Sentry evidence if supplied.
- `support/ticket.message.created` — notify the opposite side and update unread state.
- `support/ticket.status.changed` — send transactional updates.
- `support/attachment.finalized` — optional metadata processing, cleanup scheduling, future malware scan hook.
- `support/github.sync.requested` — create/update sanitized issue asynchronously.

Idempotency should be database-backed: unique event keys such as `ticket.created:{ticket_id}`, `email.ticket-created:{ticket_id}:{recipient}`, and `github.sync:{ticket_id}:{sync_version}`. Store external provider IDs in `support_ticket_events`/sync tables so retries do not duplicate emails or GitHub issues.

## Resend Notifications

The repo already has `sendEmail({ idempotencyKey })` and React Email templates. Support should reuse that wrapper and add templates for:

- reporter acknowledgement after ticket creation;
- support team notification for new/severe tickets;
- reporter notification for staff reply/status change;
- optional engineering notification when a GitHub issue is created.

Email content should avoid raw PII, screenshots, or internal Sentry details. Link back to the authenticated ticket page instead. Keep one primary CTA per email and use the existing dark email layout.

## Sentry Evidence and PII Concerns

Sentry can add high-value technical evidence: event ID, replay ID, trace ID, route, browser, release, and recent error context. The support form should accept only references or a curated diagnostic bundle, not full raw event payloads.

Important current risk: Sentry config currently sets `sendDefaultPii: true` in client, server, and edge configs. Before exposing support evidence, the proposal/design should define whether to disable default PII, scrub user data with `beforeSend`, mask replay text/media, and clearly disclose what diagnostic data is attached.

User-submitted screenshots/videos are also PII risks. They need explicit consent text, size/type limits, private R2 storage, short-lived download URLs, and redaction guidance in the UI.

## GitHub App Sanitized Issue Sync

GitHub should be a downstream engineering sync only:

- Staff/support user decides whether a ticket becomes an engineering issue, or automation creates a draft sync request that requires approval.
- The GitHub issue body must be generated from sanitized fields: problem summary, reproduction steps, expected/actual behavior, environment, anonymized Sentry references, and internal ticket link.
- Do not include user identity, emails, phone numbers, screenshots/videos, raw Sentry replay URLs, church/member data, or database IDs unless explicitly approved.
- Store issue number/url and sync status in Supabase. Treat GitHub failures as retryable async failures, not ticket submission failures.

Dependencies and env vars for a GitHub App are not present yet; this should be a later slice after the first-party ticket workflow is stable.

## UX Surface for Mobile and Desktop

Recommended entry points:

- Desktop: sidebar footer “Ayuda” opens `/ayuda` instead of a toast.
- Mobile: bottom nav “Ayuda” becomes the fast report entry; mobile drawer footer should also link to `/ayuda`.
- In-app contextual helper: allow a report button to prefill `current_path`, component/page context, and optional Sentry event ID.

Recommended first screens:

- `/ayuda`: support home with “Report a problem”, “My tickets”, search/filter, and support expectations.
- `/ayuda/reportar`: multi-step or progressive disclosure form: category, severity, title, description, reproduction steps, expected/actual behavior, attachments, diagnostic consent.
- `/ayuda/tickets`: reporter history; support roles get queue filters.
- `/ayuda/tickets/[id]`: conversation, status timeline, attachments, internal metadata gated by role.

UX must be mobile-first: 44px touch targets, visible labels, inline validation, upload progress, retry states, autosave/draft for long reports, clear privacy language, and no reliance on hover.

## Approaches

1. **First-party MVP without GitHub sync in slice 1** — Build tickets, messages, private R2 attachments, support history, FTS, and Resend/Inngest notifications first.
   - Pros: Establishes the real support source of truth; avoids leaking support data into GitHub; fits chained PR delivery; validates UX and RLS before external sync.
   - Cons: Engineering issue creation waits for a later slice; staff may manually bridge urgent bugs at first.
   - Effort: Medium/High.

2. **First-party MVP plus GitHub sync immediately** — Build the complete support workflow and GitHub App sync in one change series.
   - Pros: Delivers the full desired workflow earlier.
   - Cons: High security and review complexity; GitHub sanitization decisions may block core support delivery; likely exceeds the 400-line review budget unless heavily chained.
   - Effort: High.

3. **Minimal form-to-email with attachments** — Create a simpler support form that sends email and stores less state.
   - Pros: Fastest implementation.
   - Cons: Violates the agreed direction that GitHub/email are not primary support systems; weak history, auditability, search, RLS, and async resilience.
   - Effort: Low/Medium, but architecturally wrong for the stated goal.

## Recommendation

Proceed with approach 1: first-party support MVP as the transactional foundation, then add sanitized GitHub App sync as a later chained slice. This matches the agreed architecture and protects the most important invariant: Supabase/Postgres is the support system of record, while R2, Inngest, Resend, Sentry, and GitHub are bounded integrations.

Suggested chained delivery:

1. Database domain + RLS + generated types + RLS tests.
2. Support UI shell and ticket creation/history without attachments.
3. R2 attachment signing/finalization and private download flow.
4. Inngest + Resend notification workflows.
5. Sentry evidence capture and PII scrubbing.
6. Sanitized GitHub App sync.

## Risks

- PII leakage through screenshots/videos, Sentry replay, default Sentry PII, emails, or GitHub issue bodies.
- R2 has no native Supabase RLS; authorization must happen in the app before issuing upload/download URLs.
- Large videos can exceed Next.js Server Action/body limits if not uploaded directly to R2.
- Attachment cleanup and idempotency must be explicit or orphaned objects/duplicate emails/issues will accumulate.
- Support role boundaries are not yet defined; reusing admin/pastor may be too broad or too restrictive.
- GitHub sync can accidentally become the operational support queue unless UI/process keeps Supabase as the primary system.
- Adding all integrations in one PR would exceed the 400-line review budget; chained PRs are necessary.

## Open Product Questions

- Who is allowed to view and answer support tickets: only admin/pastor, a new `support` role, campus-scoped directors, or a combination?
- What attachment limits are acceptable for the MVP: max files per ticket, max screenshot size, max video size, and retention duration?
- Should GitHub issue creation be manual approval only, automatic for severity/category, or disabled until support staff triages?
- What diagnostic evidence can be attached by default, and what requires explicit user consent?
- What ticket SLA/status taxonomy should users see (`open`, `in_review`, `waiting_on_user`, `resolved`, etc.)?

## First-Slice Boundary

The safest first slice is: authenticated `/ayuda` entry point, `support_tickets` + messages/events tables, RLS, ticket creation, ticket history, support queue for authorized staff, and no external GitHub sync yet. R2 can be included in slice 1 only if attachment limits and consent copy are decided before proposal; otherwise make attachments slice 2.

## Ready for Proposal

Yes — with product clarification required around support roles, attachment limits, diagnostic consent, GitHub approval policy, and visible ticket status/SLA semantics.
