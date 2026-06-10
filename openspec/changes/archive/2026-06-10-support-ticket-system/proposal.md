# Proposal: Support Ticket System

## Intent

Build a first-party support system so authenticated users can report problems, track status, and receive replies while Supabase remains source of truth. This reduces ambiguity, protects data, and gives staff a searchable queue.

## Scope

### In Scope
- Authenticated `/ayuda` home, ticket create/history/detail, staff queue, replies, statuses: `received`, `in_review`, `in_progress`, `resolved`, `closed`.
- Supabase tables/RLS for tickets, messages, R2 metadata, audit events, capabilities, and FTS.
- Private R2 attachments: screenshots up to 10MB, max 5; one video up to 100MB; 150MB total; signed URLs, MIME sniffing, cleanup.
- Minimal evidence: route, browser, OS, viewport, timestamp, internal user id, capabilities, app/build version, Sentry id, user steps, attachments.

### Out of Scope
- GitHub issue sync; later only after AI/subagent investigation confirms engineering issue.
- Raw Sentry payloads, tokens, cookies, passwords, localStorage, automatic replay/video capture, public R2 files, or base64 attachments.

## Capabilities

### New Capabilities
- `support-ticketing`: Ticket lifecycle, history, staff queue, messages, statuses, access by global admin plus `support.view`, `support.reply`, `support.manage`.
- `support-attachments`: Private R2 upload/finalization/download and policy enforcement.
- `support-notifications`: Inngest/Resend acknowledgement and update emails.
- `support-evidence`: Privacy-safe diagnostics and Sentry references.

### Modified Capabilities
- None.

## Approach

Use Supabase Auth/Postgres/RLS as system of record, R2 for private blobs, Inngest for post-commit jobs, Resend for emails, and Sentry for references. First slice: database domain + RLS/tests + generated types, then chained PRs for UI, R2, notifications, evidence hardening, and later GitHub sync.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/(auth)/ayuda/**` | New | Support surfaces |
| `supabase/migrations/**` | New | Support schema, RLS, FTS indexes |
| `lib/actions/**`, `app/api/support/**` | New | Mutations and signed URLs |
| `components/ui/*` | Modified | Replace Ayuda toasts with navigation |
| `emails/**`, `lib/email/**` | Modified | Support notifications |
| `instrumentation-client.ts`, `sentry.*.config.ts` | Modified | PII-safe evidence controls |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| PII leakage | High | Explicit consent, allowlists, scrubbing, private URLs |
| R2 bypasses RLS | Med | Authorize before every signed URL |
| Oversized PRs | High | Force chained PRs under 400 changed lines |

## Rollback Plan

Disable `/ayuda` navigation, pause Inngest/email sends, revoke R2 signing, and revert migrations before production data; after data exists, archive tickets/objects before dropping schema.

## Dependencies

- Cloudflare R2 credentials/bucket, Inngest Hobby, Resend Free, existing Sentry, Supabase migrations/types.

## Success Criteria

- [ ] Users can submit, view, and reply with secure attachments.
- [ ] Authorized support staff can triage/search without role explosion.
- [ ] RLS/tests deny anonymous and IDOR access.
- [ ] Notifications are idempotent and contain no sensitive evidence.
